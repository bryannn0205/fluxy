import Link from "next/link";
import { Check } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { DEFAULT_PLAN_SLUG, ROUTES, TRIAL_DURATION_DAYS } from "@/lib/constants";
import { formatPriceFromDecimalString } from "@/lib/formatters";
import { buildRegisterUrl, parsePlanIntent } from "@/lib/plan-intent";
import { cn } from "@/lib/utils";
import { describePublicPlanLimits, type PublicPlan } from "@/types/plans";

interface PlansSectionProps {
  /** Vem do PlanCatalogService, no servidor. Vazio quando o catálogo falhou. */
  plans: PublicPlan[];
}

/**
 * Planos na landing.
 *
 * **Nenhum preço ou limite está escrito aqui.** Tudo vem do DTO, que veio do
 * banco — se o valor comercial mudar, esta tela muda sozinha, e não há um
 * segundo lugar para esquecer de atualizar.
 *
 * A landing mostra só o preço mensal; a comparação mensal/anual completa é o
 * papel de `/plans`, alcançável pelo link ao pé da seção.
 */
export function PlansSection({ plans }: PlansSectionProps) {
  return (
    <section id="planos" className="scroll-mt-16 border-b border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Planos
          </h2>
          <p className="mt-3 text-muted-foreground">
            Todos os planos começam com {TRIAL_DURATION_DAYS} dias grátis. Sem cobrança
            durante o teste.
          </p>
        </div>

        {plans.length === 0 ? (
          <p
            role="status"
            className="mx-auto mt-10 max-w-md rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
          >
            Não foi possível carregar os planos agora. Tente novamente em alguns instantes
            ou{" "}
            <Link href={ROUTES.PLANS} className="font-medium text-primary underline">
              veja a página de planos
            </Link>
            .
          </p>
        ) : (
          <ul className="mx-auto mt-10 grid max-w-3xl gap-6 md:grid-cols-2">
            {plans.map((plano) => {
              const ehPadrao = plano.slug === DEFAULT_PLAN_SLUG;
              // Passa pelo parser da E3 em vez de montar o objeto à mão: é a
              // mesma validação que a próxima fronteira vai aplicar, então um
              // slug que não sobrevive aqui não vira link.
              const intencao = parsePlanIntent({
                plan: plano.slug,
                billing: "monthly",
              });

              return (
                <li key={plano.slug}>
                  <Card
                    className={cn(
                      "h-full",
                      !ehPadrao && "border-primary/40 shadow-sm shadow-primary/5",
                    )}
                  >
                    <CardContent className="flex h-full flex-col gap-5">
                      <div>
                        <h3 className="text-lg font-semibold">{plano.name}</h3>
                        <p className="mt-3 flex items-baseline gap-1.5">
                          <span className="font-mono text-4xl font-bold tabular-nums">
                            {formatPriceFromDecimalString(plano.priceMonthly)}
                          </span>
                          <span className="text-sm text-muted-foreground">/mês</span>
                        </p>
                      </div>

                      <ul className="flex-1 space-y-2 text-sm">
                        {describePublicPlanLimits(plano).map((limite) => (
                          <li key={limite} className="flex items-start gap-2">
                            <Check
                              className="mt-0.5 size-4 shrink-0 text-primary"
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
                            }),
                            "w-full",
                          )}
                        >
                          Começar com o {plano.name}
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-8 text-center text-sm">
          <Link
            href={ROUTES.PLANS}
            className="font-medium text-primary underline underline-offset-4"
          >
            Ver todos os planos e a cobrança anual
          </Link>
        </p>
      </div>
    </section>
  );
}
