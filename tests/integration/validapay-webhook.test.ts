import { createHash, createHmac, randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PLAN_SLUG } from "@/lib/constants";
import type * as EnvModule from "@/lib/env";
import type { ValidaPaySubscriptionsGateway } from "@/lib/validapay/subscriptions";
import { PrismaPaymentProviderEventRepository } from "@/repositories/implementations/PrismaPaymentProviderEventRepository";
import { PrismaSubscriptionCheckoutRepository } from "@/repositories/implementations/PrismaSubscriptionCheckoutRepository";
import { PrismaCompanyRepository } from "@/repositories/implementations/PrismaCompanyRepository";
import { PaymentProviderEventService } from "@/services/PaymentProviderEventService";
import type { SubscriptionCheckoutService } from "@/services/SubscriptionCheckoutService";
import type { SubscriptionLifecycleService } from "@/services/SubscriptionLifecycleService";

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();
const eventRepository = new PrismaPaymentProviderEventRepository(prisma);
const checkoutRepository = new PrismaSubscriptionCheckoutRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);

const empresas: string[] = [];
const hashes: string[] = [];

afterAll(async () => {
  if (hashes.length > 0) {
    await prisma.paymentProviderEvent.deleteMany({
      where: { idempotencyKey: { in: hashes } },
    });
  }
  if (empresas.length > 0) {
    await prisma.subscriptionCheckout.deleteMany({
      where: { companyId: { in: empresas } },
    });
    await prisma.company.deleteMany({ where: { id: { in: empresas } } });
  }
  await prisma.$disconnect();
});

async function novaEmpresa() {
  const sufixo = randomUUID().slice(0, 8);
  const company = await prisma.company.create({
    data: {
      name: `Webhook ${sufixo}`,
      email: `webhook-${sufixo}@teste.com`,
      trialEndsAt: new Date(Date.now() + 86_400_000),
      subscriptionStatus: "TRIALING",
    },
  });
  empresas.push(company.id);
  return company;
}

async function novaTentativaComCharge(chargeId: string) {
  const empresa = await novaEmpresa();
  const plano = await prisma.plan.findUniqueOrThrow({
    where: { slug: DEFAULT_PLAN_SLUG },
  });

  const { checkout } = await checkoutRepository.findOrCreatePending({
    companyId: empresa.id,
    intendedPlanId: plano.id,
    billingInterval: "MONTHLY",
    reuseWindowMs: 30 * 60 * 1000,
  });
  await checkoutRepository.attachChargeId(checkout.id, chargeId);

  return { empresa, plano, checkoutId: checkout.id };
}

function corpoDe(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  hashes.push(createHash("sha256").update(rawBody).digest("hex"));
  return { rawBody, payload };
}

const assinaturas: ValidaPaySubscriptionsGateway = {
  getSubscription: async (id) => ({
    subscriptionId: id,
    status: "ACTIVE",
    cancelamentoAgendado: false,
    cancelamentoEfetivoEm: null,
    cancelamentoImediato: false,
    cicloAtualPago: true,
    metadata: {},
  }),
};

/**
 * Ciclo de vida ausente de propósito: estes testes cobrem o webhook do checkout
 * inicial, quando a empresa ainda não tem `validapaySubscriptionId`.
 * `NAO_CORRELACIONADA` é exatamente o que o serviço real devolveria ali, e é o
 * que faz o fluxo cair no caminho da tentativa local.
 */
const cicloDeVida = {
  revisarEmpresa: async () => "NAO_CORRELACIONADA" as const,
  revisarPorAssinatura: async () => "NAO_CORRELACIONADA" as const,
  registrarFalhaDeCiclo: async () => "NAO_CORRELACIONADA" as const,
} as unknown as SubscriptionLifecycleService;

function servicoCom(confirmar: ReturnType<typeof vi.fn>) {
  return new PaymentProviderEventService(
    eventRepository,
    checkoutRepository,
    { confirmarSeChargePago: confirmar } as unknown as SubscriptionCheckoutService,
    assinaturas,
    cicloDeVida,
    companyRepository,
  );
}

let confirmar: ReturnType<typeof vi.fn>;

beforeEach(() => {
  confirmar = vi.fn(async () => false);
});

