import { randomUUID } from "crypto";

import { afterAll, describe, expect, it } from "vitest";

import { DEFAULT_PLAN_SLUG, TRIAL_DURATION_DAYS } from "@/lib/constants";
import { parsePlanIntent } from "@/lib/plan-intent";
import { PrismaCompanyRepository } from "@/repositories/implementations/PrismaCompanyRepository";
import { PrismaPlanRepository } from "@/repositories/implementations/PrismaPlanRepository";
import { PrismaUserRepository } from "@/repositories/implementations/PrismaUserRepository";
import { AuditService } from "@/services/AuditService";
import { AuthService } from "@/services/AuthService";

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();

const authService = prisma
  ? new AuthService(
      new PrismaCompanyRepository(prisma),
      new PrismaUserRepository(prisma),
      new PrismaPlanRepository(prisma),
      new AuditService(prisma),
    )
  : null;

const empresasCriadas: string[] = [];

afterAll(async () => {
  if (prisma && empresasCriadas.length > 0) {
    // Remove só o que este arquivo criou, na ordem das chaves estrangeiras.
    await prisma.auditLog.deleteMany({ where: { companyId: { in: empresasCriadas } } });
    await prisma.user.deleteMany({ where: { companyId: { in: empresasCriadas } } });
    await prisma.company.deleteMany({ where: { id: { in: empresasCriadas } } });
  }
  await prisma?.$disconnect();
});

async function cadastrar() {
  const sufixo = randomUUID().slice(0, 8);
  const company = await authService!.register({
    companyName: `Empresa ${sufixo}`,
    name: `Dono ${sufixo}`,
    email: `dono-${sufixo}@teste.com`,
    password: "SenhaForte123!",
  });
  empresasCriadas.push(company.id);
  return company;
}

// O que estes testes provam é a garantia central da fase: a intenção comercial
// é dado de NAVEGAÇÃO. Não existe assinatura de método por onde `plan=pro`
// chegue ao cadastro — `AuthService.register` aceita apenas `RegisterInput`,
// que não declara plano. Aqui se confirma o efeito no banco.
describe.skipIf(!prisma)("cadastro com intenção de plano", () => {
  it("cria a empresa no Standard, em TRIALING", async () => {
    const company = await cadastrar();
    const standard = await prisma!.plan.findUnique({
      where: { slug: DEFAULT_PLAN_SLUG },
    });

    expect(company.subscriptionStatus).toBe("TRIALING");
    expect(company.planId).toBe(standard!.id);
  });

  it("o trial dura os dias definidos em TRIAL_DURATION_DAYS", async () => {
    const antes = Date.now();
    const company = await cadastrar();

    const dias = (company.trialEndsAt.getTime() - antes) / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThan(TRIAL_DURATION_DAYS - 0.01);
    expect(dias).toBeLessThan(TRIAL_DURATION_DAYS + 0.01);
  });

  it("intenção Pro não altera planId nem subscriptionStatus", async () => {
    // A intenção existe e é válida — e mesmo assim não tem por onde entrar:
    // `register` não a recebe. Ela decide destino, não plano.
    const intent = parsePlanIntent({ plan: "pro", billing: "yearly" });
    expect(intent).toEqual({ plan: "pro", billing: "yearly" });

    const company = await cadastrar();
    const [standard, pro] = await Promise.all([
      prisma!.plan.findUnique({ where: { slug: DEFAULT_PLAN_SLUG } }),
      prisma!.plan.findUnique({ where: { slug: "pro" } }),
    ]);

    expect(company.planId).toBe(standard!.id);
    expect(company.planId).not.toBe(pro!.id);
    expect(company.subscriptionStatus).toBe("TRIALING");
    expect(company.subscriptionStatus).not.toBe("ACTIVE");
  });

  it("intenção Pro não concede os limites do Pro", async () => {
    const company = await cadastrar();
    const comPlano = await prisma!.company.findUnique({
      where: { id: company.id },
      include: { plan: true },
    });

    // Os limites efetivos são os do Standard, não os do Pro.
    expect(comPlano!.plan!.slug).toBe(DEFAULT_PLAN_SLUG);
    expect(comPlano!.plan!.maxUsers).toBe(5);
    expect(comPlano!.plan!.maxOrdersPerMonth).toBe(500);
  });

  it("não cria pagamento nem assinatura externa", async () => {
    const company = await cadastrar();
    const pagamentos = await prisma!.payment.count({
      where: { companyId: company.id },
    });

    expect(pagamentos).toBe(0);
    expect(company.validapaySubscriptionId).toBeNull();
    expect(company.validapayCustomerId).toBeNull();
  });

  it("o dono nasce como OWNER — o usuário não escolhe o próprio papel", async () => {
    const company = await cadastrar();
    const usuarios = await prisma!.user.findMany({
      where: { companyId: company.id },
    });

    expect(usuarios).toHaveLength(1);
    expect(usuarios[0]!.role).toBe("OWNER");
  });

  it("cada cadastro fica na própria empresa", async () => {
    const a = await cadastrar();
    const b = await cadastrar();

    expect(a.id).not.toBe(b.id);

    const usuariosDeA = await prisma!.user.findMany({ where: { companyId: a.id } });
    const usuariosDeB = await prisma!.user.findMany({ where: { companyId: b.id } });

    expect(usuariosDeA.every((u) => u.companyId === a.id)).toBe(true);
    expect(usuariosDeB.every((u) => u.companyId === b.id)).toBe(true);
    expect(usuariosDeA.map((u) => u.id)).not.toEqual(
      expect.arrayContaining(usuariosDeB.map((u) => u.id)),
    );
  });

  it("o plano Pro no banco permanece intocado por cadastros", async () => {
    const antes = await prisma!.plan.findUnique({ where: { slug: "pro" } });
    await cadastrar();
    const depois = await prisma!.plan.findUnique({ where: { slug: "pro" } });

    expect(depois!.priceMonthly.toFixed(2)).toBe(antes!.priceMonthly.toFixed(2));
    expect(depois!.maxUsers).toBe(antes!.maxUsers);
    expect(depois!.updatedAt.toISOString()).toBe(antes!.updatedAt.toISOString());
  });
});
