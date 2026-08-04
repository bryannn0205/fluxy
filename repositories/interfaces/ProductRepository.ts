import type { Product } from "@/lib/generated/prisma/client";
import type { ListOptions, PaginatedResult } from "@/types/common";

export interface CreateProductData {
  sku: string;
  name: string;
  description?: string | undefined;
  price: number;
  costPrice?: number | null | undefined;
  unit: string;
  active: boolean;
  lowStockThreshold?: number | null | undefined;
}

// Ver comentário equivalente em CustomerRepository.ts sobre por que este
// tipo não deriva de Partial<CreateProductData>. stockQuantity de propósito
// fora daqui em ambos — ver comentário em schemas/product.schema.ts. costPrice
// e lowStockThreshold aceitam `null` (limpa o campo) além de `undefined`
// (não altera) — diferença que importa em update, não em create.
export interface UpdateProductData {
  sku?: string | undefined;
  name?: string | undefined;
  description?: string | undefined;
  price?: number | undefined;
  costPrice?: number | null | undefined;
  unit?: string | undefined;
  active?: boolean | undefined;
  lowStockThreshold?: number | null | undefined;
}

export interface ProductRepository {
  create(data: CreateProductData, companyId: string): Promise<Product>;
  findById(id: string, companyId: string): Promise<Product | null>;
  findBySku(sku: string, companyId: string): Promise<Product | null>;
  findManyByIds(ids: string[], companyId: string): Promise<Product[]>;
  list(companyId: string, options: ListOptions): Promise<PaginatedResult<Product>>;
  listActive(companyId: string): Promise<Product[]>;
  update(id: string, companyId: string, data: UpdateProductData): Promise<Product>;
  softDelete(id: string, companyId: string): Promise<void>;
  /**
   * Produtos que ocupam vaga: `deletedAt IS NULL`, ATIVOS OU NÃO.
   *
   * `active: false` não isenta de propósito. Se isentasse, o teto seria
   * contornável em três passos: desativar tudo, criar de novo, reativar.
   * Produto inativo continua no catálogo e volta a qualquer momento.
   */
  countNotDeleted(companyId: string): Promise<number>;
}
