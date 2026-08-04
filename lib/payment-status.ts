import type { OrderPaymentStatus, OrderStatus } from "@/lib/generated/prisma/client";
import { isOverdue } from "@/lib/dates";

/**
 * Derivação do estado financeiro do pedido — fonte única.
 *
 * Lista, detalhe, painel, relatórios e CSV chamam daqui. Se cada tela
 * decidisse por conta própria o que é "atrasado" ou "parcial", elas
 * divergiriam no primeiro caso de borda — e caso de borda com dinheiro é
 * exatamente onde alguém percebe primeiro.
 */

export interface LedgerSummary {
  /** Soma de PAYMENT menos soma de REFUND. Nunca negativo — o service garante. */
  netPaid: number;
  /** Houve ao menos um PAYMENT algum dia, mesmo que estornado depois. */
  hasPayments: boolean;
  /** Houve ao menos um REFUND. */
  hasRefunds: boolean;
}

/**
 * Deriva o `paymentStatus` a partir do pedido e do ledger.
 *
 * `REFUNDED` exige história, não só saldo: um pedido pago e depois estornado
 * volta a saldo zero, igualzinho a um que nunca foi pago. Sem olhar se houve
 * pagamento e estorno, os dois seriam PENDING, e o financeiro perderia a
 * diferença entre "nunca pagou" e "pagou e foi devolvido".
 *
 * Estorno **parcial** de um pedido pago devolve PARTIAL, não REFUNDED — ainda
 * há dinheiro da empresa retido.
 */
export function derivePaymentStatus(
  order: { status: OrderStatus; total: number },
  ledger: LedgerSummary,
): OrderPaymentStatus {
  if (order.status === "CANCELLED") return "CANCELLED";

  if (ledger.netPaid <= 0) {
    // Zerado por estorno é diferente de nunca ter sido pago.
    return ledger.hasPayments && ledger.hasRefunds ? "REFUNDED" : "PENDING";
  }

  return ledger.netPaid >= order.total ? "PAID" : "PARTIAL";
}

/** Quanto ainda falta receber. Nunca negativo: pagar a mais é bloqueado. */
export function remainingAmount(order: { total: number; paidAmount: number }): number {
  return Math.max(0, order.total - order.paidAmount);
}

/**
 * Pedido em atraso: venceu e ainda falta receber.
 *
 * Reaproveita `isOverdue` de lib/dates.ts, que já resolve as quatro
 * armadilhas desta comparação — fuso de Brasília, data contra horário, fim do
 * dia de vencimento e data nula. Escrever `dueDate < new Date()` aqui marcaria
 * o pedido como atrasado às 21h do dia ANTERIOR ao vencimento.
 *
 * Pedido cancelado nunca está atrasado: não há o que receber.
 */
export function isOrderOverdue(
  order: {
    status: OrderStatus;
    dueDate: Date | null;
    total: number;
    paidAmount: number;
  },
  now: Date = new Date(),
): boolean {
  if (order.status === "CANCELLED") return false;
  if (remainingAmount(order) <= 0) return false;
  return isOverdue(order.dueDate, now);
}
