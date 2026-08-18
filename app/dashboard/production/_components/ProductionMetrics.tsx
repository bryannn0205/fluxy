"use client";

import { AlertTriangle, ClipboardList, DollarSign, PackageSearch } from "lucide-react";

import { StatCard } from "@/app/dashboard/_components/StatCard";
import { calcularIndicadores } from "@/app/dashboard/production/_components/indicadores";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ClientKanbanOrder } from "@/types/orders";

interface ProductionMetricsProps {
  /**
   * Board inteiro, SEM filtro aplicado.
   *
   * De propósito: indicador que muda a cada tecla digitada na busca deixa de
   * ser indicador e vira eco do campo de texto. "Em produção" e "Atrasados"
   * respondem pelo estado real da operação, não pelo recorte que está à vista.
   */
  orders: ClientKanbanOrder[];
  /** Do servidor: pedidos criados hoje na empresa toda, não só os do board. */
  todayOrderCount: number;
  /** `null` quando o papel não tem `reports:viewSales` — o cartão não existe. */
  todayRevenue: number | null;
}

/**
 * Indicadores do topo da Produção, de duas origens deliberadamente diferentes.
 *
 * Hoje (pedidos e faturamento) vem do servidor porque é pergunta sobre o dia
 * da empresa, e o board não conhece o dia inteiro: ele não traz cancelados nem
 * COMPLETED com mais de KANBAN_COMPLETED_WINDOW_DAYS dias. Em produção e
 * Atrasados vêm da lista carregada porque são pergunta sobre o board, e
 * derivá-los dela mantém o número coerente com o cartão durante o arrasto
 * otimista — ver `indicadores.ts`.
 *
 * Nenhum dos dois acompanha o filtro. Ver a prop `orders`.
 */
export function ProductionMetrics({
  orders,
  todayOrderCount,
  todayRevenue,
}: ProductionMetricsProps) {
  const { emProducao, atrasados } = calcularIndicadores(orders);

  return (
    // A grade acompanha o número de cartões, como no painel: sem o faturamento,
    // três colunas fecham a linha em vez de deixar um vão no fim dela.
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2",
        todayRevenue !== null ? "xl:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      <StatCard
        rotulo="Pedidos hoje"
        valor={String(todayOrderCount)}
        icone={ClipboardList}
        apoio="Criados desde a meia-noite"
      />
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

      {/* Ausente, e não vazio, para quem não tem `reports:viewSales`: o valor
          nem chega ao navegador nesse caso. Ver toDashboardStats. */}
      {todayRevenue !== null && (
        <StatCard
          rotulo="Faturamento do dia"
          valor={formatCurrency(todayRevenue)}
          icone={DollarSign}
          apoio="Pedidos de hoje, sem os cancelados"
          destaque
        />
      )}
    </div>
  );
}
