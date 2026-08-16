import Link from "next/link";
import { Check } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { DEFAULT_PLAN_SLUG, ROUTES, TRIAL_DURATION_DAYS } from "@/lib/constants";
import { formatPriceFromDecimalString } from "@/lib/formatters";
import { buildRegisterUrl, parsePlanIntent } from "@/lib/plan-intent";
import { cn } from "@/lib/utils";
import { describePublicPlanLimits, type PublicPlan } from "@/types/plans";
import { Reveal } from "@/app/(marketing)/_components/Reveal";

interface PlansSectionProps {
  /** Vem do PlanCatalogService, no servidor. Vazio quando o catálogo falhou. */
  plans: PublicPlan[];
}

/**
 * Planos na landing.
 *
 * **Nenhum preço ou limite está escrito aqui.** Tudo vem do DTO, que veio do
 * banco — se o valor comercial mudar, esta tela muda sozinha, e não há um
 * segundo lugar para esquecer de atualizar. Há um teste que lê este arquivo e
 * falha se um número de preço aparecer no código, inclusive dentro de classe
 * de estilo: por isso as cores aqui saem de token, nunca de valor literal.
 *
 * A landing mostra só o preço mensal; a comparação mensal/anual completa é o
 * papel de `/plans`, alcançável pelo link ao pé da seção.
 */
export function PlansSection({ plans }: PlansSectionProps) {
  return (
    <section id="planos" className="relative scroll-mt-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Planos
          </h2>
          <p className="mt-4 text-muted-foreground">
            Todos os planos começam com {TRIAL_DURATION_DAYS} dias grátis. Sem cobrança
            durante o teste.
          </p>
        </Reveal>

        {plans.length === 0 ? (
          <p
            role="status"
            className="mx-auto mt-12 max-w-md rounded-2xl border border-border bg-card/70 p-6 text-center text-sm text-muted-foreground"
          >
            Não foi possível carregar os planos agora. Tente novamente em alguns instantes
            ou{" "}
            <Link
              href={ROUTES.PLANS}
              className="font-medium text-[var(--mkt-lavender)] underline"
            >
              veja a página de planos
            </Link>
            .
          </p>
        ) : (
          <ul className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
            {plans.map((plano, indice) => {
              const ehPadrao = plano.slug === DEFAULT_PLAN_SLUG;
              // Passa pelo parser da E3 em vez de montar o objeto à mão: é a
              // mesma validação que a próxima fronteira vai aplicar, então um
              // slug que não sobrevive aqui não vira link.
              const intencao = parsePlanIntent({
                plan: plano.slug,
                billing: "monthly",
              });

              return (
                <Reveal as="li" key={plano.slug} delay={indice * 80}>
                  <div
                    className={cn(
                      "relative flex h-full flex-col gap-6 rounded-2xl border p-7 transition-colors duration-200",
                      ehPadrao
                        ? "border-border bg-card/60 hover:border-primary/35"
                        : "border-primary/45 bg-card shadow-lg shadow-primary/10",
                    )}
                  >
                    {/* O destaque acompanha o plano que NÃO é o padrão do
                        teste — mesma regra que já decidia a borda. */}
                    {!ehPadrao && (
                      <span className="absolute -top-3 right-6 rounded-full border border-primary/40 bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground">
                        Recomendado
                      </span>
                    )}

                    <div>
                      <h3 className="text-lg font-semibold">{plano.name}</h3>
                      <p className="mt-4 flex items-baseline gap-1.5">
                        <span className="font-mono text-4xl font-bold tabular-nums">
                          {formatPriceFromDecimalString(plano.priceMonthly)}
                        </span>
                        <span className="text-sm text-muted-foreground">/mês</span>
                      </p>
                    </div>

                    <ul className="flex-1 space-y-2.5 text-sm">
                      {describePublicPlanLimits(plano).map((limite) => (
                        <li key={limite} className="flex items-start gap-2.5">
                          <Check
                            className="mt-0.5 size-4 shrink-0 text-[var(--mkt-lavender)]"
                            aria-hidden="true"
                          />
                          <span>{limite}</span>
                        </li>
                      ))}
                    </ul>

                    {intencao && (
                      <Link
                        href={buildRegisterUrl(intencao)}
                        className={cn(
                          buttonVariants({
                            variant: ehPadrao ? "outline" : "default",
                            size: "lg",
                          }),
                          "w-full",
                          ehPadrao && "border-border bg-card/60 hover:bg-card",
                        )}
                      >
                        Começar com o {plano.name}
                      </Link>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </ul>
        )}

        <p className="mt-10 text-center text-sm">
          <Link
            href={ROUTES.PLANS}
            className="font-medium text-[var(--mkt-lavender)] underline underline-offset-4"
          >
            Ver todos os planos e a cobrança anual
          </Link>
        </p>
      </div>
    </section>
  );
}
