import type { OrderStatus, Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { overdueCutoff, startOfMonthBrazil } from "@/lib/dates";
import {
  EXPORT_BATCH_SIZE,
  KANBAN_COMPLETED_WINDOW_DAYS,
  PAGINATION,
} from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import { emptyToNull, stripUndefined } from "@/lib/utils";
import type {
  CreateOrderData,
  OrderExportOptions,
  OrderListOptions,
  OrderRepository,
  OrderStats,
  UpdateOrderDetailsData,
} from "@/repositories/interfaces/OrderRepository";
import type { PaginatedResult } from "@/types/common";
import type {
  KanbanOrder,
  OrderExportRow,
  OrderListItem,
  OrderWithRelations,
} from "@/types/orders";

const ORDER_INCLUDE = {
  customer: true,
  items: true,
  createdBy: { select: { id: true, name: true } },
  attachments: {
    where: { deletedAt: null },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  },
  auditLogs: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  },
} as const;

const ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  total: true,
  createdAt: true,
  customer: { select: { id: true, name: true } },
} as const;

const ORDER_KANBAN_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  priority: true,
  expectedDeliveryDate: true,
  total: true,
  createdAt: true,
  customer: { select: { id: true, name: true } },
} as const;

const ORDER_EXPORT_SELECT = {
  id: true,
  orderNumber: true,
  createdAt: true,
  status: true,
  priority: true,
  paymentMethod: true,
  expectedDeliveryDate: true,
  dueDate: true,
  subtotal: true,
  discount: true,
  deliveryFee: true,
  surcharge: true,
  total: true,
  paidAmount: true,
  paymentStatus: true,
  notes: true,
  customer: { select: { name: true, document: true } },
  _count: { select: { items: true } },
} as const;

/**
 * Filtro compartilhado por `list` e `streamForExport`, para que a exportação
 * devolva exatamente o mesmo conjunto que a tela mostra. Se os dois montassem
 * o `where` separadamente, um filtro novo entraria em um e não no outro, e a
 * planilha divergiria da tela sem ninguém perceber.
 */
