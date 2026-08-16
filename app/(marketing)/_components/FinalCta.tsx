import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Reveal } from "@/app/(marketing)/_components/Reveal";

export function FinalCta() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-[oklch(0.42_0.2_296)] via-[oklch(0.36_0.18_300)] to-[oklch(0.26_0.12_302)] px-6 py-14 text-center sm:px-12 sm:py-20">
            {/* Luz interna vinda de cima, para o cartão não ficar chapado.

                Sem `-z-10`: o cartão tem fundo próprio, e um filho em camada
                negativa ficaria atrás dele — invisível. A ordem correta vem do
                conteúdo ser `relative`, o que o põe acima deste brilho. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-[-60%] h-[30rem] opacity-40 [background:radial-gradient(50%_50%_at_50%_50%,var(--mkt-lavender)_0%,transparent_70%)]"
            />

            <h2 className="relative mx-auto max-w-2xl text-3xl font-bold tracking-tight text-balance text-white sm:text-4xl">
              Pronto para organizar sua operação?
            </h2>
            <p className="relative mx-auto mt-5 max-w-xl text-pretty text-white/80">
              Comece seu teste grátis e veja como o Fluxy pode simplificar a rotina do seu
              negócio.
            </p>

            <div className="relative mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={ROUTES.PLANS}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full bg-white text-[oklch(0.3_0.14_298)] shadow-lg shadow-black/20 hover:bg-white/90 sm:w-auto",
                )}
              >
                Começar grátis
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href={ROUTES.PLANS}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full border-white/35 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto",
                )}
              >
                Ver planos
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
