"use client";

import { AlertTriangle, PackageSearch } from "lucide-react";

import { StatCard } from "@/app/dashboard/_components/StatCard";
import { calcularIndicadores } from "@/app/dashboard/production/_components/indicadores";
import type { ClientKanbanOrder } from "@/types/orders";

/**
 * Indicadores do board de Produção. O cálculo vive em `indicadores.ts` — ver
 * lá por que ele é derivado da lista e não de uma segunda consulta.
 *
 * Faturamento do dia e pedidos de hoje NÃO entram aqui: exigem janela de tempo
 * que `getStats` ainda não expõe, e o faturamento depende de `reports:viewSales`.
 * Os dois chegam na etapa que mexe na consulta.
 */
export function ProductionMetrics({ orders }: { orders: ClientKanbanOrder[] }) {
  const { emProducao, atrasados } = calcularIndicadores(orders);

  return (
    // Largura limitada porque são dois cartões, não quatro: esticados na tela
    // inteira, o número fica solto num campo vazio e o bloco perde densidade.
    // O teto sai quando os indicadores do dia entrarem e a fila virar quatro.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl">
      <StatCard
        rotulo="Em produção"
        valor={String(emProducao)}
        icone={PackageSearch}
        apoio={
          emProducao === 1 ? "1 pedido nesta etapa" : `${emProducao} pedidos nesta etapa`
        }
      />
      <StatCard
        rotulo="Atrasados"
        valor={String(atrasados)}
        icone={AlertTriangle}
        apoio={
          atrasados === 0 ? "Nenhum prazo vencido" : "Previsão de entrega já vencida"
        }
      />
    </div>
  );
}
