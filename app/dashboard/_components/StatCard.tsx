import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatCardProps {
  rotulo: string;
  valor: string;
  icone: LucideIcon;
  /** Linha de apoio: só aparece quando há algo verdadeiro a dizer. */
  apoio?: string;
  /** Destaca o cartão de dinheiro entre os de contagem. */
  destaque?: boolean;
}

/**
 * Indicador do topo do painel.
 *
 * Sem variação percentual contra o mês anterior: o `getStats` do pedido não
 * devolve o período anterior, e inventar "0% vs mês anterior" — como faz a
 * referência — seria escrever um número que ninguém calculou. Quando o
 * comparativo existir no serviço, ele entra aqui.
 */
export function StatCard({
  rotulo,
  valor,
  icone: Icone,
  apoio,
  destaque = false,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "group rounded-2xl border border-border bg-card p-5 transition-colors duration-200 hover:border-primary/35",
        destaque && "ring-1 ring-[var(--panel-glow)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{rotulo}</p>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-[var(--panel-lavender)] transition-colors duration-200 group-hover:border-primary/40">
          <Icone className="size-4" aria-hidden="true" />
        </span>
      </div>

      <p className="mt-3 font-mono text-2xl font-semibold tabular-nums">{valor}</p>

      {apoio && <p className="mt-1.5 text-xs text-muted-foreground">{apoio}</p>}
    </div>
  );
}
