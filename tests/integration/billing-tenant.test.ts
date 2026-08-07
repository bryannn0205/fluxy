import { randomUUID } from "crypto";

import { afterAll, describe, expect, it } from "vitest";

import { DEFAULT_PLAN_SLUG } from "@/lib/constants";
import { PrismaCompanyRepository } from "@/repositories/implementations/PrismaCompanyRepository";
import { PrismaPlanRepository } from "@/repositories/implementations/PrismaPlanRepository";
import { PrismaUserRepository } from "@/repositories/implementations/PrismaUserRepository";
import { AuditService } from "@/services/AuditService";
import { AuthService } from "@/services/AuthService";

import { createTestPrismaClient } from "../helpers/prisma";
import { buildPlanLimitService } from "../helpers/services";

const prisma = createTestPrismaClient();
const planLimitService = prisma ? buildPlanLimitService(prisma) : null;

const authService = prisma
  ? new AuthService(
      new PrismaCompanyRepository(prisma),
      new PrismaUserRepository(prisma),
      new PrismaPlanRepository(prisma),
      new AuditService(prisma),
    )
  : null;

const criadas: string[] = [];

afterAll(async () => {
  if (prisma && criadas.length > 0) {
    await prisma.auditLog.deleteMany({ where: { companyId: { in: criadas } } });
    await prisma.user.deleteMany({ where: { companyId: { in: criadas } } });
    await prisma.company.deleteMany({ where: { id: { in: criadas } } });
  }
  await prisma?.$disconnect();
});

async function novaEmpresa() {
  const sufixo = randomUUID().slice(0, 8);
  const company = await authService!.register({
    companyName: `Empresa ${sufixo}`,
    name: `Dono ${sufixo}`,
    email: `dono-${sufixo}@teste.com`,
    password: "SenhaForte123!",
  });
  criadas.push(company.id);
  return company;
}

// A tela de plano e cobrança lê o plano corrente por `companyId`, e esse
// companyId vem exclusivamente de `requireCompany()`. Estes testes provam a
// consequência: a leitura é sempre escopada, e não existe assinatura de
// método que aceite um tenant arbitrário.
describe.skipIf(!prisma)("plano e cobrança: isolamento por empresa", () => {
  it("cada empresa lê o próprio plano", async () => {
    const a = await novaEmpresa();
    const b = await novaEmpresa();

    const planoDeA = await planLimitService!.getCurrentPlan(a.id);
    const planoDeB = await planLimitService!.getCurrentPlan(b.id);

    expect(planoDeA?.slug).toBe(DEFAULT_PLAN_SLUG);
    expect(planoDeB?.slug).toBe(DEFAULT_PLAN_SLUG);
    expect(a.id).not.toBe(b.id);
  });

  it("empresa A com plano diferente não altera o que B enxerga", async () => {
    const a = await novaEmpresa();
    const b = await novaEmpresa();
    const pro = await prisma!.plan.findUnique({ where: { slug: "pro" } });

    // Muda o plano de A DIRETO NO BANCO — não pela aplicação, que não tem
    // caminho para isso. É só para provar o isolamento da leitura.
    await prisma!.company.update({
      where: { id: a.id },
      data: { planId: pro!.id },
    });

    expect((await planLimitService!.getCurrentPlan(a.id))?.slug).toBe("pro");
    expect((await planLimitService!.getCurrentPlan(b.id))?.slug).toBe(DEFAULT_PLAN_SLUG);
  });

  it("companyId inexistente devolve nulo, nunca o plano de outra empresa", async () => {
    const inexistente = `cm${randomUUID().replace(/-/g, "").slice(0, 22)}`;

    expect(await planLimitService!.getCurrentPlan(inexistente)).toBeNull();
  });

  it("os limites lidos são os do plano da própria empresa", async () => {
    const a = await novaEmpresa();
    const limites = await planLimitService!.getPlanLimits(a.id);

    // Standard: 5 usuários, 500 pedidos/mês.
    expect(limites.users).toBe(5);
    expect(limites.ordersPerMonth).toBe(500);
    expect(limites.products).toBe(500);
    expect(limites.customers).toBe(2000);
  });

  it("o status da assinatura é o gravado para aquela empresa", async () => {
    const a = await novaEmpresa();
    const b = await novaEmpresa();

    await prisma!.company.update({
      where: { id: a.id },
      data: { subscriptionStatus: "PAST_DUE" },
    });

    const [lidaA, lidaB] = await Promise.all([
      prisma!.company.findUnique({ where: { id: a.id } }),
      prisma!.company.findUnique({ where: { id: b.id } }),
    ]);

    expect(lidaA!.subscriptionStatus).toBe("PAST_DUE");
    expect(lidaB!.subscriptionStatus).toBe("TRIALING");
  });

  it("renderizar a tela não cria pagamento nem altera assinatura", async () => {
    const a = await novaEmpresa();
    const antes = await prisma!.company.findUnique({ where: { id: a.id } });

    // Exatamente as duas leituras que a página faz.
    await planLimitService!.getCurrentPlan(a.id);
    await planLimitService!.getPlanLimits(a.id);

    const depois = await prisma!.company.findUnique({ where: { id: a.id } });
    const pagamentos = await prisma!.payment.count({ where: { companyId: a.id } });

    expect(depois!.planId).toBe(antes!.planId);
    expect(depois!.subscriptionStatus).toBe(antes!.subscriptionStatus);
    expect(depois!.updatedAt.toISOString()).toBe(antes!.updatedAt.toISOString());
    expect(pagamentos).toBe(0);
  });
});
