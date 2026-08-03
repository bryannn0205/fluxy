import type { Product } from "@/lib/generated/prisma/client";

// Prisma's Decimal não pode cruzar a fronteira Server -> Client Component
// (React rejeita instâncias de classe em props serializadas). Client
// Components sempre recebem este tipo, nunca o Product bruto do Prisma.
//
// `costPrice` fica de fora: custo e margem só existem para quem tem
// `products:viewCosts`. Omitir do tipo base, em vez de mandar null, faz o
// compilador cobrar a escolha em cada ponto de uso — quem precisa de custo
// pede ClientProductWithCosts explicitamente e passa pelo guard.
export type ClientProduct = Omit<Product, "price" | "costPrice"> & {
  price: number;
};

/** Produto com custo. Só monte via {@link toClientProductWithCosts}, depois de
 *  verificar `products:viewCosts` — o custo não pode chegar ao navegador de
 *  OPERATOR nem de VIEWER, nem mesmo escondido por CSS. */
export type ClientProductWithCosts = ClientProduct & {
  costPrice: number | null;
};

export function toClientProduct(product: Product): ClientProduct {
  // Desestruturação descarta costPrice do objeto — `...resto` não o carrega,
  // então ele não existe no payload serializado, e não apenas some da tipagem.
  const { costPrice: _costPrice, ...resto } = product;
  return { ...resto, price: Number(product.price) };
}

export function toClientProductWithCosts(product: Product): ClientProductWithCosts {
  return {
    ...toClientProduct(product),
    costPrice: product.costPrice !== null ? Number(product.costPrice) : null,
  };
}

// Margem em % sobre o preço de venda — null quando não há custo cadastrado
// (produto existente sem retrofit, ou brinde sem custo direto).
//
// Exige o tipo com custo: margem é custo disfarçado — quem não pode ver um
// não pode derivar o outro.
export function calculateMarginPercent(
  product: Pick<ClientProductWithCosts, "price" | "costPrice">,
): number | null {
  if (product.costPrice === null || product.price === 0) return null;
  return ((product.price - product.costPrice) / product.price) * 100;
}
