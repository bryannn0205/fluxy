import { randomUUID } from "crypto";

import { afterAll, describe, expect, it } from "vitest";

import { DEFAULT_PLAN_SLUG } from "@/lib/constants";
import { PrismaSubscriptionCheckoutRepository } from "@/repositories/implementations/PrismaSubscriptionCheckoutRepository";

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();
const repository = new PrismaSubscriptionCheckoutRepository(prisma);

const JANELA_MS = 30 * 60 * 1000;
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

async function novaEmpresa() {
  const sufixo = randomUUID().slice(0, 8);
  const company = await prisma.company.create({
    data: {
      name: `Checkout ${sufixo}`,
      email: `checkout-${sufixo}@teste.com`,
      trialEndsAt: new Date(Date.now() + 86_400_000),
      subscriptionStatus: "TRIALING",
    },
  });
  empresas.push(company.id);
  return company;
}

async function planoPadrao() {
  return prisma.plan.findUniqueOrThrow({ where: { slug: DEFAULT_PLAN_SLUG } });
}

// Corrida não se prova com mock: o que importa aqui é o lock de linha do
// Postgres, o UPDATE condicional e a serialização real de transações — nada
// disso existe num duplo de repositório.
describe("find-or-create sob concorrência", () => {
  it("20 chamadas simultâneas criam UMA tentativa só", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();

    const resultados = await Promise.all(
      Array.from({ length: 20 }, () =>
        repository.findOrCreatePending({
          companyId: empresa.id,
          intendedPlanId: plano.id,
          billingInterval: "MONTHLY",
          reuseWindowMs: JANELA_MS,
        }),
      ),
    );

    // Sem o FOR UPDATE antes da leitura, as 20 leriam "não existe" ao mesmo
    // tempo e as 20 inseririam — 20 cobranças diferentes na ValidaPay.
    const ids = new Set(resultados.map((r) => r.checkout.id));
    expect(ids.size).toBe(1);

    const noBanco = await prisma.subscriptionCheckout.count({
      where: { companyId: empresa.id },
    });
    expect(noBanco).toBe(1);
  });

  it("intervalos diferentes são tentativas diferentes", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();

    const mensal = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });
    const anual = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "YEARLY",
      reuseWindowMs: JANELA_MS,
    });

    expect(mensal.checkout.id).not.toBe(anual.checkout.id);
  });

  it("tentativa fora da janela NÃO é reaproveitada", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();

    const antiga = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });

    // Envelhece a linha além da janela: um QR de Pix de 31 minutos atrás
    // provavelmente já não serve.
    await prisma.subscriptionCheckout.update({
      where: { id: antiga.checkout.id },
      data: { createdAt: new Date(Date.now() - JANELA_MS - 60_000) },
    });

    const nova = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });

    expect(nova.checkout.id).not.toBe(antiga.checkout.id);
    expect(nova.reused).toBe(false);
  });

  it("tentativa já COMPLETED não é reaproveitada", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();

    const primeira = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });
    await prisma.subscriptionCheckout.update({
      where: { id: primeira.checkout.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const segunda = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });

    expect(segunda.checkout.id).not.toBe(primeira.checkout.id);
  });
});

describe("gravação condicional do chargeId", () => {
  it("o primeiro chargeId vence e não é sobrescrito", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();
    const { checkout } = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });

    await repository.attachChargeId(checkout.id, "cha_primeiro");
    const depois = await repository.attachChargeId(checkout.id, "cha_segundo");

    // WHERE externalChargeId IS NULL: a segunda escrita afeta 0 linhas.
    expect(depois.externalChargeId).toBe("cha_primeiro");
  });

  it("gravações concorrentes convergem para um único valor", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();
    const { checkout } = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });

    const resultados = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        repository.attachChargeId(checkout.id, `cha_${i}`),
      ),
    );

    const gravados = new Set(resultados.map((r) => r.externalChargeId));
    expect(gravados.size).toBe(1);
  });
});

