import { Skeleton } from "@/components/ui/skeleton";

/**
 * Espelha a composição real: cabeçalho com ícone, dois indicadores e quatro
 * colunas. Um esqueleto com outra forma faz o conteúdo "pular" ao chegar, que
 * é justamente o que ele deveria evitar.
 */
export default function ProductionLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3.5">
        <Skeleton className="size-11 shrink-0 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-[8.5rem] rounded-2xl" />
        ))}
      </div>

      <div
        className="grid auto-cols-[86%] grid-flow-col gap-4 sm:auto-cols-[46%] lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-4"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Carregando produção</span>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3"
          >
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