// O que se prova aqui não existe em mock: o índice único real do Postgres, a
// gravação append-only e o fato de o payload NÃO alcançar Company.
describe("persistência e deduplicação", () => {
  it("evento válido é gravado com hash e sem PII", async () => {
    const { checkoutId } = await novaTentativaComCharge(`cha_${randomUUID()}`);
    const checkout = await checkoutRepository.findById(checkoutId);

    const entrada = corpoDe({
      event: "payment.success",
      chargeId: checkout!.externalChargeId,
      paymentId: "E-teste-sintetico",
      // Dados sensíveis do pagador: precisam NÃO chegar ao banco.
      payer: { name: "Fulano", taxId: "00000000000", bank: "000" },
    });

    const resultado = await servicoCom(confirmar).processar(entrada);

    const gravado = await prisma.paymentProviderEvent.findUniqueOrThrow({
      where: { id: resultado.eventId },
    });

    expect(gravado.eventType).toBe("payment.success");
    expect(gravado.payloadHash).toHaveLength(64);
    expect(gravado.idempotencyKey).toBe(gravado.payloadHash);
    expect(gravado.externalPaymentId).toBe("E-teste-sintetico");

    // Nenhuma coluna guarda o corpo nem o pagador — só hash e correlação.
    const serializado = JSON.stringify(gravado);
    expect(serializado).not.toContain("Fulano");
    expect(serializado).not.toContain("00000000000");
    expect(serializado).not.toContain("payer");
  });

  it("o unique real do banco deduplica a mesma entrega", async () => {
    const { checkoutId } = await novaTentativaComCharge(`cha_${randomUUID()}`);
    const checkout = await checkoutRepository.findById(checkoutId);

    const entrada = corpoDe({
      event: "payment.success",
      chargeId: checkout!.externalChargeId,
    });

    const primeiro = await servicoCom(confirmar).processar(entrada);
    const segundo = await servicoCom(confirmar).processar(entrada);

    expect(segundo.eventId).toBe(primeiro.eventId);

    const doHash = await prisma.paymentProviderEvent.findMany({
      where: { payloadHash: createHash("sha256").update(entrada.rawBody).digest("hex") },
    });
    // Uma linha só, garantida pelo índice — não por checagem prévia.
    expect(doHash).toHaveLength(1);
  });

  it("entregas simultâneas do mesmo corpo gravam UMA linha", async () => {
    const { checkoutId } = await novaTentativaComCharge(`cha_${randomUUID()}`);
    const checkout = await checkoutRepository.findById(checkoutId);

    const entrada = corpoDe({
      event: "payment.success",
      chargeId: checkout!.externalChargeId,
    });

    // Duas entregas concorrentes passariam juntas por um findFirst prévio.
    await Promise.all([
      servicoCom(confirmar).processar(entrada),
      servicoCom(confirmar).processar(entrada),
    ]);

    const doHash = await prisma.paymentProviderEvent.findMany({
      where: { payloadHash: createHash("sha256").update(entrada.rawBody).digest("hex") },
    });
    expect(doHash).toHaveLength(1);
  });

  it("duplicata PENDING é reprocessada; PROCESSED não", async () => {
    const { checkoutId } = await novaTentativaComCharge(`cha_${randomUUID()}`);
    const checkout = await checkoutRepository.findById(checkoutId);

    const entrada = corpoDe({
      event: "payment.success",
      chargeId: checkout!.externalChargeId,
    });

    // 1ª entrega: confirmação falha de forma transitória → PENDING.
    const falha = vi.fn(async () => {
      throw new Error("timeout");
    });
    const primeiro = await servicoCom(falha).processar(entrada);
    expect(primeiro.status).toBe("PENDING");

    // 2ª entrega do MESMO corpo: reprocessa e conclui.
    const sucesso = vi.fn(async () => false);
    const segundo = await servicoCom(sucesso).processar(entrada);
    expect(sucesso).toHaveBeenCalledTimes(1);
    expect(segundo.status).toBe("PROCESSED");

    // 3ª entrega: já PROCESSED, no-op.
    const terceira = vi.fn(async () => false);
    await servicoCom(terceira).processar(entrada);
    expect(terceira).not.toHaveBeenCalled();
  });
});

