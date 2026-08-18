import { startOfDaysAgoBrazil } from "@/lib/dates";
import type { OrderPriority } from "@/lib/generated/prisma/client";
import type { ClientKanbanOrder } from "@/types/orders";

export const PERIODOS_DE_FILTRO = ["TODOS", "HOJE", "SETE_DIAS"] as const;
export type PeriodoDeFiltro = (typeof PERIODOS_DE_FILTRO)[number];

export const ROTULO_DE_PERIODO: Record<PeriodoDeFiltro, string> = {
  TODOS: "Todo o board",
  HOJE: "Hoje",
  SETE_DIAS: "Últimos 7 dias",
};

export const PRIORIDADE_TODAS = "TODAS";

export interface FiltrosDeProducao {
  busca: string;
  prioridade: OrderPriority | typeof PRIORIDADE_TODAS;
  periodo: PeriodoDeFiltro;
}

export const FILTROS_LIMPOS: FiltrosDeProducao = {
  busca: "",
  prioridade: PRIORIDADE_TODAS,
  periodo: "TODOS",
};

export function haFiltroAtivo(filtros: FiltrosDeProducao): boolean {
  return (
    filtros.busca.trim() !== "" ||
    filtros.prioridade !== PRIORIDADE_TODAS ||
    filtros.periodo !== "TODOS"
  );
}

/**
 * Deixa o texto comparável: sem caixa, sem acento e sem o "#" que o número do
 * pedido ganha na tela.
 *
 * Sem tirar o acento, procurar "jose" não acharia "José" — e quem digita
 * rápido não acentua. Sem tirar o "#", copiar o número exibido no cartão
 * ("#0007") não acharia o pedido, porque o dado guardado é só "0007".
 */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/#/g, "")
    .toLowerCase();
}

/**
 * Início da janela do período, em Brasília — `null` quando não há recorte.
 *
 * "Últimos 7 dias" conta 6 dias atrás mais hoje: sete dias de calendário, não
 * 168 horas corridas. É o que a expressão significa para quem opera a fábrica.
 */
function inicioDoPeriodo(periodo: PeriodoDeFiltro, agora: Date): Date | null {
  switch (periodo) {
    case "HOJE":
      return startOfDaysAgoBrazil(0, agora);
    case "SETE_DIAS":
      return startOfDaysAgoBrazil(6, agora);
    case "TODOS":
      return null;
  }
}

/**
 * Aplica os filtros sobre os pedidos que já estão no navegador.
 *
 * Filtrar aqui, e não no servidor, é decisão consciente: o board inteiro já
 * viajou no payload inicial — cada cartão está renderizado — então um `filter`
 * sobre o array em memória responde no teclado, sem ida ao servidor. Uma
 * consulta por filtro traria dois problemas de graça: latência a cada tecla e
 * uma corrida com o arrasto otimista, capaz de devolver o cartão à coluna
 * antiga enquanto a gravação ainda está em voo. Isolamento entre empresas não
 * entra na conta porque não há consulta nova: o recorte por `companyId` já
 * aconteceu em `listForKanban`, no servidor, e este código só esconde da vista
 * o que já era da empresa de quem olha.
 *
 * O teto continua sendo `listForKanban`, que não tem `take` — se um dia o
 * board passar de alguns milhares de pedidos, o problema será o payload, não
 * este filtro.
 *
 * Recebe `agora` para o teste poder fixar o instante, como `calcularIndicadores`.
 */
export function aplicarFiltros(
  orders: ClientKanbanOrder[],
  filtros: FiltrosDeProducao,
  agora: Date = new Date(),
): ClientKanbanOrder[] {
  const busca = normalizar(filtros.busca.trim());
  const desde = inicioDoPeriodo(filtros.periodo, agora);

  return orders.filter((order) => {
    if (
      filtros.prioridade !== PRIORIDADE_TODAS &&
      order.priority !== filtros.prioridade
    ) {
      return false;
    }

    if (desde && order.createdAt < desde) {
      return false;
    }

    if (busca) {
      const alvo = `${normalizar(order.orderNumber)} ${normalizar(order.customer.name)}`;
      if (!alvo.includes(busca)) return false;
    }

    return true;
  });
}
