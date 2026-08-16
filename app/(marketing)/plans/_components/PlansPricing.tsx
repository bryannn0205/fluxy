"use client";

import { useState } from "react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { BillingToggle } from "@/components/common/BillingToggle";
import { PlanFeatures, PlanPrice } from "@/components/common/PlanFacts";
import {
  DEFAULT_PLAN_SLUG,
  planHasTrial,
  RECOMMENDED_PLAN_SLUG,
  TRIAL_DURATION_DAYS,
  type BillingInterval,
} from "@/lib/constants";
import { buildLoginUrl, buildRegisterUrl, parsePlanIntent } from "@/lib/plan-intent";
import { cn } from "@/lib/utils";
import type { PublicPlan } from "@/types/plans";

/** Uma linha por plano, no lugar de repetir a frase dentro de cada card. */
const POSICIONAMENTO: Record<string, string> = {
  standard: "Ideal para começar",
  plus: "Para quem já cresceu",
  pro: "Para operações maiores",
};

interface PlansPricingProps {
  /** Catálogo público, lido no servidor. Vazio quando a consulta falhou. */
  plans: PublicPlan[];
}

/**
 * Comparação e seleção de planos.
 *
 * Client Component porque o alternador precisa de estado — e **só por isso**.
 * A página que o envolve continua no servidor: o catálogo é lido lá, e o que
 * chega aqui já é o DTO público.
 *
 * O alternador decide **qual preço é exibido**. Nada mais. Não escreve no
 * banco, não toca em assinatura, empresa ou plano — a única consequência de
 * mudar de Mensal para Anual é o `billing` que entra no link de cadastro.
 */
export function PlansPricing({ plans }: PlansPricingProps) {
  const [cobranca, setCobranca] = useState<BillingInterval>("monthly");

  if (plans.length === 0) {
    return (
      <p
        role="status"
        className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
      >
        Não foi possível carregar os planos agora. Recarregue a página em alguns
        instantes.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <BillingToggle value={cobranca} onChange={setCobranca} />

      <ul className="mx-auto grid max-w-6xl items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plano) => {
          const ehRecomendado = plano.slug === RECOMMENDED_PLAN_SLUG;
          // A pergunta é "este plano tem teste?", não "este plano é o padrão?".
          // Com três planos as duas deixaram de ser a mesma coisa, e prometer
          // teste onde ele não existe é o erro que mais custa no suporte.
          const temTrial = planHasTrial(plano.slug);
          // Revalidado aqui pela mesma função que a próxima fronteira usará —
          // um slug que não sobrevive a ela não vira botão.
          const intencao = parsePlanIntent({ plan: plano.slug, billing: cobranca });

          return (
            <li key={plano.slug} className="relative flex">
              {/* Selo do recomendado. Texto, e não só borda colorida: o
                  destaque precisa existir para quem não distingue o roxo. */}
              {ehRecomendado && (
                <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-primary/40 bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                  Mais escolhido
                </span>
              )}

              <Card
                className={cn(
                  "h-full w-full",
                  ehRecomendado && "border-primary/45 shadow-lg shadow-primary/10",
                )}
              >
                <CardContent className="flex h-full flex-col gap-6">
                  <div>
                    {/* h2, não h3: nesta página os cards são o conteúdo de
                        primeiro nível sob o h1 — não há seção "Planos" acima
                        deles como há na landing. */}
                    <h2 className="text-xl font-semibold">{plano.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {POSICIONAMENTO[plano.slug] ?? ""}
                    </p>
                  </div>

                  <div>
                    <PlanPrice plan={plano} billing={cobranca} />
                    {/* Altura reservada mesmo sem trial, para os três preços
                        ficarem na mesma linha entre os cartões. */}
                    <p className="mt-1.5 min-h-4 text-xs text-muted-foreground">
                      {temTrial ? `${TRIAL_DURATION_DAYS} dias grátis` : ""}
                    </p>
                  </div>

                  <div className="flex-1">
                    <PlanFeatures plan={plano} headingLevel="h3" />
                  </div>

                  {intencao && (
                    <Link
                      href={buildRegisterUrl(intencao)}
                      className={cn(
                        buttonVariants({
                          variant: ehRecomendado ? "default" : "outline",
                          size: "lg",
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

      <p className="text-center text-sm text-muted-foreground">
        Já possui uma conta?{" "}
        <Link
          href={buildLoginUrl(intencaoDeLogin(plans, cobranca))}
          className="font-medium text-primary underline underline-offset-4"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}

/**
 * Intenção levada ao login.
 *
 * Só a periodicidade está escolhida nesta altura — o visitante ainda não
 * clicou num plano. Leva-se o plano padrão com a periodicidade selecionada,
 * que é o mesmo que o cadastro assumiria, e `null` se nem isso for válido:
 * `buildLoginUrl(null)` devolve `/login` limpo.
 */
function intencaoDeLogin(plans: PublicPlan[], cobranca: BillingInterval) {
  const padrao = plans.find((plano) => plano.slug === DEFAULT_PLAN_SLUG);
  return parsePlanIntent({ plan: padrao?.slug, billing: cobranca });
}
