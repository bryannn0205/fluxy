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
        <div className="absolute top-[-18rem] left-1/2 h-[42rem] w-[68rem] -translate-x-1/2 rounded-full opacity-[0.28] [background:radial-gradient(50%_50%_at_50%_50%,var(--mkt-glow)_0%,transparent_70%)]" />
        <div className="absolute top-[6rem] left-[10%] size-[26rem] rounded-full opacity-[0.16] [background:radial-gradient(50%_50%_at_50%_50%,var(--brand-accent)_0%,transparent_70%)]" />
        <div className="absolute top-[2rem] right-[6%] size-[22rem] rounded-full opacity-[0.14] [background:radial-gradient(50%_50%_at_50%_50%,var(--mkt-lavender)_0%,transparent_70%)]" />
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-[var(--mkt-lavender)]">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Gestão simples para negócios que querem crescer
            </p>
          </Reveal>

          {/* Único h1 da página. */}
          <Reveal delay={60}>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
              Organize sua operação{" "}
              <span className="bg-gradient-to-r from-[var(--mkt-lavender)] via-[oklch(0.78_0.15_305)] to-[oklch(0.72_0.17_325)] bg-clip-text text-transparent">
                em um só lugar.
              </span>
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mx-auto mt-6 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
              Pedidos, clientes, produtos, estoque e produção conectados em uma plataforma
              simples para o dia a dia.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={ROUTES.PLANS}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full shadow-lg shadow-primary/25 transition-shadow duration-200 hover:shadow-primary/40 sm:w-auto",
                )}
              >
                Começar grátis
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a
                href="#como-funciona"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full border-border bg-card/60 hover:bg-card sm:w-auto",
                )}
              >
                Conhecer o Fluxy
              </a>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <p className="mt-5 text-xs text-muted-foreground">
              {TRIAL_DURATION_DAYS} dias grátis • Sem compromisso
            </p>
          </Reveal>
        </div>

        <Reveal delay={120} className="mx-auto mt-16 max-w-5xl">
          <div className="relative">
            {/* Brilho de apoio atrás da peça, para descolá-la do fundo sem
                precisar de borda grossa. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-8 -top-6 bottom-0 -z-10 opacity-[0.22] [background:radial-gradient(60%_50%_at_50%_40%,var(--mkt-glow)_0%,transparent_72%)]"
            />
            <DashboardMockup />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