function buildOrderFilter(
  companyId: string,
  {
    search,
    status,
    customerId,
  }: Pick<OrderListOptions, "search" | "status" | "customerId">,
): Prisma.OrderWhereInput {
  return {
    companyId,
    deletedAt: null,
    ...(status && { status }),
    ...(customerId && { customerId }),
    ...(search && {
      OR: [
        { orderNumber: { contains: search, mode: "insensitive" as const } },
        { customer: { name: { contains: search, mode: "insensitive" as const } } },
      ],
    }),
  };
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateOrderData, companyId: string): Promise<OrderWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id: companyId },
        data: { nextOrderNumber: { increment: 1 } },
        select: { nextOrderNumber: true },
      });

      const orderNumber = String(company.nextOrderNumber - 1).padStart(4, "0");

      const order = await tx.order.create({
        data: {
          companyId,
          orderNumber,
          customerId: data.customerId,
          subtotal: data.subtotal,
          discount: data.discount,
          deliveryFee: data.deliveryFee,
          surcharge: data.surcharge,
          total: data.total,
          notes: emptyToNull(data.notes),
          createdById: data.createdById,
          items: {
            create: data.items.map((item) => ({
              companyId,
              productId: item.productId,
              productName: item.productName,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              total: item.total,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });

      // Débito de estoque na criação (não em algum status intermediário do
      // Kanban): o pedido já reflete um compromisso de venda a partir daqui.
      // Sequencial, não Promise.all — o mesmo produto pode aparecer em mais
      // de um item do pedido, e balanceAfter precisa refletir cada débito
      // na ordem em que foi aplicado.
      for (const item of data.items) {
        const product = await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
          select: { stockQuantity: true },
        });

        await tx.stockMovement.create({
          data: {
            companyId,
            productId: item.productId,
            reason: "SALE",
            quantityDelta: -item.quantity,
            balanceAfter: product.stockQuantity,
            orderId: order.id,
            createdById: data.createdById,
          },
        });
      }

      return order;
    });
  }

  // Compartilhado por updateStatus (transição para CANCELLED) e softDelete
  // (exclusão de pedido ainda não cancelado) — ambos repõem o mesmo jeito o
  // estoque debitado na criação.
  private async restoreStockForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const items = await tx.orderItem.findMany({ where: { orderId } });

    for (const item of items) {
      const product = await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { increment: item.quantity } },
        select: { stockQuantity: true },
      });

      await tx.stockMovement.create({
        data: {
          companyId,
          productId: item.productId,
          reason: "CANCELLATION",
          quantityDelta: item.quantity,
          balanceAfter: product.stockQuantity,
          orderId,
          createdById: userId,
        },
      });
    }
  }

  async findById(id: string, companyId: string): Promise<OrderWithRelations | null> {
    return this.prisma.order.findFirst({
      where: { id, companyId, deletedAt: null },
      include: ORDER_INCLUDE,
    });
  }

  async findByNumber(
    orderNumber: string,
    companyId: string,
  ): Promise<OrderWithRelations | null> {
    return this.prisma.order.findFirst({
      where: { orderNumber, companyId, deletedAt: null },
      include: ORDER_INCLUDE,
    });
  }

  async list(
    companyId: string,
    {
      page = 1,
      pageSize = PAGINATION.DEFAULT_PAGE_SIZE,
      search,
      status,
      customerId,
    }: OrderListOptions,
  ): Promise<PaginatedResult<OrderListItem>> {
    const where = buildOrderFilter(companyId, { search, status, customerId });

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: ORDER_LIST_SELECT,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async *streamForExport(
    companyId: string,
    options: OrderExportOptions,
  ): AsyncGenerator<OrderExportRow> {
    const where = buildOrderFilter(companyId, options);
    let cursor: string | undefined;

    for (;;) {
      const batch = await this.prisma.order.findMany({
        where,
        select: ORDER_EXPORT_SELECT,
        // `createdAt` sozinho não desempata: dois pedidos no mesmo instante
        // fariam o cursor pular ou repetir linhas na virada do lote. O `id`
        // é único, então a ordem total é determinística.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: EXPORT_BATCH_SIZE,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      if (batch.length === 0) return;

      yield* batch;

      if (batch.length < EXPORT_BATCH_SIZE) return;
      cursor = batch[batch.length - 1]!.id;
    }
  }

  async listForKanban(companyId: string): Promise<KanbanOrder[]> {
    const completedSince = new Date();
    completedSince.setDate(completedSince.getDate() - KANBAN_COMPLETED_WINDOW_DAYS);

    return this.prisma.order.findMany({
      where: {
        companyId,
        deletedAt: null,
        OR: [
          { status: { in: ["PENDING", "PROCESSING", "READY"] } },
          { status: "COMPLETED", updatedAt: { gte: completedSince } },
        ],
      },
      select: ORDER_KANBAN_SELECT,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
  }

  async updateStatus(
    id: string,
    companyId: string,
    status: OrderStatus,
    userId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id, companyId },
        data: { status },
      });

      if (result.count === 0) {
        throw new NotFoundError("Order");
      }

      if (status === "CANCELLED") {
        await this.restoreStockForOrder(tx, id, companyId, userId);
      }
    });
  }

  async updateDetails(
    id: string,
    companyId: string,
    data: UpdateOrderDetailsData,
  ): Promise<void> {
    const result = await this.prisma.order.updateMany({
      where: { id, companyId },
      data: stripUndefined({ ...data }),
    });

    if (result.count === 0) {
      throw new NotFoundError("Order");
    }
  }

  async softDelete(id: string, companyId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Lido dentro da transação (não reaproveitado de uma leitura anterior
      // do chamador) para não repor estoque com base num status que pode
      // ter mudado entre a checagem do Service e esta escrita.
      const order = await tx.order.findFirst({
        where: { id, companyId },
        select: { status: true },
      });

      if (!order) return;

      await tx.order.updateMany({
        where: { id, companyId },
        data: { deletedAt: new Date() },
      });

      // Se já estava CANCELLED, o estoque já foi reposto por updateStatus —
      // repor de novo aqui duplicaria a entrada.
      if (order.status !== "CANCELLED") {
        await this.restoreStockForOrder(tx, id, companyId, userId);
      }
    });
  }

  async getStats(companyId: string): Promise<OrderStats> {
    const now = new Date();
    const startOfMonth = startOfMonthBrazil(now);

    const [monthAgg, pendingCount, processingCount, readyCount, overdueCount] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: {
            companyId,
            deletedAt: null,
            createdAt: { gte: startOfMonth },
            status: { not: "CANCELLED" },
          },
          _sum: { total: true },
          _count: true,
        }),
        this.prisma.order.count({
          where: { companyId, deletedAt: null, status: "PENDING" },
        }),
        this.prisma.order.count({
          where: { companyId, deletedAt: null, status: "PROCESSING" },
        }),
        this.prisma.order.count({
          where: { companyId, deletedAt: null, status: "READY" },
        }),
        this.prisma.order.count({
          where: {
            companyId,
            deletedAt: null,
            status: { notIn: ["COMPLETED", "CANCELLED"] },
            expectedDeliveryDate: { lt: overdueCutoff(now) },
          },
        }),
      ]);

    return {
      monthRevenue: Number(monthAgg._sum.total ?? 0),
      monthOrderCount: monthAgg._count,
      pendingCount,
      processingCount,
      readyCount,
      overdueCount,
    };
  }
}
