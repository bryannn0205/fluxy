import { Check } from "lucide-react";

import type { BillingInterval } from "@/lib/constants";
import { formatPriceFromDecimalString } from "@/lib/formatters";
import { annualSavings, describePublicPlanLimits, type PublicPlan } from "@/types/plans";

const SUFIXO: Record<BillingInterval, string> = {
  monthly: "/mês",
  yearly: "/ano",
};

// Chaves internas de MODULE_KEYS traduzidas para exibição — "orders" numa
// tela de plano não diz nada a quem está decidindo.
const MODULOS_EM_PORTUGUES: Record<string, string> = {
  orders: "Pedidos",
  customers: "Clientes",
  products: "Produtos",
  production: "Produção",
  stock: "Estoque",
};

interface PlanPriceProps {
  plan: PublicPlan;
  billing: BillingInterval;
}

/**
 * Preço do plano na periodicidade escolhida, com a economia anual quando
 * houver. Todos os valores vêm do DTO, que veio do banco — nada é escrito
 * aqui. Compartilhado entre `/plans` e a tela de plano e cobrança para que os
 * dois lugares não divirjam na primeira mudança comercial.
 */
export function PlanPrice({ plan, billing }: PlanPriceProps) {
  const preco = billing === "yearly" ? plan.priceYearly : plan.priceMonthly;
  const economia = billing === "yearly" ? annualSavings(plan) : null;

  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span className="font-mono text-4xl font-bold tabular-nums">
          {formatPriceFromDecimalString(preco)}
        </span>
        <span className="text-sm text-muted-foreground">{SUFIXO[billing]}</span>
      </p>
      {economia && (
        <p className="mt-1.5 text-sm font-medium text-primary">
          Economize {formatPriceFromDecimalString(economia)} por ano
        </p>
      )}
    </div>
  );
}

interface PlanFeaturesProps {
  plan: PublicPlan;
  /** Nível dos subtítulos, para não quebrar a hierarquia de quem usa. */
  headingLevel: "h3" | "h4";
}

/** Limites e módulos do plano, ambos vindos do DTO. */
export function PlanFeatures({ plan, headingLevel }: PlanFeaturesProps) {
  const Subtitulo = headingLevel;
  const classeDoSubtitulo =
    "text-xs font-semibold tracking-wide text-muted-foreground uppercase";

  return (
    <div className="space-y-4">
      <div>
        <Subtitulo className={classeDoSubtitulo}>Limites</Subtitulo>
        <ul className="mt-2 space-y-2 text-sm">
          {describePublicPlanLimits(plan).map((limite) => (
            <li key={limite} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{limite}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <Subtitulo className={classeDoSubtitulo}>Módulos</Subtitulo>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {plan.modules.map((modulo) => (
            <li
              key={modulo}
              className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs"
            >
              {MODULOS_EM_PORTUGUES[modulo] ?? modulo}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
