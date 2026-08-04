import type { Company, OrderStatus, Role } from "@/lib/generated/prisma/client";
import { assertPermission } from "@/lib/permissions";
import { assertValidOrderAmounts, buildOrderTotals } from "@/lib/order-totals";
import { remainingAmount } from "@/lib/payment-status";
import { logger } from "@/lib/logger";
import { startOfMonthBrazil, startOfNextMonthBrazil } from "@/lib/dates";
import type { PlanLimitService } from "@/services/PlanLimitService";
import { UPGRADE_PATH, limitFor } from "@/lib/plan-limits";
import {
  ORDER_PRIORITY_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  VALID_ORDER_STATUS_TRANSITIONS,
} from "@/lib/constants";
import { CSV_BOM, toCsvDateTime, toCsvNumber, toCsvRow } from "@/lib/csv";
import { formatCalendarDate } from "@/lib/formatters";
import {
  InvalidStatusTransitionError,
  NotFoundError,
  PlanLimitReachedError,
  ValidationError,
} from "@/lib/errors";
import type {
  CreateOrderItemData,
  OrderExportOptions,
} from "@/repositories/interfaces/OrderRepository";
import type {
  OrderListOptions,
  OrderRepository,
  OrderStats,
} from "@/repositories/interfaces/OrderRepository";
import type { CustomerRepository } from "@/repositories/interfaces/CustomerRepository";
import type { ProductRepository } from "@/repositories/interfaces/ProductRepository";
import type { CreateOrderInput, UpdateOrderDetailsInput } from "@/schemas/order.schema";
import type { PaginatedResult } from "@/types/common";
import type { KanbanOrder, OrderListItem, OrderWithRelations } from "@/types/orders";
import type { AuditService } from "@/services/AuditService";
import type { SubscriptionGateService } from "@/services/SubscriptionGateService";
import type { NotificationService } from "@/services/NotificationService";

// A empresa vem sempre do CompanySession resolvido por requireCompany(), que
// já carrega o papel lido do banco. Exigir `role` aqui é o que permite o guard
// de permissão viver dentro do service — o portão fica onde a regra está, não
// espalhado pelas Server Actions, onde uma chamada nova esqueceria dele.
type GateCompany = Pick<Company, "subscriptionStatus" | "trialEndsAt"> & {
  role: Role;
};

