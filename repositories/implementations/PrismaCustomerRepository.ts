import type { Customer, PrismaClient } from "@/lib/generated/prisma/client";
import { PAGINATION } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import { emptyToNull } from "@/lib/utils";
import type {
  CreateCustomerData,
  CustomerRepository,
  CustomerStats,
  UpdateCustomerData,
} from "@/repositories/interfaces/CustomerRepository";
import type { ListOptions, PaginatedResult } from "@/types/common";

// Um formulário reenvia o registro inteiro — não faz PATCH esparso — então
// tanto create quanto update normalizam os mesmos campos opcionais para null.
function nullableFields(data: CreateCustomerData | UpdateCustomerData) {
  return {
    email: emptyToNull(data.email),
    phone: emptyToNull(data.phone),
    document: emptyToNull(data.document),
    address: emptyToNull(data.address),
    notes: emptyToNull(data.notes),
  };
}

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateCustomerData, companyId: string): Promise<Customer> {
    return this.prisma.customer.create({
      data: { ...nullableFields(data), name: data.name, companyId },
    });
  }

  async findById(id: string, companyId: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({
      where: { id, companyId, deletedAt: null },
    });
  }

  async list(
    companyId: string,
    { page = 1, pageSize = PAGINATION.DEFAULT_PAGE_SIZE, search }: ListOptions,
  ): Promise<PaginatedResult<Customer>> {
    const where = {
      companyId,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: "asc" },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async listActive(companyId: string): Promise<Customer[]> {
    return this.prisma.customer.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  async update(
    id: string,
    companyId: string,
    data: UpdateCustomerData,
  ): Promise<Customer> {
    const result = await this.prisma.customer.updateMany({
      where: { id, companyId },
      data: { ...nullableFields(data), ...(data.name && { name: data.name }) },
    });

    if (result.count === 0) {
      throw new NotFoundError();
    }

    // updateMany não retorna a linha atualizada — busca de novo.
    const customer = await this.findById(id, companyId);
    if (!customer) {
      throw new NotFoundError();
    }

    return customer;
  }

  async countNotDeleted(companyId: string): Promise<number> {
    return this.prisma.customer.count({ where: { companyId, deletedAt: null } });
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    await this.prisma.customer.updateMany({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    });
  }

  async getStats(customerId: string, companyId: string): Promise<CustomerStats> {
    const orderWhere = {
      customerId,
      companyId,
      deletedAt: null,
      status: { not: "CANCELLED" as const },
    };

    const [orderAgg, [topProduct]] = await Promise.all([
      this.prisma.order.aggregate({
        where: orderWhere,
        _count: true,
        _sum: { total: true },
        _max: { createdAt: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ["productId", "productName"],
        where: { companyId, order: orderWhere },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 1,
      }),
    ]);

    const orderCount = orderAgg._count;
    const totalSpent = Number(orderAgg._sum.total ?? 0);

    return {
      orderCount,
      totalSpent,
      averageTicket: orderCount > 0 ? totalSpent / orderCount : 0,
      lastOrderAt: orderAgg._max.createdAt,
      favoriteProduct: topProduct
        ? {
            id: topProduct.productId,
            name: topProduct.productName,
            totalQuantity: topProduct._sum.quantity ?? 0,
          }
        : null,
    };
  }
}
