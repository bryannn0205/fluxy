import { afterAll, describe, expect, it } from "vitest";

import { PUBLIC_PLAN_SLUGS } from "@/lib/constants";
import { PrismaPlanRepository } from "@/repositories/implementations/PrismaPlanRepository";
import { PlanCatalogService } from "@/services/PlanCatalogService";

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();
const service = prisma ? new PlanCatalogService(new PrismaPlanRepository(prisma)) : null;

afterAll(async () => {
  await prisma?.$disconnect();
});

// Estes testes leem o catálogo real. Confirmam que os valores comerciais
// aprovados chegaram ao banco e que a camada pública os entrega intactos —
// nenhum deles escreve nada.
describe.skipIf(!prisma)("catálogo público de planos", () => {
  it("devolve standard, plus e pro, nesta ordem", async () => {
    const catalogo = await service!.listPublicPlans();

    expect(catalogo.map((plano) => plano.slug)).toEqual(["standard", "plus", "pro"]);
  });

  it("entrega os preços aprovados, lidos do banco", async () => {
    const catalogo = await service!.listPublicPlans();
    const porSlug = new Map(catalogo.map((plano) => [plano.slug, plano]));

    expect(porSlug.get("standard")).toMatchObject({
      priceMonthly: "29.00",
      priceYearly: "290.00",
    });
    expect(porSlug.get("pro")).toMatchObject({
      priceMonthly: "89.00",
      priceYearly: "890.00",
    });
  });

  it("entrega os limites aprovados", async () => {
    const catalogo = await service!.listPublicPlans();
    const porSlug = new Map(catalogo.map((plano) => [plano.slug, plano]));

    expect(porSlug.get("standard")).toMatchObject({
      maxUsers: 5,
      maxOrdersPerMonth: 500,
      maxProducts: 500,
      maxCustomers: 2000,
    });
    expect(porSlug.get("pro")).toMatchObject({
      maxUsers: 20,
      maxOrdersPerMonth: 3000,
      maxProducts: 3000,
      maxCustomers: 10_000,
    });
  });

  it("entrega os módulos como lista de chaves conhecidas", async () => {
    const catalogo = await service!.listPublicPlans();

    for (const plano of catalogo) {
      expect(plano.modules).toEqual(
        expect.arrayContaining(["orders", "customers", "products"]),
      );
    }
  });

  it("não devolve id, timestamps nem qualquer campo interno", async () => {
    const catalogo = await service!.listPublicPlans();

    for (const plano of catalogo) {
      expect("id" in plano).toBe(false);
      expect("createdAt" in plano).toBe(false);
      expect("updatedAt" in plano).toBe(false);
    }
  });

  it("não devolve nada de Company, assinatura ou cliente", async () => {
    const catalogo = await service!.listPublicPlans();

    // Comparação por CONJUNTO DE CHAVES, não por substring: "customers" é um
    // módulo público e "maxCustomers" é um limite público — procurar o texto
    // "customer" acusaria os dois. O que precisa ser provado é que nenhuma
    // chave além das permitidas existe.
    for (const plano of catalogo) {
      expect(Object.keys(plano).sort()).toEqual(
        [
          "availableForCheckout",
          "maxCustomers",
          "maxOrdersPerMonth",
          "maxProducts",
          "maxUsers",
          "modules",
          "name",
          "priceMonthly",
          "priceYearly",
          "slug",
        ].sort(),
      );
    }

    // E que nenhum VALOR carregue identificador interno ou dado de contato.
    const valores = catalogo.flatMap((plano) => Object.values(plano).flat());
    for (const valor of valores) {
      if (typeof valor !== "string") continue;
      expect(valor).not.toMatch(/^c[a-z0-9]{20,}$/i); // cuid
      expect(valor).not.toContain("@");
    }
  });

  it("atravessa a serialização Server → Client sem perder nada", async () => {
    const catalogo = await service!.listPublicPlans();

    expect(JSON.parse(JSON.stringify(catalogo))).toEqual(catalogo);
  });

  it("responde sem autenticação — não há sessão nesta suíte", async () => {
    // Nenhum teste deste arquivo cria usuário, empresa ou sessão. O catálogo
    // responder aqui É a prova de que a leitura não depende de autenticação.
    const catalogo = await service!.listPublicPlans();

    expect(catalogo.length).toBeGreaterThan(0);
  });

  it("ignora plano fora da lista pública, mesmo existindo no banco", async () => {
    const todosNoBanco = await prisma!.plan.findMany();
    const catalogo = await service!.listPublicPlans();

    const foraDaLista = todosNoBanco.filter(
      (plano) => !PUBLIC_PLAN_SLUGS.some((slug) => slug === plano.slug),
    );
    const slugsPublicados = catalogo.map((plano) => plano.slug);

    for (const plano of foraDaLista) {
      expect(slugsPublicados).not.toContain(plano.slug);
    }
  });

  it("não altera o banco", async () => {
    const antes = await prisma!.plan.findMany({
      orderBy: { slug: "asc" },
      select: { slug: true, updatedAt: true, priceMonthly: true },
    });

    await service!.listPublicPlans();

    const depois = await prisma!.plan.findMany({
      orderBy: { slug: "asc" },
      select: { slug: true, updatedAt: true, priceMonthly: true },
    });

    expect(depois).toHaveLength(antes.length);
    expect(
      depois.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt.toISOString() })),
    ).toEqual(antes.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt.toISOString() })));
  });
});
