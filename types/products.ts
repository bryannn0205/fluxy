import type { Product } from "@/lib/generated/prisma/client";

// Prisma's Decimal não pode cruzar a fronteira Server -> Client Component
// (React rejeita instâncias de classe em props serializadas). Client
// Components sempre recebem este tipo, nunca o Product bruto do Prisma.
export type ClientProduct = Omit<Product, "price" | "costPrice"> & {
  price: number;
  costPrice: number | null;
};

export function toClientProduct(product: Product): ClientProduct {
  return {
    ...product,
    price: Number(product.price),
    costPrice: product.costPrice !== null ? Number(product.costPrice) : null,
  };
}

// Margem em % sobre o preço de venda — null quando não há custo cadastrado
// (produto existente sem retrofit, ou brinde sem custo direto).
export function calculateMarginPercent(
  product: Pick<ClientProduct, "price" | "costPrice">,
): number | null {
  if (product.costPrice === null || product.price === 0) return null;
  return ((product.price - product.costPrice) / product.price) * 100;
}
