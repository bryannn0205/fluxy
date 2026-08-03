import { formatCurrency, formatNumber } from "@/lib/formatters";
import type { RankingEntry } from "@/types/reports";

interface RankingBarsProps {
  entries: RankingEntry[];
  /** Sufixo da métrica secundária, ex.: "un" ou "pedidos". */
  countLabel: (count: number) => string;
  emptyMessage: string;
}

/**
 * Ranking em barras horizontais.
 *
 * Server Component — são divs com largura percentual, sem nenhuma
 * interatividade que justifique mandar JavaScript ao navegador.
 *
 * Todas as barras usam **a mesma cor**. Colorir cada uma num tom diferente
 * conforme o valor duplicaria em cor a informação que o comprimento já dá, e
 * as categorias aqui (produtos, clientes) não têm ordem natural que uma rampa
 * pudesse representar.
 */
export function RankingBars({ entries, countLabel, emptyMessage }: RankingBarsProps) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  // Escala relativa ao primeiro colocado: a barra comunica proporção dentro do
  // ranking. O guard de zero evita divisão por zero quando todo o período
  // faturou R$ 0 (possível com pedidos de valor zero).
  const max = Math.max(...entries.map((entry) => entry.revenue), 0);

  return (
    <ol className="flex flex-col gap-3.5">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium">{entry.label}</span>
            <span className="shrink-0 font-mono text-sm tabular-nums">
              {formatCurrency(entry.revenue)}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="h-1.5 flex-1 rounded-full bg-muted">
              <div
                className="h-full rounded-r-full bg-primary"
                style={{ width: max > 0 ? `${(entry.revenue / max) * 100}%` : "0%" }}
              />
            </div>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {countLabel(entry.count)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function unitsLabel(count: number): string {
  return `${formatNumber(count)} un`;
}

export function ordersLabel(count: number): string {
  return count === 1 ? "1 pedido" : `${formatNumber(count)} pedidos`;
}
