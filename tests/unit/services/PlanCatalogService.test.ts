import { afterEach, describe, expect, it, vi } from "vitest";

import { Prisma, type Plan } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import type { PlanRepository } from "@/repositories/interfaces/PlanRepository";
import { PlanCatalogService } from "@/services/PlanCatalogService";

function plano(slug: string, mensal: string, anual: string): Plan {
  return {
    id: `plan_${slug}`,
    slug,
    name: `Fluxy ${slug}`,
    priceMonthly: new Prisma.Decimal(mensal),
    priceYearly: new Prisma.Decimal(anual),
    modules: ["orders"],
    maxUsers: 5,
    maxOrdersPerMonth: 500,
    maxProducts: 500,
    maxCustomers: 2000,
    validapayPriceMonthlyId: null,
    validapayPriceYearlyId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

/** Repositório de mentira: devolve o que o teste mandar, sem tocar em banco. */
function repositorioCom(planos: Plan[]): PlanRepository {
  return {
    findBySlug: async (slug) => planos.find((p) => p.slug === slug) ?? null,
    listPublic: async () => planos,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlanCatalogService", () => {
  it("devolve o catálogo completo sem registrar erro", async () => {
    const erro = vi.spyOn(logger, "error").mockImplementation(() => {});
    const service = new PlanCatalogService(
      repositorioCom([
        plano("standard", "29.00", "290.00"),
        plano("pro", "89.00", "890.00"),
      ]),
    );

    const catalogo = await service.listPublicPlans();

    expect(catalogo.map((p) => p.slug)).toEqual(["standard", "pro"]);
    expect(erro).not.toHaveBeenCalled();
  });

  it("com um plano ausente, devolve o que existe e registra erro operacional", async () => {
    const erro = vi.spyOn(logger, "error").mockImplementation(() => {});
    const service = new PlanCatalogService(
      repositorioCom([plano("standard", "29.00", "290.00")]),
    );

    const catalogo = await service.listPublicPlans();

    // Uma oferta a menos é melhor que nenhuma: a página continua de pé.
    expect(catalogo.map((p) => p.slug)).toEqual(["standard"]);
    expect(erro).toHaveBeenCalledOnce();
    expect(erro.mock.calls[0]?.[1]).toMatchObject({ ausentes: ["pro"] });
  });

  it("com o catálogo vazio, devolve lista vazia em vez de inventar preço", async () => {
    const erro = vi.spyOn(logger, "error").mockImplementation(() => {});
    const service = new PlanCatalogService(repositorioCom([]));

    const catalogo = await service.listPublicPlans();

    expect(catalogo).toEqual([]);
    expect(erro).toHaveBeenCalledOnce();
    expect(erro.mock.calls[0]?.[1]).toMatchObject({ ausentes: ["standard", "pro"] });
  });

  it("não expõe nenhum método de escrita ou de busca por id", async () => {
    const service = new PlanCatalogService(repositorioCom([]));
    const metodos = Object.getOwnPropertyNames(PlanCatalogService.prototype).filter(
      (nome) => nome !== "constructor",
    );

    // A ausência é a proteção: não há caminho para alterar plano, preço,
    // limite ou assinatura porque não existe método que o faça.
    expect(metodos).toEqual(["listPublicPlans"]);
    expect(service).not.toHaveProperty("findById");
  });

  it("não recebe companyId nem sessão — a resposta independe de quem pergunta", async () => {
    // Catálogo incompleto de propósito (só standard), então o erro operacional
    // é esperado aqui e precisa do espião para não sujar a saída da suíte.
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const service = new PlanCatalogService(
      repositorioCom([plano("standard", "29.00", "290.00")]),
    );

    // Aridade zero: não há por onde passar identidade, então não há como o
    // resultado variar por usuário ou empresa.
    expect(service.listPublicPlans).toHaveLength(0);
    await expect(service.listPublicPlans()).resolves.toHaveLength(1);
  });
});