describe("correlação e ativação", () => {
  it("evento conhecido delega à confirmação autoritativa", async () => {
    const { checkoutId } = await novaTentativaComCharge(`cha_${randomUUID()}`);
    const checkout = await checkoutRepository.findById(checkoutId);

    await servicoCom(confirmar).processar(
      corpoDe({ event: "payment.success", chargeId: checkout!.externalChargeId }),
    );

    expect(confirmar).toHaveBeenCalledWith(checkoutId, checkout!.externalChargeId);
  });

  it("a empresa NÃO é ativada pelo payload", async () => {
    const { empresa, checkoutId } = await novaTentativaComCharge(`cha_${randomUUID()}`);
    const checkout = await checkoutRepository.findById(checkoutId);

    await servicoCom(confirmar).processar(
      corpoDe({
        event: "payment.success",
        chargeId: checkout!.externalChargeId,
        // Payload afirmando pagamento e assinatura ativa.
        status: "PAID",
        subscriptionId: "sub_forjada",
      }),
    );

    const depois = await prisma.company.findUniqueOrThrow({ where: { id: empresa.id } });

    // Só GET /v1/charges com PAID ativa — e aqui a confirmação devolveu false.
    expect(depois.subscriptionStatus).toBe("TRIALING");
    expect(depois.planId).toBeNull();
    expect(depois.validapaySubscriptionId).toBeNull();
  });

  it("evento sem correlação é gravado como FAILED, sem tocar empresa alguma", async () => {
    const resultado = await servicoCom(confirmar).processar(
      corpoDe({ event: "payment.success", chargeId: `cha_inexistente_${randomUUID()}` }),
    );

    expect(resultado.status).toBe("FAILED");

    const gravado = await prisma.paymentProviderEvent.findUniqueOrThrow({
      where: { id: resultado.eventId },
    });
    // Evento sem empresa precisa ser registrável: perdê-lo é perder a única
    // evidência de que algo estranho chegou.
    expect(gravado.companyId).toBeNull();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("evento desconhecido é gravado como IGNORED", async () => {
    const resultado = await servicoCom(confirmar).processar(
      corpoDe({ event: "onboarding.backgroundcheck", formId: "abc" }),
    );

    expect(resultado.status).toBe("IGNORED");
    const gravado = await prisma.paymentProviderEvent.findUniqueOrThrow({
      where: { id: resultado.eventId },
    });
    expect(gravado.eventType).toBe("onboarding.backgroundcheck");
    expect(gravado.processedAt).not.toBeNull();
  });
});

describe("a rota HTTP", () => {
  const SEGREDO = "segredo-de-teste-nunca-real";

  function requisicao(rawBody: string, header: string | null): Request {
    return new Request("http://localhost/api/webhooks/validapay", {
      method: "POST",
      headers: header
        ? { "content-type": "application/json", "x-webhook-signature": header }
        : { "content-type": "application/json" },
      body: rawBody,
    });
  }

  function assinar(rawBody: string): string {
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", SEGREDO).update(`${t}.${rawBody}`).digest("hex");
    return `t=${t},v1=${v1}`;
  }

  async function carregarRota() {
    vi.resetModules();
    vi.doMock("@/lib/env", async () => {
      const real = await vi.importActual<typeof EnvModule>("@/lib/env");
      return {
        env: { ...real.env, VALIDAPAY_WEBHOOK_SECRET: SEGREDO },
      };
    });
    return import("@/app/api/webhooks/validapay/route");
  }

  it("assinatura inválida devolve 401 e NÃO grava evento", async () => {
    const { POST } = await carregarRota();
    const rawBody = JSON.stringify({ event: "payment.success", chargeId: "cha_x" });
    const hash = createHash("sha256").update(rawBody).digest("hex");

    // Timestamp DENTRO da janela, HMAC errado: força o caminho de assinatura
    // inválida, e não o de replay.
    const t = Math.floor(Date.now() / 1000);
    const forjada = createHmac("sha256", "outro-segredo")
      .update(`${t}.${rawBody}`)
      .digest("hex");

    const resposta = await POST(requisicao(rawBody, `t=${t},v1=${forjada}`));

    expect(resposta.status).toBe(401);
    expect(
      await prisma.paymentProviderEvent.findFirst({ where: { payloadHash: hash } }),
    ).toBeNull();
  });

  it("corpo adulterado após a assinatura devolve 401", async () => {
    const { POST } = await carregarRota();
    const original = JSON.stringify({ event: "payment.success", amount: 29.9 });
    const header = assinar(original);
    const adulterado = original.replace("29.9", "0.01");

    // A assinatura cobre o CONTEÚDO, não só o remetente.
    expect((await POST(requisicao(adulterado, header))).status).toBe(401);
  });

  it("sem header de assinatura devolve 401", async () => {
    const { POST } = await carregarRota();
    const rawBody = JSON.stringify({ event: "payment.success" });

    expect((await POST(requisicao(rawBody, null))).status).toBe(401);
  });

  it("JSON inválido com assinatura válida devolve 400 e não grava", async () => {
    const { POST } = await carregarRota();
    const rawBody = "{isto-nao-e-json";
    const hash = createHash("sha256").update(rawBody).digest("hex");

    const resposta = await POST(requisicao(rawBody, assinar(rawBody)));

    // 401 mentiria sobre a autenticação: quem enviou é quem diz ser.
    expect(resposta.status).toBe(400);
    expect(
      await prisma.paymentProviderEvent.findFirst({ where: { payloadHash: hash } }),
    ).toBeNull();
  });

  it("corpo JSON que não é objeto devolve 400", async () => {
    const { POST } = await carregarRota();
    const rawBody = JSON.stringify(["array", "no", "lugar", "de", "objeto"]);

    expect((await POST(requisicao(rawBody, assinar(rawBody)))).status).toBe(400);
  });

  it("evento válido devolve 200 e grava", async () => {
    const { POST } = await carregarRota();
    const rawBody = JSON.stringify({
      event: "onboarding.proposal",
      formId: `f_${randomUUID()}`,
    });
    const hash = createHash("sha256").update(rawBody).digest("hex");
    hashes.push(hash);

    const resposta = await POST(requisicao(rawBody, assinar(rawBody)));

    expect(resposta.status).toBe(200);
    const gravado = await prisma.paymentProviderEvent.findFirst({
      where: { payloadHash: hash },
    });
    expect(gravado?.status).toBe("IGNORED");
  });
});
