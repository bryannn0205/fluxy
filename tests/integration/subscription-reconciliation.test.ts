import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { DEFAULT_PLAN_SLUG } from "@/lib/constants";
import { PrismaSubscriptionCheckoutRepository } from "@/repositories/implementations/PrismaSubscriptionCheckoutRepository";
import type { SubscriptionCheckoutService } from "@/services/SubscriptionCheckoutService";
import { SubscriptionReconciliationService } from "@/services/SubscriptionReconciliationService";

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();
const repository = new PrismaSubscriptionCheckoutRepository(prisma);

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

async function empresaComTentativaPendente() {
  const sufixo = randomUUID().slice(0, 8);
  const company = await prisma.company.create({
    data: {
      name: `Recon ${sufixo}`,
      email: `recon-${sufixo}@teste.com`,
      trialEndsAt: new Date(Date.now() + 86_400_000),
      subscriptionStatus: "TRIALING",
    },
  });
  empresas.push(company.id);

  const plano = await prisma.plan.findUniqueOrThrow({
    where: { slug: DEFAULT_PLAN_SLUG },
  });

  const { checkout } = await repository.findOrCreatePending({
    companyId: company.id,
    intendedPlanId: plano.id,
    billingInterval: "MONTHLY",
    reuseWindowMs: 30 * 60 * 1000,
  });
  await repository.attachChargeId(checkout.id, `cha_${sufixo}`);

  return { company, checkoutId: checkout.id };
}

/** Registra quais tentativas foram enviadas para confirmação. */
function espiaoDeConfirmacao(ativar = false) {
  const consultados: string[] = [];
  const confirmar = vi.fn(async (id: string) => {
    consultados.push(id);
    return ativar;
  });

  return {
    consultados,
    confirmar,
    service: {
      confirmarSeChargePago: confirmar,
    } as unknown as SubscriptionCheckoutService,
  };
}

// O filtro por tenant é do banco, não do duplo: aqui a query roda de verdade
// contra o Postgres, que é onde o vazamento aconteceria.
describe("isolamento entre empresas", () => {
  it("a reconciliação da empresa A não alcança a tentativa da empresa B", async () => {
    const a = await empresaComTentativaPendente();
    const b = await empresaComTentativaPendente();

    const espiao = espiaoDeConfirmacao();
    const service = new SubscriptionReconciliationService(repository, espiao.service);

    const resumo = await service.reconcilePending({ companyId: a.company.id });

    // Somente o candidato de A é enviado para confirmação.
    expect(espiao.consultados).toEqual([a.checkoutId]);
    expect(espiao.consultados).not.toContain(b.checkoutId);
    expect(resumo.examined).toBe(1);
  });

  it("o registro da outra empresa não é alterado", async () => {
    const a = await empresaComTentativaPendente();
    const b = await empresaComTentativaPendente();

    const antes = await prisma.subscriptionCheckout.findUniqueOrThrow({
      where: { id: b.checkoutId },
    });
    const empresaBAntes = await prisma.company.findUniqueOrThrow({
      where: { id: b.company.id },
    });

    // `ativar = true`: mesmo no caminho que ATIVA, B não pode ser tocada.
    const espiao = espiaoDeConfirmacao(true);
    const service = new SubscriptionReconciliationService(repository, espiao.service);

    await service.reconcilePending({ companyId: a.company.id });

    const depois = await prisma.subscriptionCheckout.findUniqueOrThrow({
      where: { id: b.checkoutId },
    });
    const empresaBDepois = await prisma.company.findUniqueOrThrow({
      where: { id: b.company.id },
    });

    expect(depois.status).toBe(antes.status);
    expect(depois.updatedAt.getTime()).toBe(antes.updatedAt.getTime());
    expect(depois.completedAt).toBeNull();
    expect(empresaBDepois.planId).toBe(empresaBAntes.planId);
    expect(empresaBDepois.subscriptionStatus).toBe(empresaBAntes.subscriptionStatus);
    expect(empresaBDepois.validapaySubscriptionId).toBeNull();
  });

  it("empresa sem tentativa pendente devolve lote vazio", async () => {
    const sufixo = randomUUID().slice(0, 8);
    const vazia = await prisma.company.create({
      data: {
        name: `Recon vazia ${sufixo}`,
        email: `recon-vazia-${sufixo}@teste.com`,
        trialEndsAt: new Date(Date.now() + 86_400_000),
      },
    });
    empresas.push(vazia.id);

    // Outra empresa TEM pendente — não pode aparecer no lote desta.
    await empresaComTentativaPendente();

    const espiao = espiaoDeConfirmacao();
    const service = new SubscriptionReconciliationService(repository, espiao.service);

    const resumo = await service.reconcilePending({ companyId: vazia.id });

    expect(resumo).toEqual({ examined: 0, completed: 0, stillPending: 0, failed: 0 });
    expect(espiao.confirmar).not.toHaveBeenCalled();
  });
});

describe("seleção contra o banco real", () => {
  it("COMPLETED e tentativa sem cobrança ficam fora", async () => {
    const { company, checkoutId } = await empresaComTentativaPendente();
    const plano = await prisma.plan.findUniqueOrThrow({
      where: { slug: DEFAULT_PLAN_SLUG },
    });

    // Sem externalChargeId: não há o que consultar na ValidaPay.
    await prisma.subscriptionCheckout.create({
      data: {
        companyId: company.id,
        intendedPlanId: plano.id,
        billingInterval: "YEARLY",
        provider: "VALIDAPAY",
      },
    });

    // Já concluída.
    await prisma.subscriptionCheckout.create({
      data: {
        companyId: company.id,
        intendedPlanId: plano.id,
        billingInterval: "YEARLY",
        provider: "VALIDAPAY",
        externalChargeId: `cha_completo_${randomUUID().slice(0, 8)}`,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    const espiao = espiaoDeConfirmacao();
    const service = new SubscriptionReconciliationService(repository, espiao.service);

    const resumo = await service.reconcilePending({ companyId: company.id });

    expect(resumo.examined).toBe(1);
    expect(espiao.consultados).toEqual([checkoutId]);
  });
});
