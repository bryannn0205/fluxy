import { isOverdue } from "@/lib/dates";
import type { ClientKanbanOrder } from "@/types/orders";

export interface IndicadoresDeProducao {
  emProducao: number;
  atrasados: number;
}

/**
 * Indicadores do board, derivados dos pedidos já carregados.
 *
 * Não é atalho para evitar uma consulta: `listForKanban` traz PENDING,
 * PROCESSING e READY sem recorte de data — exatamente o conjunto que
 * `getStats` usa para `processingCount` e `overdueCount` (status fora de
 * COMPLETED/CANCELLED). Os números batem por construção, e derivá-los da mesma
 * lista que está na tela garante que continuem batendo durante o arrasto
 * otimista, em vez de ficarem um `router.refresh()` atrás.
 *
 * `atrasados` exclui COMPLETED pela mesma razão que `getStats`: pedido
 * entregue não está atrasado, mesmo que a data prevista tenha passado.
 *
 * Recebe `agora` para o teste poder fixar o instante — atraso depende de
 * "hoje", e um teste que usa o relógio real quebra sozinho com o tempo.
 */
export function calcularIndicadores(
  orders: ClientKanbanOrder[],
  agora: Date = new Date(),
): IndicadoresDeProducao {
  return {
    emProducao: orders.filter((order) => order.status === "PROCESSING").length,
    atrasados: orders.filter(
      (order) =>
        order.status !== "COMPLETED" && isOverdue(order.expectedDeliveryDate, agora),
    ).length,
  };
}
