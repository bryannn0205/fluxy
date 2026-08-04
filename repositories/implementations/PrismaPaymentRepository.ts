import type {
  OrderPaymentStatus,
  Payment,
  PrismaClient,
} from "@/lib/generated/prisma/client";
import type { LedgerSummary } from "@/lib/payment-status";
import type {
  CreatePaymentData,
  LockedOrderState,
  PaymentRepository,
  RegisterPaymentResult,
} from "@/repositories/interfaces/PaymentRepository";
import { NotFoundError } from "@/lib/errors";

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Bloqueio pessimista de linha: a segunda requisição concorrente espera a
   * primeira commitar e então lê o `paidAmount` já atualizado.
   *
   * A alternativa era isolamento Serializable, que **aborta** a transação
   * perdedora e exige laço de retry em toda operação financeira — e retry em
   * código que move dinheiro é onde nasce pagamento duplicado. Aqui o lock é
   * de uma linha só, segurado por milissegundos; dois caixas lançando em
   * pedidos diferentes não se tocam.
   *
   * O `FOR UPDATE` exige SQL cru porque o Prisma não expõe row lock na API de
   * query. É a segunda query crua do projeto, depois de getRevenueByDay.
   */
  async registerWithinTransaction(
    data: CreatePaymentData,
    companyId: string,
    decidir: (estado: LockedOrderState) => {
      paidAmountAfter: number;
      statusAfter: OrderPaymentStatus;
    },
  ): Promise<RegisterPaymentResult> {
    return this.prisma.$transaction(async (tx) => {
      // O filtro por companyId vai no próprio lock: um id de outra empresa
      // não trava nada e não encontra nada.
      const travados = await tx.$queryRaw<
        { id: string; status: string; total: string; paidAmount: string }[]
      >`
        SELECT "id", "status"::text AS status, "total"::text AS total,
               "paidAmount"::text AS "paidAmount"
        FROM "Order"
        WHERE "id" = ${data.orderId}
          AND "companyId" = ${companyId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;

      const travado = travados[0];
      if (!travado) throw new NotFoundError("Pedido");

      const ledger = await this.summarizeWithin(tx, data.orderId, companyId);

      const statusAtual = await tx.order.findUniqueOrThrow({
        where: { id: data.orderId },
        select: { paymentStatus: true },
      });

      const estado: LockedOrderState = {
        id: travado.id,
        status: travado.status,
        total: Number(travado.total),
        paidAmount: Number(travado.paidAmount),
        ledger,
      };

      const decisao = decidir(estado);

      const payment = await tx.payment.create({
        data: {
          companyId,
          orderId: data.orderId,
          type: data.type,
          amount: data.amount,
          method: data.method,
          paidAt: data.paidAt,
          note: data.note,
          idempotencyKey: data.idempotencyKey,
          createdById: data.createdById,
        },
      });

      await tx.order.update({
        where: { id: data.orderId },
        data: {
          paidAmount: decisao.paidAmountAfter,
          paymentStatus: decisao.statusAfter,
        },
      });

      return {
        payment,
        paidAmountBefore: estado.paidAmount,
        paidAmountAfter: decisao.paidAmountAfter,
        statusBefore: statusAtual.paymentStatus,
        statusAfter: decisao.statusAfter,
      };
    });
  }

  async findByIdempotencyKey(key: string, companyId: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey: key } },
    });
  }

  async listByOrder(orderId: string, companyId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { orderId, companyId },
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
    });
  }

  async summarize(orderId: string, companyId: string): Promise<LedgerSummary> {
    return this.summarizeWithin(this.prisma, orderId, companyId);
  }

  private async summarizeWithin(
    client: Pick<PrismaClient, "payment">,
    orderId: string,
    companyId: string,
  ): Promise<LedgerSummary> {
    const porTipo = await client.payment.groupBy({
      by: ["type"],
      where: { orderId, companyId },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const recebido = porTipo.find((linha) => linha.type === "PAYMENT");
    const estornado = porTipo.find((linha) => linha.type === "REFUND");

    return {
      netPaid: Number(recebido?._sum.amount ?? 0) - Number(estornado?._sum.amount ?? 0),
      hasPayments: (recebido?._count._all ?? 0) > 0,
      hasRefunds: (estornado?._count._all ?? 0) > 0,
    };
  }
}
