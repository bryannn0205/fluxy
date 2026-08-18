import { VALID_ORDER_STATUS_TRANSITIONS } from "@/lib/constants";
import type { OrderStatus } from "@/lib/generated/prisma/client";

/**
 * Próxima etapa no fluxo de produção, derivada das transições reais.
 *
 * Lê `VALID_ORDER_STATUS_TRANSITIONS` em vez de repetir a sequência: uma
 * segunda cópia da máquina de estados divergiria da primeira no dia em que uma
 * etapa fosse inserida no meio — e o botão passaria a oferecer um salto que o
 * serviço recusa.
 *
 * `CANCELLED` é filtrado porque cancelar não é avançar. É uma ação de outra
 * natureza, destrutiva, que não pertence a um botão de progresso.
 *
 * @returns `null` quando não há para onde avançar (COMPLETED, CANCELLED).
 */
export function proximaEtapa(status: OrderStatus): OrderStatus | null {
  const seguintes = (VALID_ORDER_STATUS_TRANSITIONS[status] ?? []).filter(
    (destino) => destino !== "CANCELLED",
  );
  return seguintes[0] ?? null;
}

/** Verbo da ação, por etapa de destino. */
export const ROTULO_DE_AVANCO: Partial<Record<OrderStatus, string>> = {
  PROCESSING: "Iniciar produção",
  READY: "Marcar como pronto",
  COMPLETED: "Marcar como entregue",
};
