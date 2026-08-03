import type { PrismaClient, Product } from "@/lib/generated/prisma/client";
import { PAGINATION } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import { emptyToNull, stripUndefined } from "@/lib/utils";
import type {
  CreateProductData,
  ProductRepository,
  UpdateProductData,
} from "@/repositories/interfaces/ProductRepository";
import type { ListOptions, PaginatedResult } from "@/types/common";

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateProductData, companyId: string): Promise<Product> {
    return this.prisma.product.create({
      data: {
        ...data,
        description: emptyToNull(data.description),
        // Não há "manter valor anterior" na criação — undefined e null
        // significam a mesma coisa aqui, diferente de update().
        costPrice: data.costPrice ?? null,
        lowStockThreshold: data.lowStockThreshold ?? null,
        companyId,
      },
    });
  }

  async findById(id: string, companyId: string): Promise<Product | null> {
    return this.prisma.product.findFirst({
      where: { id, companyId, deletedAt: null },
    });
  }

  async findBySku(sku: string, companyId: string): Promise<Product | null> {
    return this.prisma.product.findFirst({
      where: { sku, companyId, deletedAt: null },
    });
  }

  async findManyByIds(ids: string[], companyId: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { id: { in: ids }, companyId, deletedAt: null },
    });
  }

  async list(
    companyId: string,
    { page = 1, pageSize = PAGINATION.DEFAULT_PAGE_SIZE, search }: ListOptions,
  ): Promise<PaginatedResult<Product>> {
    const where = {
      companyId,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { sku: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: "asc" },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async listActive(companyId: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { companyId, deletedAt: null, active: true },
      orderBy: { name: "asc" },
    });
  }

  async update(id: string, companyId: string, data: UpdateProductData): Promise<Product> {
    const result = await this.prisma.product.updateMany({
      where: { id, companyId },
      data: stripUndefined({
        ...data,
        description:
          data.description !== undefined ? emptyToNull(data.description) : undefined,
      }),
    });

    if (result.count === 0) {
      throw new NotFoundError("Product");
    }

    const product = await this.findById(id, companyId);
    if (!product) {
      throw new NotFoundError("Product");
    }

    return product;
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    await this.prisma.product.updateMany({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    });
  }
}
