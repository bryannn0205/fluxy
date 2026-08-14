import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/PageHeader";
import { formatCurrency } from "@/lib/formatters";
import { BillingInterval } from "@/lib/generated/prisma/enums";
import { assertPermission } from "@/lib/permissions";
import { requireCompany } from "@/lib/session";
import { subscriptionCheckoutService } from "@/services";
import { CheckoutPanel } from "@/app/dashboard/settings/billing/checkout/_components/CheckoutPanel";

export const metadata: Metadata = { title: "Contratar plano" };

interface CheckoutPageProps {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}

/**
 * Tela de pagamento de um plano.
 *
 * A URL diz QUAL plano se quer contratar — e só isso. A empresa vem da sessão,
 * o preço vem do banco, e a disponibilidade é decidida aqui no servidor. Nada
 * que o navegador informe altera o que será cobrado ou de quem.
 */
export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const company = await requireCompany();
  assertPermission(company.role, "subscription", "manage");

  const { plan, interval } = await searchParams;

  const periodicidade =
    interval === BillingInterval.YEARLY
      ? BillingInterval.YEARLY
      : BillingInterval.MONTHLY;

  // Disponibilidade é decidida pelo service, com a mesma regra que
  // `iniciarCheckout` aplica: sem `priceId` remoto não há como cobrar. A tela
  // NUNCA cria produto ou preço na ValidaPay para se destravar.
  const plano = plan
    ? await subscriptionCheckoutService.descreverPlanoParaCheckout(plan, periodicidade)
    : null;

  if (!plano) {
    // Slug inexistente é rota inexistente. Não há mensagem sobre "plano
    // inválido": a URL foi montada à mão.
    notFound();
  }

  const anual = periodicidade === BillingInterval.YEARLY;

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <PageHeader
        title="Contratar plano"
        description="Pague com Pix para ativar seu plano imediatamente."
      />

      <CheckoutPanel
        planId={plano.planId}
        planName={plano.name}
        billingInterval={periodicidade}
        precoFormatado={`${formatCurrency(plano.valor)} / ${anual ? "ano" : "mês"}`}
        disponivelParaContratacao={plano.disponivelParaContratacao}
      />
    </div>
  );
}
