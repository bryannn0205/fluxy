import type { Metadata } from "next";
import { connection } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { TRIAL_DURATION_DAYS } from "@/lib/constants";
import { planCatalogService } from "@/services";
import type { PublicPlan } from "@/types/plans";
import { PlansPricing } from "@/app/(marketing)/plans/_components/PlansPricing";
import { PlansFaq } from "@/app/(marketing)/plans/_components/PlansFaq";

const TITULO = "Planos — Fluxy";
const DESCRICAO =
  "Compare os planos Standard e Pro do Fluxy e escolha a opção ideal para sua empresa.";

export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRICAO,
  alternates: { canonical: "/plans" },
  openGraph: {
    title: TITULO,
    description: DESCRICAO,
    type: "website",
    siteName: "Fluxy",
    locale: "pt_BR",
    url: `${env.NEXT_PUBLIC_APP_URL}/plans`,
    // Sem `images`: não há asset de Open Graph, e apontar para arquivo
    // inexistente renderiza card quebrado nas redes.
  },
};

/**
 * Página pública de planos.
 *
 * Server Component sem sessão. Não chama `auth()`, `requireCompany()` nem
 * service autenticado — o visitante compara preços antes de existir como
 * usuário. Escolher um plano aqui não cria conta, não ativa assinatura, não
 * altera `Company.planId` e não libera limite nenhum: produz um link.
 */
export default async function PlansPage() {
  // Mesma razão da landing, medida na E4: sem isto o Next prerenderiza a
  // página no build e passa a servir o preço vigente naquele momento, até o
  // próximo deploy. Página de preços não pode ser um retrato do passado.
  await connection();

  const plans = await carregarPlanos();

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Escolha o plano ideal para sua empresa
        </h1>
        <p className="mt-4 text-base text-pretty text-muted-foreground sm:text-lg">
          Comece com {TRIAL_DURATION_DAYS} dias grátis e escolha o plano que acompanha o
          crescimento da sua operação.
        </p>
      </div>

      <div className="mt-12">
        <PlansPricing plans={plans} />
      </div>

      <section className="mt-16 rounded-2xl border border-border bg-muted/40 p-6 sm:p-8">
        <h2 className="text-lg font-semibold">
          Como funcionam os {TRIAL_DURATION_DAYS} dias grátis
        </h2>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>
            Você começa com {TRIAL_DURATION_DAYS} dias grátis para conhecer o Fluxy, com
            os limites do plano Standard.
          </p>
          {/* Dito em linguagem de produto: o visitante precisa saber que
              escolher Pro agora não libera Pro agora. Sem expor nome de campo
              nem estado interno. */}
          <p>
            Escolher o Pro agora registra sua preferência e orienta o cadastro — os
            limites maiores passam a valer quando o pagamento for confirmado. O pagamento
            online ainda será disponibilizado.
          </p>
        </div>
      </section>

      <PlansFaq />
    </div>
  );
}

/**
 * Catálogo indisponível não derruba a página: vira lista vazia com erro
 * registrado, e `PlansPricing` mostra o estado de indisponibilidade. Nunca há
 * preço de reserva no código — sem banco, não há preço na tela.
 *
 * Catálogo parcial não é tratado aqui: o service já registra o plano ausente e
 * devolve os existentes, e a página renderiza o que veio, sem card inventado.
 */
async function carregarPlanos(): Promise<PublicPlan[]> {
  try {
    return await planCatalogService.listPublicPlans();
  } catch (error) {
    logger.error("Falha ao carregar catálogo público na página de planos", {
      resource: "plan",
      error,
    });
    return [];
  }
}
