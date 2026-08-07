import { Info } from "lucide-react";

import { DEFAULT_PLAN_SLUG } from "@/lib/constants";
import type { BillingInterval, PlanIntent } from "@/lib/plan-intent";

const PERIODICIDADE: Record<BillingInterval, string> = {
  monthly: "Mensal",
  yearly: "Anual",
};

interface PlanIntentNoticeProps {
  /** Já validada por parsePlanIntent no servidor. `null` não renderiza nada. */
  intent: PlanIntent | null;
}

/**
 * Diz ao visitante qual plano ele escolheu antes de criar a conta.
 *
 * **Não mostra preço.** O valor viria da URL, que é do visitante — imprimir
 * "R$ 29" porque a query disse isso seria aceitar preço do cliente. Quando a
 * tela precisar de preço, ele vem do catálogo público, do servidor.
 *
 * Para o Pro, a ressalva é obrigatória e não decorativa: o cadastro cria a
 * empresa no Standard qualquer que seja a escolha, e deixar isso implícito
 * seria vender uma ativação que não acontece.
 */
export function PlanIntentNotice({ intent }: PlanIntentNoticeProps) {
  if (intent === null) return null;

  const ehPadrao = intent.plan === DEFAULT_PLAN_SLUG;

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">
          {ehPadrao
            ? "Você está começando com o Fluxy Standard."
            : "Você escolheu o Fluxy Pro."}{" "}
          <span className="font-normal text-muted-foreground">
            {PERIODICIDADE[intent.billing]}
          </span>
        </p>
        {!ehPadrao && (
          <p className="text-muted-foreground">
            O plano Pro será ativado somente após a contratação. Você começa com o teste
            grátis no Standard.
          </p>
        )}
      </div>
    </div>
  );
}