describe("ativação atômica", () => {
  it("execuções simultâneas ativam UMA vez só", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();
    const { checkout } = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });
    await repository.attachChargeId(checkout.id, "cha_pago");

    // Webhook, polling e reconciliação chegando juntos sobre o mesmo charge.
    const resultados = await Promise.all(
      Array.from({ length: 10 }, () =>
        repository.activateIfPending({
          subscriptionCheckoutId: checkout.id,
          companyId: empresa.id,
          intendedPlanId: plano.id,
          validapaySubscriptionId: "sub_1",
        }),
      ),
    );

    expect(resultados.filter(Boolean)).toHaveLength(1);

    const empresaDepois = await prisma.company.findUniqueOrThrow({
      where: { id: empresa.id },
    });
    expect(empresaDepois.planId).toBe(plano.id);
    expect(empresaDepois.subscriptionStatus).toBe("ACTIVE");
    expect(empresaDepois.validapaySubscriptionId).toBe("sub_1");

    const checkoutDepois = await prisma.subscriptionCheckout.findUniqueOrThrow({
      where: { id: checkout.id },
    });
    expect(checkoutDepois.status).toBe("COMPLETED");
    expect(checkoutDepois.completedAt).not.toBeNull();
  });

  it("segunda ativação é no-op e não reescreve completedAt", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();
    const { checkout } = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });

    const entrada = {
      subscriptionCheckoutId: checkout.id,
      companyId: empresa.id,
      intendedPlanId: plano.id,
      validapaySubscriptionId: "sub_1",
    };

    expect(await repository.activateIfPending(entrada)).toBe(true);
    const primeiro = await prisma.subscriptionCheckout.findUniqueOrThrow({
      where: { id: checkout.id },
    });

    expect(await repository.activateIfPending(entrada)).toBe(false);
    const segundo = await prisma.subscriptionCheckout.findUniqueOrThrow({
      where: { id: checkout.id },
    });

    expect(segundo.completedAt?.getTime()).toBe(primeiro.completedAt?.getTime());
  });

  it("subscriptionId null não apaga o identificador já gravado", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();
    await prisma.company.update({
      where: { id: empresa.id },
      data: { validapaySubscriptionId: "sub_ja_conhecido" },
    });

    const { checkout } = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });

    await repository.activateIfPending({
      subscriptionCheckoutId: checkout.id,
      companyId: empresa.id,
      intendedPlanId: plano.id,
      validapaySubscriptionId: null,
    });

    const depois = await prisma.company.findUniqueOrThrow({ where: { id: empresa.id } });
    expect(depois.validapaySubscriptionId).toBe("sub_ja_conhecido");
  });

  it("tentativa FAILED não pode ser ativada", async () => {
    const empresa = await novaEmpresa();
    const plano = await planoPadrao();
    const { checkout } = await repository.findOrCreatePending({
      companyId: empresa.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });
    await repository.markFailed(checkout.id);

    const ativou = await repository.activateIfPending({
      subscriptionCheckoutId: checkout.id,
      companyId: empresa.id,
      intendedPlanId: plano.id,
      validapaySubscriptionId: null,
    });

    expect(ativou).toBe(false);
    const depois = await prisma.company.findUniqueOrThrow({ where: { id: empresa.id } });
    expect(depois.subscriptionStatus).toBe("TRIALING");
  });
});

describe("isolamento entre empresas", () => {
  it("findByIdForCompany não devolve tentativa de outra empresa", async () => {
    const a = await novaEmpresa();
    const b = await novaEmpresa();
    const plano = await planoPadrao();

    const { checkout } = await repository.findOrCreatePending({
      companyId: b.id,
      intendedPlanId: plano.id,
      billingInterval: "MONTHLY",
      reuseWindowMs: JANELA_MS,
    });

    expect(await repository.findByIdForCompany(checkout.id, a.id)).toBeNull();
    expect(await repository.findByIdForCompany(checkout.id, b.id)).not.toBeNull();
  });
});
