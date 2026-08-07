"use client";

import { useState } from "react";
import { Check, Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BillingToggle } from "@/components/common/BillingToggle";
import { PlanFeatures, PlanPrice } from "@/components/common/PlanFacts";
import { type BillingInterval } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PublicPlan } from "@/types/plans";

interface PlanComparisonProps {
  plans: PublicPlan[];
  /**
   * Slug do plano EFETIVO da empresa, lido do banco no servidor.
   *
   * Nunca vem da URL. É o que decide qual card recebe "Seu plano atual", e é
   * por isso que `?plan=pro` na barra de endereços não marca o Pro como atual.
   */
  currentPlanSlug: string | null;
}

/**
 * Comparação de planos dentro da área autenticada.
 *
 * Client Component pelo alternador e pelo aviso do botão — nada mais. **Não
 * existe action aqui.** Nenhum caminho deste arquivo escreve no banco, altera
 * assinatura, cria pagamento ou toca em `Company.planId`: o botão de contratar
 * revela um texto e só.
 */
export function PlanComparison({ plans, currentPlanSlug }: PlanComparisonProps) {
  const [cobranca, setCobranca] = useState<BillingInterval>("monthly");
  const [avisoVisivel, setAvisoVisivel] = useState(false);

  if (plans.length === 0) {
    return (
      <p
        role="status"
        className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
      >
        Não foi possível carregar os planos agora. Recarregue a página em alguns
        instantes.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <BillingToggle value={cobranca} onChange={setCobranca} className="justify-start" />

      <ul className="grid gap-6 lg:grid-cols-2">
        {plans.map((plano) => {
          const ehAtual = plano.slug === currentPlanSlug;

          return (
            <li key={plano.slug}>
              <Card className={cn("h-full", ehAtual && "border-primary/45")}>
                <CardContent className="flex h-full flex-col gap-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold">{plano.name}</h3>
                    {ehAtual && (
                      // Texto + ícone, nunca só a borda colorida.
                      <Badge className="shrink-0">
                        <Check className="size-3" aria-hidden="true" />
                        Seu plano atual
                      </Badge>
                    )}
                  </div>

                  <PlanPrice plan={plano} billing={cobranca} />

                  <div className="flex-1">
                    <PlanFeatures plan={plano} headingLevel="h4" />
                  </div>

                  {ehAtual ? (
                    // Sem ação para o plano já vigente: oferecer "ativar" o
                    // que já está ativo é convite a um clique sem efeito.
                    <p className="text-sm text-muted-foreground">
                      É o plano que sua empresa usa hoje.
                    </p>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => setAvisoVisivel(true)}
                      aria-expanded={avisoVisivel}
                      aria-controls="aviso-de-contratacao"
                      className="w-full"
                    >
                      Contratar {plano.name}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {/* Sempre no DOM para aria-controls ter alvo válido; `hidden` controla a
          exibição. O texto é deliberadamente explícito sobre o que NÃO houve —
          um botão de contratar que não contrata precisa dizer isso. */}
      <div
        id="aviso-de-contratacao"
        hidden={!avisoVisivel}
        role="status"
        className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm"
      >
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          <span className="font-medium">Pagamento online em breve.</span>{" "}
          <span className="text-muted-foreground">
            O upgrade será concluído pela etapa de pagamento, ainda não disponível.
            Nenhuma alteração foi feita na sua assinatura.
          </span>
        </p>
      </div>
    </div>
  );
}
