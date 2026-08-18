import { Skeleton } from "@/components/ui/skeleton";

/**
 * Espelha a composição real: cabeçalho, indicadores, barra de filtros e quatro
 * colunas. Um esqueleto com outra forma faz o conteúdo "pular" ao chegar, que é
 * justamente o que ele deveria evitar — e era o que acontecia enquanto ele
 * ainda mostrava dois indicadores estreitos e nenhuma barra de filtros.
 *
 * As alturas saem de medição da tela pronta (indicador 157px, controle de
 * filtro 32px, cartão 165px), não de estimativa.
 *
 * São quatro indicadores porque é a fila mais cheia — quem tem
 * `reports:viewSales` vê o faturamento do dia. Para os demais papéis um cartão
 * a menos aparece na troca; ler a sessão aqui resolveria, mas `loading.tsx`
 * precisa renderizar de imediato, e esperar por dado é o oposto disso.
 */
export default function ProductionLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3.5">
        <Skeleton className="size-11 shrink-0 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[9.8rem] rounded-2xl" />
          ))}
        </div>

        {/* Mesma composição da barra real: busca larga e dois seletores, que no
            celular descem para uma linha própria lado a lado. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Skeleton className="h-8 w-full rounded-md sm:max-w-xs" />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Skeleton className="h-8 w-full rounded-md sm:w-40" />
            <Skeleton className="h-8 w-full rounded-md sm:w-44" />
          </div>
        </div>

        <div
          className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:overflow-visible lg:px-0"
          role="status"
          aria-live="polite"
        >
          <span className="sr-only">Carregando produção</span>
          <div className="grid auto-cols-[86%] grid-flow-col items-stretch gap-4 sm:auto-cols-[46%] lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, coluna) => (
              <div
                key={coluna}
                className="flex flex-col rounded-2xl border border-border bg-card/60"
              >
                <div className="space-y-1.5 border-b border-border/70 px-4 py-3">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex flex-col gap-2.5 p-3">
                  {Array.from({ length: 2 }).map((_, cartao) => (
                    <Skeleton key={cartao} className="h-[10.3rem] rounded-xl" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
