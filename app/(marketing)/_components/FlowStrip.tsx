import { Boxes, CheckCircle2, ChevronRight, ClipboardList, Factory } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Reveal } from "@/app/(marketing)/_components/Reveal";

interface Etapa {
  icone: LucideIcon;
  titulo: string;
  detalhe: string;
}

const ETAPAS: Etapa[] = [
  {
    icone: ClipboardList,
    titulo: "Pedido criado",
    detalhe: "Numerado automaticamente",
  },
  { icone: Factory, titulo: "Produção", detalhe: "Avança pelo quadro de etapas" },
  { icone: Boxes, titulo: "Estoque atualizado", detalhe: "Baixa registrada na venda" },
  { icone: CheckCircle2, titulo: "Pedido concluído", detalhe: "Histórico preservado" },
];

/**
 * O caminho que um pedido percorre, da criação à entrega.
 *
 * Sem marquee. A referência anima uma faixa de notificações em laço, e o efeito
 * custa repaint contínuo numa página que já carrega gradientes grandes — para
 * quatro cartões que cabem na tela, o movimento não acrescentaria informação.
 *
 * Também sem rolagem horizontal. A primeira versão usava `overflow-x-auto` no
 * celular, e isso escondia metade do fluxo atrás de um gesto que nada anuncia:
 * a pessoa via um cartão e meio e não tinha como saber que havia mais. Grade de
 * duas colunas mostra as quatro etapas de uma vez, na mesma altura de tela.
 */
export function FlowStrip() {
  return (
    <section className="relative overflow-hidden border-y border-border/60 bg-[var(--mkt-surface)]/40">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 h-64 -translate-y-1/2 opacity-[0.13] [background:radial-gradient(50%_50%_at_50%_50%,var(--mkt-glow)_0%,transparent_70%)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            Um fluxo contínuo, sem lançamento repetido
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            O que acontece em uma etapa aparece na seguinte, automaticamente.
          </p>
        </Reveal>

        <ol className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {ETAPAS.map((etapa, indice) => (
            <Reveal as="li" key={etapa.titulo} delay={indice * 70} className="relative">
              <div className="h-full rounded-2xl border border-border bg-card/80 p-4 sm:p-5">
                <span className="inline-flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-[var(--mkt-lavender)]">
                  <etapa.icone className="size-4" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm font-semibold text-balance">{etapa.titulo}</p>
                <p className="mt-1 text-xs text-pretty text-muted-foreground">
                  {etapa.detalhe}
                </p>
              </div>

              {/* Seta, e não um traço: a linha de 1px que havia aqui antes
                  desaparecia sobre o fundo escuro e a ideia de sequência não
                  chegava a se ler. Só entra onde os quatro ficam lado a lado. */}
              {indice < ETAPAS.length - 1 && (
                <ChevronRight
                  aria-hidden="true"
                  className="absolute top-1/2 -right-3 hidden size-4 -translate-y-1/2 text-primary/60 lg:block"
                />
              )}
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
