import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES, TRIAL_DURATION_DAYS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DashboardMockup } from "@/app/(marketing)/_components/DashboardMockup";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-accent/60 via-background to-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            {TRIAL_DURATION_DAYS} dias grátis
          </p>

          {/* Único h1 da página. */}
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Organize pedidos, produção e recebimentos em um só lugar.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
            O Fluxy ajuda sua empresa a controlar clientes, produtos, estoque, produção e
            financeiro sem depender de várias planilhas.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={ROUTES.PLANS}
              className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
            >
              Começar {TRIAL_DURATION_DAYS} dias grátis
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href="#como-funciona"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full sm:w-auto",
              )}
            >
              Ver como funciona
            </a>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Sem cobrança durante o teste.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-4xl">
          <DashboardMockup />
        </div>
      </div>
    </section>
  );
}
