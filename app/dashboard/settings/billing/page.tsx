import type { Metadata } from "next";
import { AlertTriangle, CalendarClock } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { SUBSCRIPTION_STATUS_LABELS, TRIAL_DURATION_DAYS } from "@/lib/constants";
import { daysRemainingUntil } from "@/lib/dates";
import { formatDate } from "@/lib/formatters";
import { logger } from "@/lib/logger";
import { assertPermission } from "@/lib/permissions";
import { requireCompany } from "@/lib/session";
import { planCatalogService, planLimitService } from "@/services";
import type { PublicPlan } from "@/types/plans";
import { PlanComparison } from "@/app/dashboard/settings/billing/_components/PlanComparison";

export const metadata: Metadata = { title: "Plano e cobrança" };

export default async function BillingPage() {
  // A empresa vem da SESSÃO, nunca de parâmetro. Esta página não lê
  // searchParams: não há nada que o navegador possa dizer sobre assinatura que
  // devesse ser considerado. `?companyId=`, `?planId=`, `?plan=pro` e
  // `?subscriptionStatus=ACTIVE` são ignorados por não existir leitura deles.
  const company = await requireCompany();

  // Mesma barreira do resto do sistema — 403 pelo caminho padrão do projeto,
  // sem inventar um segundo comportamento de acesso negado.
  assertPermission(company.role, "subscription", "view");

  const [planoAtual, catalogo] = await Promise.all([
    planLimitService.getCurrentPlan(company.companyId),
    carregarCatalogo(),
  ]);

  const emTeste = company.subscriptionStatus === "TRIALING";
  const diasRestantes = daysRemainingUntil(company.trialEndsAt);
  const pagamentoPendente = company.subscriptionStatus === "PAST_DUE";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plano e cobrança"
        description="Acompanhe sua assinatura e compare os planos disponíveis."
      />

      {pagamentoPendente && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-medium">Há um pagamento pendente.</span>{" "}
            <span>A regularização de pagamento será disponibilizada nesta área.</span>
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Assinatura</CardTitle>
          <CardDescription>Situação atual da sua empresa no Fluxy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Status</span>
            {/* Rótulo textual, não só a cor do selo. */}
            <Badge
              variant={company.subscriptionStatus === "ACTIVE" ? "default" : "secondary"}
            >
              {SUBSCRIPTION_STATUS_LABELS[company.subscriptionStatus]}
            </Badge>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Plano</span>
            {/* Vem do banco. Durante o teste o plano efetivo é o Standard,
                mesmo que a pessoa tenha escolhido Pro antes de se cadastrar. */}
            <span className="font-medium">
              {planoAtual?.name ?? "Sem plano vinculado"}
            </span>
          </div>

          {emTeste && (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Teste grátis até</span>
                <span>{formatDate(company.trialEndsAt)}</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                <CalendarClock
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span>
                  {diasRestantes > 0
                    ? `${diasRestantes} ${diasRestantes === 1 ? "dia restante" : "dias restantes"} dos ${TRIAL_DURATION_DAYS} dias de teste.`
                    : "Seu período de teste terminou."}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Planos disponíveis</h2>
        <PlanComparison plans={catalogo} currentPlanSlug={planoAtual?.slug ?? null} />
      </section>
    </div>
  );
}

/**
 * Catálogo indisponível não derruba a tela: o usuário ainda precisa enxergar o
 * próprio status de assinatura, que é o dado mais importante daqui. Falha vira
 * lista vazia com erro registrado, e a comparação mostra indisponibilidade.
 * Nunca há preço de reserva no código.
 */
async function carregarCatalogo(): Promise<PublicPlan[]> {
  try {
    return await planCatalogService.listPublicPlans();
  } catch (error) {
    logger.error("Falha ao carregar catálogo na tela de plano e cobrança", {
      resource: "plan",
      error,
    });
    return [];
  }
}
