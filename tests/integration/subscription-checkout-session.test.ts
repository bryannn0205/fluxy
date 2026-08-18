import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { DEFAULT_PLAN_SLUG } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import type { ValidaPayChargesGateway } from "@/lib/validapay/charges";
import type { ValidaPayCheckoutSessionsGateway } from "@/lib/validapay/checkout-sessions";
import { PrismaPlanRepository } from "@/repositories/implementations/PrismaPlanRepository";
import { PrismaSubscriptionCheckoutRepository } from "@/repositories/implementations/PrismaSubscriptionCheckoutRepository";
import { SubscriptionCheckoutService } from "@/services/SubscriptionCheckoutService";

import { createTestPrismaClient } from "../helpers/prisma";

/**
 * Persistência e reuso da sessão hospedada, contra o Postgres de verdade.
 *
 * É aqui que mora o risco desta arquitetura: `POST /v1/checkout-sessions` **não
 * tem idempotência** — medido em sandbox, repetir com o mesmo `externalId` cria
 * outra sessão e não devolve `409`. A única defesa é a escrita condicional do
 * repositório, e escrita condicional só se prova com banco real: um dublê em
 * memória concordaria com qualquer implementação.
 */

const prisma = createTestPrismaClient();
const checkoutRepository = new PrismaSubscriptionCheckoutRepository(prisma);
const planRepository = new PrismaPlanRepository(prisma);

const empresas: string[] = [];

afterAll(async () => {
  if (empresas.length > 0) {
    await prisma.subscriptionCheckout.deleteMany({
      where: { companyId: { in: empresas } },
    });
    await prisma.company.deleteMany({ where: { id: { in: empresas } } });
  }
  await prisma.$disconnect();
});

/** Cada chamada devolve uma sessão DIFERENTE — como a ValidaPay faz. */
function sessoes() {
  const criadas: { sessionId: string; url: string }[] = [];

  const gw: ValidaPayCheckoutSessionsGateway = {
    createSession: vi.fn(async () => {
      const sessionId = `cs_${randomUUID().slice(0, 8)}`;
      const sessao = {
        sessionId,
        url: `https://app.validapay.com.br/pagamento/${sessionId}`,
      };
      criadas.push(sessao);
      return sessao;
    }),
    getSession: vi.fn(async (sessionId: string) => ({
      sessionId,
      status: "active",
      allowedPaymentMethods: ["pix", "creditcard"],
      metadata: {},
    })),
  };

  return { gw, criadas };
}

function cobrancas(paid = false): ValidaPayChargesGateway {
  return {
    getCharge: vi.fn(async (chargeId: string) => ({
      chargeId,
      status: paid ? "PAID" : "PENDING",
      paid,
      subscriptionId: paid ? "sub_teste" : null,
      paymentId: null,
      paidAt: null,
    })),
  };
}

function servico(
  gwSessoes: ValidaPayCheckoutSessionsGateway,
  gwCobrancas: ValidaPayChargesGateway = cobrancas(),
) {
  return new SubscriptionCheckoutService(
    checkoutRepository,
    planRepository,
    gwSessoes,
    gwCobrancas,
  );
}

async function empresa() {
  const sufixo = randomUUID().slice(0, 8);
  const plano = await prisma.plan.findUniqueOrThrow({
    where: { slug: DEFAULT_PLAN_SLUG },
  });

  const company = await prisma.company.create({
    data: {
      name: `Sessao ${sufixo}`,
      email: `sessao-${sufixo}@teste.local`,
      planId: plano.id,
      trialEndsAt: new Date(Date.now() + 86_400_000),
    },
  });
  empresas.push(company.id);

  // O seed de teste cria os planos SEM preço remoto — é o estado de produção
  // antes da ativação comercial. Aqui a sessão precisa poder ser aberta, então
  // os identificadores são postos nesta linha, e só nela.
  const pago = await prisma.plan.update({
    where: { slug: "plus" },
    data: {
      validapayPriceMonthlyId: "price_mensal_sintetico_de_teste",
      validapayPriceYearlyId: "price_anual_sintetico_de_teste",
    },
  });

  return { company, planoPago: pago };
}

describe("persistência da sessão", () => {
  it("grava identificador e URL juntos", async () => {
    const { company, planoPago } = await empresa();
    const { gw } = sessoes();

    const resumo = await servico(gw).iniciarCheckout(
      { planId: planoPago.id, billingInterval: "MONTHLY" },
      { id: company.id, role: "OWNER" },
    );

    const linha = await prisma.subscriptionCheckout.findUniqueOrThrow({
      where: { id: resumo.checkoutId },
    });

    expect(linha.externalSessionId).not.toBeNull();
    expect(linha.externalSessionUrl).not.toBeNull();
    // A URL devolvida é a persistida — nada é remontado a partir do id.
    expect(resumo.url).toBe(linha.externalSessionUrl);
    expect(linha.status).toBe("PENDING");
  });

  it("a URL vem da ValidaPay, não é derivada do identificador", async () => {
    const { company, planoPago } = await empresa();
    const gw: ValidaPayCheckoutSessionsGateway = {
      // Domínio deliberadamente diferente do padrão observado: se o código
      // derivasse a URL do id, este teste passaria com o domínio errado.
      createSession: vi.fn(async () => ({
        sessionId: "cs_qualquer",
        url: "https://outro-dominio.example/pagina-de-pagamento",
      })),
      getSession: vi.fn(),
    } as unknown as ValidaPayCheckoutSessionsGateway;

    const resumo = await servico(gw).iniciarCheckout(
      { planId: planoPago.id, billingInterval: "MONTHLY" },
      { id: company.id, role: "OWNER" },
    );

    expect(resumo.url).toBe("https://outro-dominio.example/pagina-de-pagamento");
  });
});

