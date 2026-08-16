import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES, TRIAL_DURATION_DAYS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DashboardMockup } from "@/app/(marketing)/_components/DashboardMockup";
import { Reveal } from "@/app/(marketing)/_components/Reveal";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Manchas de luz do fundo.

          Três camadas de `radial-gradient` em vez de blur sobre elementos:
          gradiente é pintado uma vez pela GPU e não obriga o navegador a
          rasterizar e desfocar caixas a cada rolagem — `filter: blur()` em
          área grande é o item que mais custa numa hero como esta.

          `aria-hidden` e sem foco: é atmosfera, não conteúdo. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute top-[-18rem] left-1/2 h-[42rem] w-[68rem] -translate-x-1/2 rounded-full opacity-[0.3] [background:radial-gradient(50%_50%_at_50%_50%,var(--mkt-glow)_0%,transparent_70%)]" />
        <div className="absolute top-[6rem] left-[10%] size-[26rem] rounded-full opacity-[0.16] [background:radial-gradient(50%_50%_at_50%_50%,var(--brand-accent)_0%,transparent_70%)]" />
        <div className="absolute top-[2rem] right-[6%] size-[22rem] rounded-full opacity-[0.14] [background:radial-gradient(50%_50%_at_50%_50%,var(--mkt-lavender)_0%,transparent_70%)]" />

        {/* Dissolve as manchas de luz no fundo da página antes da borda da
            seção. Sem isto o brilho terminava num corte reto e denunciava a
            emenda com a seção seguinte. Fica na mesma camada dos gradientes,
            então cobre o brilho e nunca o conteúdo. */}
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-background" />
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-24">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-4 py-2 text-xs font-medium text-[var(--mkt-lavender)]">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Gestão simples para negócios que querem crescer
            </p>
          </Reveal>

          {/* Único h1 da página. A largura menor que a do bloco força a quebra
              em duas linhas equilibradas em telas largas, em vez de uma linha
              muito longa seguida de um resto curto. */}
          <Reveal delay={60}>
            <h1 className="mx-auto mt-5 max-w-[44rem] text-4xl font-bold tracking-[-0.02em] text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.06]">
              Organize sua operação{" "}
              <span className="bg-gradient-to-r from-[var(--mkt-lavender)] via-[oklch(0.78_0.15_305)] to-[oklch(0.72_0.17_325)] bg-clip-text text-transparent">
                em um só lugar.
              </span>
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
              Pedidos, clientes, produtos, estoque e produção conectados em uma plataforma
              simples para o dia a dia.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {/* O primário ganha peso por tamanho e sombra, não por gradiente:
                  o degradê até `brand-accent` deixaria a ponta clara demais
                  (~3,6:1 com o texto branco) e reprovaria em AA. */}
              <Link
                href={ROUTES.PLANS}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-12 w-full px-7 text-base shadow-[0_10px_34px_-10px] shadow-primary/60 transition-shadow duration-200 hover:shadow-primary/80 sm:w-auto",
                )}
              >
                Começar grátis
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a
                href="#como-funciona"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-12 w-full border-border/70 bg-transparent px-7 text-base text-muted-foreground hover:bg-card/60 hover:text-foreground sm:w-auto",
                )}
              >
                Conhecer o Fluxy
              </a>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <p className="mt-4 text-xs text-muted-foreground">
              {TRIAL_DURATION_DAYS} dias grátis • Sem compromisso
            </p>
          </Reveal>
        </div>

        <Reveal delay={120} className="mx-auto mt-14 max-w-5xl">
          <div className="relative">
            {/* Brilho de apoio atrás da peça, para descolá-la do fundo sem
                precisar de borda grossa. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-10 -top-8 bottom-0 -z-10 opacity-[0.26] [background:radial-gradient(60%_50%_at_50%_40%,var(--mkt-glow)_0%,transparent_72%)]"
            />
            {/* Elevação: sombra longa e difusa embaixo, e um fio de luz na
                borda superior — a leitura de "painel pairando sobre a página"
                vem dessas duas coisas, sem perspectiva nem rotação. */}
            <div className="rounded-2xl shadow-[0_44px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-white/8">
              <DashboardMockup />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
