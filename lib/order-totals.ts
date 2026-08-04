import { ValidationError } from "@/lib/errors";

/**
 * Cálculo financeiro do pedido — o único lugar onde o total é formado.
 *
 * Antes desta função a fórmula vivia em dois lugares: `OrderService.create`
 * fazia `subtotal - discount` e o `CreateOrderDialog` repetia a conta para
 * mostrar o total ao vivo. Duas cópias da mesma regra é uma cópia que vai
 * ficar para trás — e no dia em que taxa de entrega entrou, a tela passaria a
 * mostrar um número diferente do que o servidor grava.
 *
 * O formulário importa daqui para a prévia; o servidor importa daqui para
 * gravar. Divergir passa a ser impossível.
 */

export interface OrderAmounts {
  subtotal: number;
  deliveryFee: number;
  surcharge: number;
  discount: number;
}

export interface OrderTotals extends OrderAmounts {
  total: number;
}

/**
 * total = subtotal + taxa de entrega + acréscimo − desconto
 *
 * Puro e sem validação: serve tanto à prévia no formulário (onde números
 * inválidos são normais enquanto se digita) quanto ao servidor, que valida
 * antes com {@link assertValidOrderAmounts}.
 */
export function calculateOrderTotal(amounts: OrderAmounts): number {
  return amounts.subtotal + amounts.deliveryFee + amounts.surcharge - amounts.discount;
}

export function buildOrderTotals(amounts: OrderAmounts): OrderTotals {
  return { ...amounts, total: calculateOrderTotal(amounts) };
}

/**
 * Valida os valores antes de gravar.
 *
 * O teto do desconto é `subtotal + deliveryFee + surcharge`, e não só o
 * subtotal: um desconto de cortesia pode cobrir a entrega. O que não pode é o
 * total ficar negativo — aí a empresa estaria devendo ao cliente, e isso é
 * estorno, não pedido.
 *
 * @throws {ValidationError} Valor negativo ou desconto que zera o pedido abaixo de zero
 */
export function assertValidOrderAmounts(amounts: OrderAmounts): void {
  const erros: Record<string, string[]> = {};

  if (amounts.deliveryFee < 0) {
    erros.deliveryFee = ["Taxa de entrega não pode ser negativa"];
  }
  if (amounts.surcharge < 0) {
    erros.surcharge = ["Acréscimo não pode ser negativo"];
  }
  if (amounts.discount < 0) {
    erros.discount = ["Desconto não pode ser negativo"];
  }

  if (Object.keys(erros).length === 0 && calculateOrderTotal(amounts) < 0) {
    erros.discount = ["Desconto não pode ser maior que o valor do pedido"];
  }

  if (Object.keys(erros).length > 0) {
    throw new ValidationError(erros);
  }
}
