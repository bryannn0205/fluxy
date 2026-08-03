import type { StockMovement, StockMovementReason } from "@/lib/generated/prisma/client";

export interface CreateStockAdjustmentData {
  productId: string;
  reason: Extract<StockMovementReason, "RESTOCK" | "ADJUSTMENT">;
  // Sinal explícito: positivo = entrada, negativo = saída.
  quantityDelta: number;
  note?: string | null | undefined;
  createdById: string;
}

export type StockMovementWithUser = StockMovement & {
  createdBy: { id: string; name: string };
};

export type StockMovementWithProduct = StockMovementWithUser & {
  product: { id: string; name: string; sku: string };
};

export interface StockRepository {
  /**
   * Cria o movimento e atualiza Product.stockQuantity atomicamente.
   * @throws {NotFoundError} Produto não existe nesta empresa
   * @throws {ValidationError} Resultaria em estoque negativo
   */
  adjust(data: CreateStockAdjustmentData, companyId: string): Promise<StockMovement>;
  // Inclui product mesmo aqui (produto já conhecido pelo chamador) para que
  // StockMovementHistory aceite o mesmo tipo desta e de listRecentMovements,
  // sem duas variantes de componente.
  listMovements(
    productId: string,
    companyId: string,
  ): Promise<StockMovementWithProduct[]>;
  /** Feed de atividade recente da empresa inteira, para a página de Estoque. */
  listRecentMovements(
    companyId: string,
    limit: number,
  ): Promise<StockMovementWithProduct[]>;
}
