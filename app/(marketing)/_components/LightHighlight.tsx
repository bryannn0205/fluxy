import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DashboardMockup } from "@/app/(marketing)/_components/DashboardMockup";
import { Reveal } from "@/app/(marketing)/_components/Reveal";

const BENEFICIOS = [
  "Informação centralizada, em vez de espalhada em arquivos soltos",
  "Acompanhamento da operação pelo status de cada pedido",
  "Menos retrabalho: o dado é lançado uma vez e circula entre os módulos",
  "Acesso rápido aos dados de clientes, produtos e estoque",
];

/**
 * Ilha clara no meio da página escura.
 *
 * `marketing-light` redeclara os mesmos tokens de cor com valores claros — o
 * conteúdo aqui dentro usa `bg-card`, `text-muted-foreground` e afins como em
 * qualquer outra seção, sem saber que está numa exceção. Ver app/globals.css.
 */
export function LightHighlight() {
  return (
    <section className="marketing-light bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="inline-flex items-center rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              Organização
            </p>

            <h2 className="mt-5 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Menos planilhas. Mais controle.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Quando cada informação vive num arquivo diferente, alguém sempre trabalha
              com a versão errada. O Fluxy guarda tudo em um lugar só e mostra a situação
              real da operação.
            </p>

            <ul className="mt-8 space-y-3.5">
              {BENEFICIOS.map((beneficio) => (
                <li key={beneficio} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check className="size-3 text-primary" aria-hidden="true" />
                  </span>
                  <span className="text-sm text-pretty">{beneficio}</span>
                </li>
              ))}
            </ul>

            <Link
              href={ROUTES.PLANS}
              className={cn(buttonVariants({ size: "lg" }), "mt-9 w-full sm:w-auto")}
            >
              Começar grátis
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Reveal>

          <Reveal delay={100}>
            <div className="relative">
              {/* Sombra colorida em vez de glow: sobre fundo claro, um halo
                  luminoso sujaria o branco. */}
              <div className="rounded-2xl shadow-2xl shadow-primary/20">
                <DashboardMockup />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
