import type { PrismaClient, StockMovement } from "@/lib/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type {
  CreateStockAdjustmentData,
  StockMovementWithProduct,
  StockRepository,
} from "@/repositories/interfaces/StockRepository";

// Histórico por produto é naturalmente limitado pelo ritmo de uso de uma
// PME (não milhões de linhas) — um teto simples evita crescimento
// ilimitado sem exigir paginação completa nesta V1.
const MAX_MOVEMENTS_PER_PRODUCT = 100;

export class PrismaStockRepository implements StockRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async adjust(
    data: CreateStockAdjustmentData,
    companyId: string,
  ): Promise<StockMovement> {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: data.productId, companyId, deletedAt: null },
        select: { stockQuantity: true },
      });

      if (!product) {
        throw new NotFoundError("Produto");
      }

      const balanceAfter = product.stockQuantity + data.quantityDelta;
      if (balanceAfter < 0) {
        throw new ValidationError({
          quantity: ["Quantidade maior que o estoque disponível"],
        });
      }

      await tx.product.update({
        where: { id: data.productId },
        data: { stockQuantity: balanceAfter },
      });

      return tx.stockMovement.create({
        data: {
          companyId,
          productId: data.productId,
          reason: data.reason,
          quantityDelta: data.quantityDelta,
          balanceAfter,
          note: data.note ?? null,
          createdById: data.createdById,
        },
      });
    });
  }

  async listMovements(
    productId: string,
    companyId: string,
  ): Promise<StockMovementWithProduct[]> {
    return this.prisma.stockMovement.findMany({
      where: { productId, companyId },
      include: {
        createdBy: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, sku: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_MOVEMENTS_PER_PRODUCT,
    });
  }

  async listRecentMovements(
    companyId: string,
    limit: number,
  ): Promise<StockMovementWithProduct[]> {
    return this.prisma.stockMovement.findMany({
      where: { companyId },
      include: {
        createdBy: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, sku: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
