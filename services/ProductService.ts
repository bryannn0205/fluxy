import type { Company, Product } from "@/lib/generated/prisma/client";
import { DuplicateSkuError, NotFoundError } from "@/lib/errors";
import type { ProductRepository } from "@/repositories/interfaces/ProductRepository";
import type { CreateProductInput, UpdateProductInput } from "@/schemas/product.schema";
import type { ListOptions, PaginatedResult } from "@/types/common";
import type { AuditService } from "@/services/AuditService";
import type { SubscriptionGateService } from "@/services/SubscriptionGateService";

type GateCompany = Pick<Company, "subscriptionStatus" | "trialEndsAt">;

// "" (campo limpo no formulário) vira null (remove o valor no banco);
// undefined (campo ausente de um update parcial) permanece undefined (não
// altera). Não usa `value || null`: costPrice=0 é um valor válido (ex.:
// brinde), e `||` o confundiria com "vazio".
function toNullableNumber(value: number | "" | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  return value === "" ? null : value;
}

export class ProductService {
  constructor(
    private readonly repository: ProductRepository,
    private readonly auditService: AuditService,
    private readonly subscriptionGate: SubscriptionGateService,
  ) {}

  async create(
    input: CreateProductInput,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<Product> {
    this.subscriptionGate.assertCanWrite(company);

    const existing = await this.repository.findBySku(input.sku, company.id);
    if (existing) {
      throw new DuplicateSkuError(input.sku);
    }

    const product = await this.repository.create(
      {
        ...input,
        costPrice: toNullableNumber(input.costPrice),
        lowStockThreshold: toNullableNumber(input.lowStockThreshold),
      },
      company.id,
    );

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "CREATE",
      resource: "product",
      resourceId: product.id,
    });

    return product;
  }

  async update(
    id: string,
    input: UpdateProductInput,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<Product> {
    this.subscriptionGate.assertCanWrite(company);

    if (input.sku) {
      const existing = await this.repository.findBySku(input.sku, company.id);
      if (existing && existing.id !== id) {
        throw new DuplicateSkuError(input.sku);
      }
    }

    const product = await this.repository.update(id, company.id, {
      ...input,
      costPrice: toNullableNumber(input.costPrice),
      lowStockThreshold: toNullableNumber(input.lowStockThreshold),
    });

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "UPDATE",
      resource: "product",
      resourceId: product.id,
    });

    return product;
  }

  async delete(
    id: string,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<void> {
    this.subscriptionGate.assertCanWrite(company);

    const product = await this.repository.findById(id, company.id);
    if (!product) {
      throw new NotFoundError("Produto");
    }

    await this.repository.softDelete(id, company.id);

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "DELETE",
      resource: "product",
      resourceId: id,
    });
  }

  async findById(id: string, companyId: string): Promise<Product | null> {
    return this.repository.findById(id, companyId);
  }

  async list(companyId: string, options: ListOptions): Promise<PaginatedResult<Product>> {
    return this.repository.list(companyId, options);
  }

  async listActive(companyId: string): Promise<Product[]> {
    return this.repository.listActive(companyId);
  }

  // Filtra em memória sobre listActive (catálogo de uma PME é naturalmente
  // pequeno) em vez de uma query dedicada: Prisma não compara duas colunas
  // da mesma linha (stockQuantity <= lowStockThreshold) sem SQL bruto, que
  // não se justifica nesta escala. Produtos sem threshold definido nunca
  // entram no alerta.
  async listLowStock(companyId: string): Promise<Product[]> {
    const products = await this.repository.listActive(companyId);
    return products.filter(
      (product) =>
        product.lowStockThreshold != null &&
        product.stockQuantity <= product.lowStockThreshold,
    );
  }
}