const ORDER_CSV_HEADERS = [
  "Número",
  "Data",
  "Cliente",
  "Documento",
  "Status",
  "Prioridade",
  // Forma COMBINADA no pedido. O método de cada recebimento vive em
  // Payment.method e não cabe nesta planilha, que é uma linha por pedido.
  "Forma de pagamento",
  "Previsão de entrega",
  "Vencimento",
  "Itens",
  "Subtotal",
  "Taxa de entrega",
  "Acréscimo",
  "Desconto",
  "Total",
  "Valor pago",
  "Valor restante",
  "Situação financeira",
  "Observações",
] as const;

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly productRepository: ProductRepository,
    private readonly auditService: AuditService,
    private readonly subscriptionGate: SubscriptionGateService,
    private readonly notificationService: NotificationService,
    private readonly planLimitService: PlanLimitService,
  ) {}

  /**
   * Cria um pedido. O preço de cada item é sempre resolvido a partir do
   * Product atual no servidor — nunca aceito do cliente — para impedir
   * manipulação de preço via requisição forjada.
   *
   * @throws {NotFoundError} Cliente ou algum produto não existe nesta empresa
   * @throws {ValidationError} Desconto maior que o subtotal, ou produto inativo
   */
  async create(
    input: CreateOrderInput,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<OrderWithRelations> {
    this.subscriptionGate.assertCanWrite(company);
    assertPermission(company.role, "orders", "create");

    const customer = await this.customerRepository.findById(input.customerId, company.id);
    if (!customer) {
      throw new NotFoundError("Cliente");
    }

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await this.productRepository.findManyByIds(productIds, company.id);
    const productById = new Map(products.map((product) => [product.id, product]));

    const items: CreateOrderItemData[] = input.items.map((item) => {
      const product = productById.get(item.productId);

      if (!product || !product.active) {
        throw new ValidationError({
          items: [`Produto ${item.productId} não está disponível`],
        });
      }

      const unitPrice = Number(product.price);
      return {
        productId: product.id,
        productName: product.name,
        unitPrice,
        quantity: item.quantity,
        total: unitPrice * item.quantity,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);

    // Os valores vêm do input, mas o subtotal vem SEMPRE dos preços do banco
    // (ver acima): o cliente escolhe quanto abater ou cobrar de entrega, nunca
    // quanto vale o produto. O total é formado em lib/order-totals.ts, o mesmo
    // módulo que o formulário usa para a prévia.
    const totals = buildOrderTotals({
      subtotal,
      deliveryFee: input.deliveryFee ?? 0,
      surcharge: input.surcharge ?? 0,
      discount: input.discount,
    });
    assertValidOrderAmounts(totals);

    // A cota é conferida DENTRO da transação do repositório, sob o mesmo
    // lock que gera o número do pedido — ver MonthlyQuotaCheck. Conferir aqui
    // fora deixaria a janela em que duas criações leem a mesma contagem.
    const plan = await this.planLimitService.getCurrentPlan(company.id);
    const monthlyLimit = limitFor(plan, "ordersPerMonth");
    const now = new Date();

    const order = await this.repository.create(
      {
        customerId: input.customerId,
        items,
        subtotal: totals.subtotal,
        discount: totals.discount,
        deliveryFee: totals.deliveryFee,
        surcharge: totals.surcharge,
        total: totals.total,
        notes: input.notes,
        createdById: userId,
      },
      company.id,
      monthlyLimit === null
        ? undefined
        : {
            from: startOfMonthBrazil(now),
            to: startOfNextMonthBrazil(now),
            assert: (usageInPeriod) => {
              if (usageInPeriod + 1 > monthlyLimit) {
                throw new PlanLimitReachedError(
                  "ordersPerMonth",
                  "pedidos por mês",
                  usageInPeriod,
                  monthlyLimit,
                  plan?.slug ?? "trial",
                  UPGRADE_PATH,
                );
              }
            },
          },
    );

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "CREATE",
      resource: "order",
      resourceId: order.id,
      orderId: order.id,
    });

    await this.notificationService.notifyOrderCreated({
      companyId: company.id,
      actorId: userId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer.name,
    });

    return order;
  }

  /**
   * Cancelar apaga o compromisso de venda, mas não devolve dinheiro — só o
   * estorno faz isso, e ele deixa rastro no ledger. Permitir cancelar com
   * saldo recebido criaria um pedido morto segurando dinheiro do cliente, sem
   * registro de para onde ele foi.
   *
   * A tentativa bloqueada vai para o logger estruturado, não para o AuditLog:
   * o AuditLog descreve o que **aconteceu** com os dados, e aqui nada mudou.
   * Gravar não-eventos faria "o que aconteceu com este pedido" virar ruído.
   *
   * @throws {ValidationError} Pedido com valor líquido recebido
   */
  private assertPodeCancelar(
    order: { id: string; paidAmount: unknown },
    companyId: string,
    userId: string,
  ): void {
    if (Number(order.paidAmount) <= 0) return;

    logger.warn("Cancelamento bloqueado por saldo recebido", {
      companyId,
      userId,
      resource: "order",
      resourceId: order.id,
      orderId: order.id,
      motivo: "pedido possui valor líquido recebido",
    });

    throw new ValidationError({
      status: [
        "Este pedido possui pagamentos registrados. Estorne o valor recebido antes de cancelar.",
      ],
    });
  }

  /**
   * Altera o status do pedido, respeitando as transições válidas:
   * PENDING → PROCESSING | CANCELLED
   * PROCESSING → COMPLETED | CANCELLED
   * COMPLETED / CANCELLED → (finais)
   *
   * @throws {InvalidStatusTransitionError} Transição não permitida
   */
  async updateStatus(
    orderId: string,
    status: OrderStatus,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<void> {
    this.subscriptionGate.assertCanWrite(company);
    assertPermission(company.role, "orders", "updateStatus");

    const order = await this.repository.findById(orderId, company.id);
    if (!order) {
      throw new NotFoundError("Pedido");
    }

    const allowedTransitions = VALID_ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowedTransitions.includes(status)) {
      throw new InvalidStatusTransitionError(order.status, status);
    }

    if (status === "CANCELLED") {
      this.assertPodeCancelar(order, company.id, userId);
    }

    await this.repository.updateStatus(orderId, company.id, status, userId);

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "UPDATE",
      resource: "order",
      resourceId: orderId,
      orderId,
      changes: { status: { before: order.status, after: status } },
    });

    await this.notificationService.notifyOrderStatusChanged({
      companyId: company.id,
      actorId: userId,
      orderId,
      orderNumber: order.orderNumber,
      status,
    });
  }

  /**
   * Atualiza prioridade, previsão de entrega e forma de pagamento — campos
   * editáveis a qualquer momento no ciclo de vida do pedido, independente
   * do status atual (diferente de updateStatus, que segue a máquina de
   * transições).
   *
   * @throws {NotFoundError} Pedido não existe nesta empresa
   */
  async updateDetails(
    input: UpdateOrderDetailsInput,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<void> {
    this.subscriptionGate.assertCanWrite(company);
    assertPermission(company.role, "orders", "update");

    const order = await this.repository.findById(input.orderId, company.id);
    if (!order) {
      throw new NotFoundError("Pedido");
    }

    const expectedDeliveryDate = input.expectedDeliveryDate
      ? new Date(input.expectedDeliveryDate)
      : null;
    const paymentMethod = input.paymentMethod || null;

    await this.repository.updateDetails(input.orderId, company.id, {
      priority: input.priority,
      expectedDeliveryDate,
      paymentMethod,
    });

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "UPDATE",
      resource: "order",
      resourceId: input.orderId,
      orderId: input.orderId,
      changes: {
        priority: { before: order.priority, after: input.priority },
        expectedDeliveryDate: {
          before: order.expectedDeliveryDate,
          after: expectedDeliveryDate,
        },
        paymentMethod: { before: order.paymentMethod, after: paymentMethod },
      },
    });
  }

  async delete(
    id: string,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<void> {
    this.subscriptionGate.assertCanWrite(company);
    assertPermission(company.role, "orders", "delete");

    const order = await this.repository.findById(id, company.id);
    if (!order) {
      throw new NotFoundError("Pedido");
    }

    // Excluir devolve estoque e encerra o pedido, tal qual cancelar — a mesma
    // trava vale, senão a exclusão vira a porta de fuga para sumir com um
    // pedido que tem dinheiro recebido.
    this.assertPodeCancelar(order, company.id, userId);

    await this.repository.softDelete(id, company.id, userId);

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "DELETE",
      resource: "order",
      resourceId: id,
      orderId: id,
    });

    await this.notificationService.notifyOrderDeleted({
      companyId: company.id,
      actorId: userId,
      orderId: id,
      orderNumber: order.orderNumber,
    });
  }

  async findById(id: string, companyId: string): Promise<OrderWithRelations | null> {
    return this.repository.findById(id, companyId);
  }

  /**
   * Emite o CSV linha a linha, repassando o streaming do repositório. Montar a
   * planilha inteira numa string antes de responder faria o processo segurar o
   * histórico completo da empresa em memória — o ponto de gerar em lotes.
   */
  async *streamOrdersCsv(
    companyId: string,
    options: OrderExportOptions,
  ): AsyncGenerator<string> {
    yield CSV_BOM + toCsvRow(ORDER_CSV_HEADERS);

    for await (const order of this.repository.streamForExport(companyId, options)) {
      yield toCsvRow([
        order.orderNumber,
        toCsvDateTime(order.createdAt),
        order.customer.name,
        order.customer.document ?? "",
        ORDER_STATUS_LABELS[order.status],
        ORDER_PRIORITY_LABELS[order.priority],
        order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : "",
        order.expectedDeliveryDate ? formatCalendarDate(order.expectedDeliveryDate) : "",
        order.dueDate ? formatCalendarDate(order.dueDate) : "",
        String(order._count.items),
        toCsvNumber(Number(order.subtotal)),
        toCsvNumber(Number(order.deliveryFee)),
        toCsvNumber(Number(order.surcharge)),
        toCsvNumber(Number(order.discount)),
        toCsvNumber(Number(order.total)),
        toCsvNumber(Number(order.paidAmount)),
        // Restante calculado, não gravado — mesma fonte que a tela usa.
        toCsvNumber(
          remainingAmount({
            total: Number(order.total),
            paidAmount: Number(order.paidAmount),
          }),
        ),
        PAYMENT_STATUS_LABELS[order.paymentStatus],
        order.notes ?? "",
      ]);
    }
  }

  async list(
    companyId: string,
    options: OrderListOptions,
  ): Promise<PaginatedResult<OrderListItem>> {
    return this.repository.list(companyId, options);
  }

  async getStats(companyId: string): Promise<OrderStats> {
    return this.repository.getStats(companyId);
  }

  async listForKanban(companyId: string): Promise<KanbanOrder[]> {
    return this.repository.listForKanban(companyId);
  }
}
