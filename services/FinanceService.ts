import type { Company, Payment, Role } from "@/lib/generated/prisma/client";
import { ConflictError, ValidationError } from "@/lib/errors";
import { assertPermission } from "@/lib/permissions";
import { derivePaymentStatus, remainingAmount } from "@/lib/payment-status";
import { logger } from "@/lib/logger";
import type {
  CreatePaymentData,
  PaymentRepository,
} from "@/repositories/interfaces/PaymentRepository";
import type { RefundPaymentInput, RegisterPaymentInput } from "@/schemas/payment.schema";
import type { AuditService } from "@/services/AuditService";
import type { SubscriptionGateService } from "@/services/SubscriptionGateService";

type GateCompany = Pick<Company, "subscriptionStatus" | "trialEndsAt"> & { role: Role };

/** Campos que definem "a mesma operação" para efeito de idempotência. */
interface OperationIdentity {
  orderId: string;
  type: CreatePaymentData["type"];
  amount: number;
  method: CreatePaymentData["method"];
  paidAt: Date;
}

/**
 * Único ponto que escreve no ledger financeiro e nos caches do pedido.
 *
 * `Order.paidAmount` e `Order.paymentStatus` não aparecem em nenhum schema Zod
 * de pedido — nem em criação, nem em edição. A única porta para eles passa por
 * aqui e pelo cancelamento transacional do OrderService.
 */
export class FinanceService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly auditService: AuditService,
    private readonly subscriptionGate: SubscriptionGateService,
  ) {}

  /**
   * Registra um recebimento.
   *
   * @throws {ForbiddenError} Papel sem `finance:registerPayment`
   * @throws {ConflictError} Mesma idempotencyKey com dados diferentes
   * @throws {ValidationError} Valor acima do restante, ou pedido cancelado
   */
  async registerPayment(
    input: RegisterPaymentInput,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<Payment> {
    this.subscriptionGate.assertCanWrite(company);
    assertPermission(company.role, "finance", "registerPayment");

    return this.lancar(
      {
        orderId: input.orderId,
        type: "PAYMENT",
        amount: input.amount,
        method: input.method,
        paidAt: parseDiaComoUtc(input.paidAt),
        note: input.note || null,
        idempotencyKey: input.idempotencyKey,
        createdById: userId,
      },
      company,
      userId,
    );
  }

  /**
   * Registra um estorno. MANAGER recebe, mas não desfaz — ver a matriz.
   *
   * @throws {ForbiddenError} Papel sem `finance:refund`
   * @throws {ValidationError} Valor acima do recebido líquido
   */
  async refundPayment(
    input: RefundPaymentInput,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<Payment> {
    this.subscriptionGate.assertCanWrite(company);
    assertPermission(company.role, "finance", "refund");

    return this.lancar(
      {
        orderId: input.orderId,
        type: "REFUND",
        amount: input.amount,
        method: input.method,
        paidAt: parseDiaComoUtc(input.paidAt),
        note: input.note,
        idempotencyKey: input.idempotencyKey,
        createdById: userId,
      },
      company,
      userId,
    );
  }

  async listByOrder(orderId: string, companyId: string, role: Role): Promise<Payment[]> {
    assertPermission(role, "finance", "view");
    return this.repository.listByOrder(orderId, companyId);
  }

  private async lancar(
    data: CreatePaymentData,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<Payment> {
    const existente = await this.repository.findByIdempotencyKey(
      data.idempotencyKey,
      company.id,
    );

    if (existente) {
      return this.resolverIdempotencia(existente, data, company.id, userId);
    }

    let resultado;
    try {
      resultado = await this.repository.registerWithinTransaction(
        data,
        company.id,
        (estado) => {
          // Roda DENTRO da transação, depois do FOR UPDATE: o que se valida
          // aqui é o estado real, não uma leitura que pode ter envelhecido
          // entre a checagem e a escrita.
          if (estado.status === "CANCELLED") {
            throw new ValidationError({
              orderId: ["Não é possível movimentar o financeiro de um pedido cancelado"],
            });
          }

          const delta = data.type === "PAYMENT" ? data.amount : -data.amount;
          const depois = estado.paidAmount + delta;

          if (data.type === "PAYMENT") {
            const restante = remainingAmount({
              total: estado.total,
              paidAmount: estado.paidAmount,
            });
            if (data.amount > restante + TOLERANCIA_CENTAVO) {
              throw new ValidationError({
                amount: [`Valor acima do restante a receber (${restante.toFixed(2)})`],
              });
            }
          } else if (data.amount > estado.paidAmount + TOLERANCIA_CENTAVO) {
            throw new ValidationError({
              amount: [
                `Estorno acima do valor recebido (${estado.paidAmount.toFixed(2)})`,
              ],
            });
          }

          const ledgerDepois = {
            netPaid: depois,
            hasPayments: estado.ledger.hasPayments || data.type === "PAYMENT",
            hasRefunds: estado.ledger.hasRefunds || data.type === "REFUND",
          };

          return {
            // Arredonda para centavos: somar floats repetidamente acumula
            // resíduo, e o cache tem de bater com a soma do ledger no teste.
            paidAmountAfter: arredondarCentavos(Math.max(0, depois)),
            statusAfter: derivePaymentStatus(
              { status: estado.status as "PENDING", total: estado.total },
              ledgerDepois,
            ),
          };
        },
      );
    } catch (error) {
      // Duas requisições passaram juntas pela checagem de idempotência e a
      // constraint pegou a segunda. Reentra no caminho idempotente em vez de
      // devolver erro de banco a quem só clicou duas vezes.
      if (isUniqueViolation(error)) {
        const agora = await this.repository.findByIdempotencyKey(
          data.idempotencyKey,
          company.id,
        );
        if (agora) return this.resolverIdempotencia(agora, data, company.id, userId);
      }
      throw error;
    }

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "CREATE",
      resource: data.type === "PAYMENT" ? "payment" : "payment_refund",
      resourceId: resultado.payment.id,
      orderId: data.orderId,
      changes: {
        type: data.type,
        amount: data.amount,
        method: data.method,
        paidAmount: {
          before: resultado.paidAmountBefore,
          after: resultado.paidAmountAfter,
        },
        paymentStatus: { before: resultado.statusBefore, after: resultado.statusAfter },
      },
    });

    return resultado.payment;
  }

  /**
   * Mesma chave, mesma operação → devolve o que já existe, sem duplicar
   * ledger, auditoria ou notificação. Mesma chave, operação diferente → 409.
   *
   * Devolver sucesso para dados divergentes seria o pior dos mundos: quem
   * chamou acharia que gravou o valor novo, e o registro seguiria com o
   * antigo.
   */
  private resolverIdempotencia(
    existente: Payment,
    data: CreatePaymentData,
    companyId: string,
    userId: string,
  ): Payment {
    if (mesmaOperacao(existente, data)) return existente;

    logger.warn("Conflito de idempotência em lançamento financeiro", {
      companyId,
      userId,
      resource: "payment",
      resourceId: existente.id,
      orderId: data.orderId,
      motivo: "mesma idempotencyKey com payload diferente",
    });

    throw new ConflictError(
      "Esta chave de idempotência já foi usada com outros dados de lançamento",
    );
  }
}