describe("reuso e concorrência", () => {
  it("segundo clique reaproveita a sessão, sem criar outra", async () => {
    const { company, planoPago } = await empresa();
    const { gw, criadas } = sessoes();
    const service = servico(gw);

    const primeira = await service.iniciarCheckout(
      { planId: planoPago.id, billingInterval: "MONTHLY" },
      { id: company.id, role: "OWNER" },
    );
    const segunda = await service.iniciarCheckout(
      { planId: planoPago.id, billingInterval: "MONTHLY" },
      { id: company.id, role: "OWNER" },
    );

    expect(segunda.checkoutId).toBe(primeira.checkoutId);
    expect(segunda.url).toBe(primeira.url);
    // Uma criação só: a segunda passada nem chega a falar com a ValidaPay.
    expect(criadas).toHaveLength(1);
    expect(gw.createSession).toHaveBeenCalledTimes(1);
  });

  it("cliques simultâneos convergem para a MESMA sessão", async () => {
    const { company, planoPago } = await empresa();
    const { gw } = sessoes();
    const service = servico(gw);

    const [a, b, c] = await Promise.all([
      service.iniciarCheckout(
        { planId: planoPago.id, billingInterval: "MONTHLY" },
        { id: company.id, role: "OWNER" },
      ),
      service.iniciarCheckout(
        { planId: planoPago.id, billingInterval: "MONTHLY" },
        { id: company.id, role: "OWNER" },
      ),
      service.iniciarCheckout(
        { planId: planoPago.id, billingInterval: "MONTHLY" },
        { id: company.id, role: "OWNER" },
      ),
    ]);

    // Mesmo que a corrida crie mais de uma sessão lá fora, só uma é gravada e
    // é ela que todos recebem — é o que impede duas páginas de pagamento.
    expect(new Set([a.checkoutId, b.checkoutId, c.checkoutId]).size).toBe(1);
    expect(new Set([a.url, b.url, c.url]).size).toBe(1);

    const linhas = await prisma.subscriptionCheckout.findMany({
      where: { companyId: company.id },
    });
    expect(linhas).toHaveLength(1);
  });

  it("attach não sobrescreve a sessão já persistida", async () => {
    const { company, planoPago } = await empresa();
    const { gw } = sessoes();

    const resumo = await servico(gw).iniciarCheckout(
      { planId: planoPago.id, billingInterval: "MONTHLY" },
      { id: company.id, role: "OWNER" },
    );
    const antes = await prisma.subscriptionCheckout.findUniqueOrThrow({
      where: { id: resumo.checkoutId },
    });

    const depois = await checkoutRepository.attachSession(resumo.checkoutId, {
      sessionId: "cs_invasora",
      url: "https://invasora.example/pagamento",
    });

    expect(depois.externalSessionId).toBe(antes.externalSessionId);
    expect(depois.externalSessionUrl).toBe(antes.externalSessionUrl);
  });
});

describe("estado incompleto", () => {
  it("sessão sem URL não é retomada nem substituída em silêncio", async () => {
    const { company, planoPago } = await empresa();
    const { gw, criadas } = sessoes();

    // Linha legada: identificador sem URL. Não deveria existir, e o código
    // precisa recusar em vez de adivinhar.
    const linha = await prisma.subscriptionCheckout.create({
      data: {
        companyId: company.id,
        intendedPlanId: planoPago.id,
        billingInterval: "MONTHLY",
        provider: "VALIDAPAY",
        externalSessionId: "cs_sem_url",
      },
    });

    const resumo = await servico(gw).garantirSessaoCriada(linha.id);

    expect(resumo.url).toBeNull();
    expect(resumo.status).toBe("PENDING");
    // Nenhuma sessão nova: criar em cima de uma existente é a duplicidade que
    // a escrita condicional existe para evitar.
    expect(criadas).toHaveLength(0);
  });
});

describe("isolamento entre empresas", () => {
  it("consultar tentativa de outra empresa é NotFound", async () => {
    const { company, planoPago } = await empresa();
    const { gw } = sessoes();
    const service = servico(gw);

    const resumo = await service.iniciarCheckout(
      { planId: planoPago.id, billingInterval: "MONTHLY" },
      { id: company.id, role: "OWNER" },
    );

    await expect(
      service.consultarParaExibicao(resumo.checkoutId, "company_de_outro_tenant"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
