import { randomUUID } from "crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveCompanySession } from "@/lib/session-resolver";
import type { Company } from "@/lib/generated/prisma/client";

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();

// resolveCompanySession é o ponto onde a sessão deixa de ser "o que o JWT diz"
// e passa a ser "o que o banco diz". Como é ele que decide acesso e papel a
// cada request, precisa rodar contra Postgres real — um mock aqui só provaria
// que o mock funciona.
describe.skipIf(!prisma)("resolveCompanySession — revogação imediata", () => {
  let company: Company;
  let outraCompany: Company;
  let userId: string;

  beforeAll(async () => {
    if (!prisma) return;
    const suffix = randomUUID().slice(0, 8);

    company = await prisma.company.create({
      data: {
        name: `Sessao ${suffix}`,
        email: `sessao-${suffix}@teste.com`,
        trialEndsAt: new Date(Date.now() + 86_400_000),
        subscriptionStatus: "ACTIVE",
      },
    });

    outraCompany = await prisma.company.create({
      data: {
        name: `Outra ${suffix}`,
        email: `outra-${suffix}@teste.com`,
        trialEndsAt: new Date(Date.now() + 86_400_000),
        subscriptionStatus: "ACTIVE",
      },
    });

    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        name: "Usuário Sessão",
        email: `user-sessao-${suffix}@teste.com`,
        role: "OPERATOR",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({
      where: { companyId: { in: [company.id, outraCompany.id] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [company.id, outraCompany.id] } },
    });
    await prisma.$disconnect();
  });

  it("resolve um usuário ativo com os dados da empresa", async () => {
    const resolved = await resolveCompanySession(userId, company.id);

    expect(resolved).not.toBeNull();
    expect(resolved?.userId).toBe(userId);
    expect(resolved?.companyId).toBe(company.id);
    expect(resolved?.name).toBe(company.name);
  });

  it("usa o papel do BANCO, não o que o token trazia", async () => {
    await prisma!.user.update({ where: { id: userId }, data: { role: "ADMIN" } });

    const resolved = await resolveCompanySession(userId, company.id);
    expect(resolved?.role).toBe("ADMIN");

    await prisma!.user.update({ where: { id: userId }, data: { role: "OPERATOR" } });

    const depois = await resolveCompanySession(userId, company.id);
    // Rebaixamento vale na hora — não espera o JWT expirar.
    expect(depois?.role).toBe("OPERATOR");
  });

  it("não resolve usuário removido da equipe (soft delete)", async () => {
    await prisma!.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });

    expect(await resolveCompanySession(userId, company.id)).toBeNull();

    await prisma!.user.update({ where: { id: userId }, data: { deletedAt: null } });
  });

  it("não resolve quando a empresa foi excluída", async () => {
    await prisma!.company.update({
      where: { id: company.id },
      data: { deletedAt: new Date() },
    });

    expect(await resolveCompanySession(userId, company.id)).toBeNull();

    await prisma!.company.update({
      where: { id: company.id },
      data: { deletedAt: null },
    });
  });

  it("não resolve quando o companyId do token não é o da empresa do usuário", async () => {
    // Token forjado apontando para outra empresa não dá acesso a ela.
    expect(await resolveCompanySession(userId, outraCompany.id)).toBeNull();
  });

  it("não resolve usuário inexistente", async () => {
    expect(await resolveCompanySession("id-que-nao-existe", company.id)).toBeNull();
  });
});
