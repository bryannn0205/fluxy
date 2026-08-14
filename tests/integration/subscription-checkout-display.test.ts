import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { DEFAULT_PLAN_SLUG } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import type { ValidaPayChargesGateway } from "@/lib/validapay/charges";
import { PrismaCompanyRepository } from "@/repositories/implementations/PrismaCompanyRepository";
import { PrismaPlanRepository } from "@/repositories/implementations/PrismaPlanRepository";
import { PrismaSubscriptionCheckoutRepository } from "@/repositories/implementations/PrismaSubscriptionCheckoutRepository";
import { SubscriptionCheckoutService } from "@/services/SubscriptionCheckoutService";

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();
const checkoutRepository = new PrismaSubscriptionCheckoutRepository(prisma);
const planRepository = new PrismaPlanRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);

const PIX = { emv: "emv-sintetico-de-teste", qrCodeImage: null };

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

function gateway(overrides: Partial<ValidaPayChargesGateway> = {}) {
  const base: ValidaPayChargesGateway = {
    createPixCharge: vi.fn(async () => ({
      chargeId: `cha_${randomUUID().slice(0, 8)}`,
      customerId: null,
      duplicated: false,
      pix: PIX,
    })),
    getCharge: vi.fn(async (chargeId: string) => ({
      chargeId,
      status: "PENDING",
      paid: false,
      subscriptionId: null,
      paymentId: null,
      paidAt: null,
      pix: PIX,
    })),
  };
  return { ...base, ...overrides };
}

function servicoCom(charges: ValidaPayChargesGateway) {
  return new SubscriptionCheckoutService(
    checkoutRepository,
    planRepository,
    companyRepository,
    charges,
  );
}

async function empresaComTentativa(
  chargeId: string | null = `cha_${randomUUID().slice(0, 8)}`,
) {
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

  const plano = await prisma.plan.findUniqueOrThrow({
    where: { slug: DEFAULT_PLAN_SLUG },
  });

  const { checkout } = await checkoutRepository.findOrCreatePending({
    companyId: company.id,
    intendedPlanId: plano.id,
    billingInterval: "MONTHLY",
    reuseWindowMs: 30 * 60 * 1000,
  });

  if (chargeId) await checkoutRepository.attachChargeId(checkout.id, chargeId);

  return { company, plano, checkoutId: checkout.id, chargeId };
}

// O escopo por empresa é do banco, não do duplo: é aqui que um id vazado de
// outra empresa seria — ou não — encontrado.
describe("consultarParaExibicao — isolamento", () => {
  it("empresa A não consulta tentativa da empresa B", async () => {
    const a = await empresaComTentativa();
    const b = await empresaComTentativa();

    const charges = gateway();
    const service = servicoCom(charges);

    // A conhece o id de B e tenta usá-lo com a PRÓPRIA sessão.
    await expect(
      service.consultarParaExibicao(b.checkoutId, a.company.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Nem chegou a haver requisição à ValidaPay por causa de um id alheio.
    expect(charges.getCharge).not.toHaveBeenCalled();
  });

  it("tentativa inexistente e tentativa alheia falham do MESMO jeito", async () => {
    const a = await empresaComTentativa();
    const b = await empresaComTentativa();
    const service = servicoCom(gateway());

    const alheia = await service
      .consultarParaExibicao(b.checkoutId, a.company.id)
      .catch((erro: unknown) => erro);
    const inexistente = await service
      .consultarParaExibicao("chk_que_nao_existe", a.company.id)
      .catch((erro: unknown) => erro);

    // Distinguir os dois confirmaria a existência de um registro alheio.
    expect((alheia as Error).message).toBe((inexistente as Error).message);
  });

  it("a própria tentativa é consultada normalmente", async () => {
    const a = await empresaComTentativa();
    const charges = gateway();
    const service = servicoCom(charges);

    const resultado = await service.consultarParaExibicao(a.checkoutId, a.company.id);

    expect(resultado.status).toBe("PENDING");
    expect(resultado.pix).toEqual(PIX);
    expect(charges.getCharge).toHaveBeenCalledWith(a.chargeId);
  });
});

describe("consultarParaExibicao — estados", () => {
  it("PAID confirma, ativa e para de devolver Pix", async () => {
    const a = await empresaComTentativa();
    const charges = gateway({
      getCharge: vi.fn(async (chargeId: string) => ({
        chargeId,
        status: "PAID",
        paid: true,
        subscriptionId: "sub_sintetica",
        paymentId: "E-sintetico",
        paidAt: new Date(),
        pix: PIX,
      })),
    });

    const resultado = await servicoCom(charges).consultarParaExibicao(
      a.checkoutId,
      a.company.id,
    );

    expect(resultado.status).toBe("COMPLETED");
    // Cobrança paga não precisa mais de código para pagar.
    expect(resultado.pix).toBeNull();

    // A ativação é real, no banco — e escopada à empresa certa.
    const empresa = await prisma.company.findUniqueOrThrow({
      where: { id: a.company.id },
    });
    expect(empresa.subscriptionStatus).toBe("ACTIVE");
    expect(empresa.planId).toBe(a.plano.id);
    expect(empresa.validapaySubscriptionId).toBe("sub_sintetica");
  });

  it("PROCESSING não ativa — a resposta do simulador não é pagamento", async () => {
    const a = await empresaComTentativa();
    const charges = gateway({
      getCharge: vi.fn(async (chargeId: string) => ({
        chargeId,
        status: "PROCESSING",
        paid: false,
        subscriptionId: null,
        paymentId: null,
        paidAt: null,
        pix: PIX,
      })),
    });

    const resultado = await servicoCom(charges).consultarParaExibicao(
      a.checkoutId,
      a.company.id,
    );

    expect(resultado.status).toBe("PENDING");
    const empresa = await prisma.company.findUniqueOrThrow({
      where: { id: a.company.id },
    });
    expect(empresa.subscriptionStatus).toBe("TRIALING");
    expect(empresa.planId).toBeNull();
  });

  it("tentativa sem cobrança não consulta a ValidaPay", async () => {
    // Estado após um POST que expirou no cliente: PENDING sem chargeId.
    const a = await empresaComTentativa(null);
    const charges = gateway();

    const resultado = await servicoCom(charges).consultarParaExibicao(
      a.checkoutId,
      a.company.id,
    );

    expect(resultado.chargeId).toBeNull();
    expect(resultado.pix).toBeNull();
    expect(charges.getCharge).not.toHaveBeenCalled();
  });

  it("uma ÚNICA consulta externa por chamada", async () => {
    const a = await empresaComTentativa();
    const charges = gateway();

    await servicoCom(charges).consultarParaExibicao(a.checkoutId, a.company.id);

    // Confirmar e obter o Pix vêm do mesmo snapshot: consultar duas vezes
    // seria pagar dobrado pela mesma verdade.
    expect(charges.getCharge).toHaveBeenCalledTimes(1);
  });
});

describe("exigirTentativaDaEmpresa", () => {
  it("recusa tentativa de outra empresa", async () => {
    const a = await empresaComTentativa();
    const b = await empresaComTentativa();

    await expect(
      servicoCom(gateway()).exigirTentativaDaEmpresa(b.checkoutId, a.company.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("aceita a própria", async () => {
    const a = await empresaComTentativa();

    await expect(
      servicoCom(gateway()).exigirTentativaDaEmpresa(a.checkoutId, a.company.id),
    ).resolves.toBeUndefined();
  });
});
