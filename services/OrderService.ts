import type { Company, OrderStatus } from "@/lib/generated/prisma/client";
import {
  ORDER_PRIORITY_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  VALID_ORDER_STATUS_TRANSITIONS,
} from "@/lib/constants";
import { CSV_BOM, toCsvDateTime, toCsvNumber, toCsvRow } from "@/lib/csv";
import { formatCalendarDate } from "@/lib/formatters";
import {
  InvalidStatusTransitionError,
  NotFoundError,
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

type GateCompany = Pick<Company, "subscriptionStatus" | "trialEndsAt">;

const ORDER_CSV_HEADERS = [
  "Número",
  "Data",
  "Cliente",
  "Documento",
  "Status",
  "Prioridade",
  "Forma de pagamento",
  "Previsão de entrega",
  "Itens",
  "Subtotal",
  "Desconto",
  "Total",
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

    if (input.discount > subtotal) {
      throw new ValidationError({
        discount: ["Desconto não pode ser maior que o subtotal"],
      });
    }

    const order = await this.repository.create(
      {
        customerId: input.customerId,
        items,
        subtotal,
        discount: input.discount,
        total: subtotal - input.discount,
        notes: input.notes,
        createdById: userId,
      },
      company.id,
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

    const order = await this.repository.findById(orderId, company.id);
    if (!order) {
      throw new NotFoundError("Pedido");
    }

    const allowedTransitions = VALID_ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowedTransitions.includes(status)) {
      throw new InvalidStatusTransitionError(order.status, status);
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

    const order = await this.repository.findById(id, company.id);
    if (!order) {
      throw new NotFoundError("Pedido");
    }

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
        String(order._count.items),
        toCsvNumber(Number(order.subtotal)),
        toCsvNumber(Number(order.discount)),
        toCsvNumber(Number(order.total)),
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
