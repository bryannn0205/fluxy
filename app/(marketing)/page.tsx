import type { Metadata } from "next";
import { connection } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { planCatalogService } from "@/services";
import type { PublicPlan } from "@/types/plans";
import { Hero } from "@/app/(marketing)/_components/Hero";
import { Features } from "@/app/(marketing)/_components/Features";
import { ProductShowcase } from "@/app/(marketing)/_components/ProductShowcase";
import { HowItWorks } from "@/app/(marketing)/_components/HowItWorks";
import { LightHighlight } from "@/app/(marketing)/_components/LightHighlight";
import { BusinessBenefits } from "@/app/(marketing)/_components/BusinessBenefits";
import { FlowStrip } from "@/app/(marketing)/_components/FlowStrip";
import { PlansSection } from "@/app/(marketing)/_components/PlansSection";
import { Faq } from "@/app/(marketing)/_components/Faq";
import { FinalCta } from "@/app/(marketing)/_components/FinalCta";

const TITULO = "Fluxy — Gestão de pedidos, produção e financeiro";
const DESCRICAO =
  "Centralize pedidos, clientes, produtos, produção, estoque e recebimentos no Fluxy.";

export const metadata: Metadata = {
  // Sobrescreve o template "%s · Fluxy" do layout raiz: a página inicial é a
  // única em que o nome da marca deve abrir o título, não fechá-lo.
  title: { absolute: TITULO },
  description: DESCRICAO,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITULO,
    description: DESCRICAO,
    type: "website",
    siteName: "Fluxy",
    locale: "pt_BR",
    url: env.NEXT_PUBLIC_APP_URL,
    // Sem `images`: não existe asset de Open Graph no projeto, e apontar para
    // um arquivo inexistente renderiza um card quebrado nas redes.
  },
};

/**
 * Landing pública.
 *
 * Server Component sem sessão: não chama `auth()`, `requireCompany()` nem
 * qualquer service autenticado. O único dado que busca é o catálogo público
 * de planos — que não recebe `companyId` e não distingue quem pergunta.
 *
 * Também não cria conta, não ativa plano, não inicia cobrança e não escreve
 * nada. O que ela faz com a escolha do visitante é montar um link.
 */
export default async function LandingPage() {
  // Sem isto, o Next prerenderiza esta página no build — e mediu-se que
  // prerenderiza mesmo: uma build gerada com o Standard a R$ 29 continuava
  // servindo R$ 29 depois do banco passar a R$ 31, porque o HTML já estava
  // pronto em disco. Preço comercial congelado até o próximo deploy é o pior
  // cache possível, e era o comportamento PADRÃO, não algo que alguém pediu.
  //
  // `connection()` declara que o que vem abaixo depende da requisição. É a
  // API própria para isto no Next 15 — não força dinamismo por efeito
  // colateral (cookie de mentira, Date.now, query aleatória), apenas afirma a
  // dependência, que é o que se quer documentar.
  await connection();

  const plans = await carregarPlanos();

  return (
    <>
      <Hero />
      <Features />
      <ProductShowcase />
      <HowItWorks />
      {/* Corte claro no meio da página: quebra a sequência escura e devolve
          fôlego antes dos blocos densos que vêm depois. */}
      <LightHighlight />
      <BusinessBenefits />
      <FlowStrip />
      <PlansSection plans={plans} />
      <Faq />
      <FinalCta />
    </>
  );
}

/**
 * O catálogo é o único ponto da landing que depende do banco — e a landing
 * não pode cair junto com ele. Falha vira lista vazia e um erro registrado; a
 * seção de planos mostra indisponibilidade e o resto da página continua
 * apresentando o produto.
 *
 * Nunca há preço de reserva no código: sem banco, não há preço na tela.
 */
async function carregarPlanos(): Promise<PublicPlan[]> {
  try {
    return await planCatalogService.listPublicPlans();
  } catch (error) {
    logger.error("Falha ao carregar catálogo público na landing", {
      resource: "plan",
      error,
    });
    return [];
  }
}