// Um centavo de folga na comparação: os valores viajam como float e
// 0.1 + 0.2 > 0.3 em IEEE-754. Sem isso, pagar exatamente o restante seria
// recusado por resíduo binário — o caso mais comum de todos.
const TOLERANCIA_CENTAVO = 0.005;

function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * "YYYY-MM-DD" → meia-noite UTC daquele dia.
 *
 * Mesma convenção de expectedDeliveryDate e dueDate, o que mantém todas as
 * datas do pedido comparáveis entre si e por lib/dates.ts.
 */
function parseDiaComoUtc(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

/**
 * Compara os campos que definem a operação.
 *
 * `amount` é comparado em centavos inteiros, nunca como float: o valor volta
 * do banco como Decimal e converter os dois lados para número inteiro de
 * centavos evita que 50.00 e 50.000000001 sejam considerados diferentes.
 *
 * `paidAt` é comparado por milissegundo, que é a precisão que a coluna
 * TIMESTAMP(3) persiste — comparar mais fino geraria conflito falso.
 */
function mesmaOperacao(existente: Payment, data: CreatePaymentData): boolean {
  const identidade: OperationIdentity = {
    orderId: data.orderId,
    type: data.type,
    amount: data.amount,
    method: data.method,
    paidAt: data.paidAt,
  };

  return (
    existente.orderId === identidade.orderId &&
    existente.type === identidade.type &&
    emCentavos(existente.amount) === emCentavos(identidade.amount) &&
    existente.method === identidade.method &&
    existente.paidAt.getTime() === identidade.paidAt.getTime()
  );
}

function emCentavos(valor: { toString(): string } | number): number {
  return Math.round(Number(valor.toString()) * 100);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
