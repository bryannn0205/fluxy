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
        "group relative h-full overflow-hidden rounded-2xl border border-border bg-card/80 p-5 transition-colors duration-200 hover:border-primary/40",
        destaque && "border-primary/30 shadow-[0_0_44px_-20px] shadow-primary/80",
      )}
    >
      {/* O cartão de dinheiro ganha uma luz de canto; os de contagem ficam
          lisos, para a hierarquia entre eles ser visível de relance. */}
      {destaque && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-8 size-32 [background:radial-gradient(50%_50%_at_50%_50%,var(--panel-glow)_0%,transparent_70%)]"
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <p className="min-h-[2.4rem] pt-0.5 text-[13px] leading-snug font-medium text-muted-foreground">
          {rotulo}
        </p>
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/12 text-[var(--panel-lavender)] transition-colors duration-200 group-hover:border-primary/45 group-hover:bg-primary/20">
          <Icone className="size-[1.05rem]" aria-hidden="true" />
        </span>
      </div>

      <p className="relative mt-4 font-mono text-[2rem] leading-none font-semibold tracking-tight tabular-nums">
        {valor}
      </p>

      {apoio && (
        <p className="relative mt-2.5 text-xs text-muted-foreground/80">{apoio}</p>
      )}
    </div>
  );
}
