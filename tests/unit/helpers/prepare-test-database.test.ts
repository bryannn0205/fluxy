import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PLANS, PLAN_SLUGS } from "../../../prisma/seed-plans";
import {
  DELETE_ORDER,
  prepareTestDatabase,
  provarOrdemContraFks,
} from "../../helpers/prepare-test-database";

/**
 * Provas da preparação do banco de testes.
 *
 * Nenhum teste aqui conecta: os de alvo esperam rejeição antes da conexão, e os
 * demais são sobre a ordem de limpeza e sobre o próprio código-fonte do módulo.
 */

const url = (s: string) => ({ TEST_DATABASE_URL: s });

const ARQUIVO = join(__dirname, "../../helpers/prepare-test-database.ts");
const FONTE = readFileSync(ARQUIVO, "utf8");

/**
 * Fonte sem comentários.
 *
 * A varredura precisa olhar o CÓDIGO, não a documentação: o próprio módulo
 * explica que não usa TRUNCATE nem chama `seedDemoCompany`, e procurar por
 * essas palavras no texto inteiro acusaria a explicação como se fosse a
 * transgressão.
 */
const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("prepareTestDatabase — a limpeza só pode alcançar fluxy_test", () => {
  it("recusa quando TEST_DATABASE_URL está ausente", async () => {
    await expect(prepareTestDatabase({})).rejects.toThrow(
      /TEST_DATABASE_URL não definida/,
    );
  });

  it("NÃO usa DATABASE_URL como alternativa", async () => {
    const env = { DATABASE_URL: "postgresql://fluxy:s@localhost:5432/fluxy_test" };
    await expect(prepareTestDatabase(env)).rejects.toThrow(
      /TEST_DATABASE_URL não definida/,
    );
  });

  it.each(["fluxy_dev", "fluxy_shadow", "gestao_pedidos", "postgres"])(
    "recusa limpar o banco proibido %s",
    async (banco) => {
      await expect(
        prepareTestDatabase(url(`postgresql://fluxy:s@localhost:5432/${banco}`)),
      ).rejects.toThrow(/proibido para testes/);
    },
  );

  it("recusa banco remoto", async () => {
    await expect(
      prepareTestDatabase(url("postgresql://fluxy:s@db.exemplo.com:5432/fluxy_test")),
    ).rejects.toThrow(/host local/);
  });

  it("recusa porta diferente de 5432", async () => {
    await expect(
      prepareTestDatabase(url("postgresql://fluxy:s@localhost:51218/fluxy_test")),
    ).rejects.toThrow(/porta 5432/);
  });
});

describe("ordem de limpeza", () => {
  it("cobre exatamente as 18 tabelas de negócio, sem repetição", () => {
    expect(DELETE_ORDER).toHaveLength(18);
    expect(new Set(DELETE_ORDER).size).toBe(18);
  });

  it("NÃO inclui _prisma_migrations", () => {
    expect(DELETE_ORDER).not.toContain("_prisma_migrations");
    expect(CODIGO).not.toMatch(/_prisma_migrations"?\s*$/m);
  });

  it("é topologicamente reversa: dependente antes do dependido", () => {
    // Amostra representativa das 33 FKs reais, incluindo as compostas.
    const fks = [
      { src: "User", tgt: "Company" },
      { src: "Company", tgt: "Plan" },
      { src: "Order", tgt: "Customer" },
      { src: "OrderItem", tgt: "Order" },
      { src: "OrderItem", tgt: "Product" },
      { src: "Payment", tgt: "Order" },
      { src: "Payment", tgt: "User" },
      { src: "StockMovement", tgt: "Product" },
      { src: "SubscriptionCheckout", tgt: "Plan" },
      { src: "PaymentProviderEvent", tgt: "Company" },
      { src: "Account", tgt: "User" },
      { src: "Notification", tgt: "Order" },
    ];
    expect(() => provarOrdemContraFks(fks, DELETE_ORDER)).not.toThrow();
  });

  it("a prova REJEITA uma ordem inválida", () => {
    const invertida = [...DELETE_ORDER].reverse();
    expect(() =>
      provarOrdemContraFks([{ src: "User", tgt: "Company" }], invertida),
    ).toThrow(/precisa vir antes de/);
  });

  it("a prova rejeita FK para tabela fora da ordem", () => {
    expect(() =>
      provarOrdemContraFks([{ src: "User", tgt: "TabelaFantasma" }], DELETE_ORDER),
    ).toThrow(/não está na ordem de limpeza/);
  });
});

describe("a preparação é mínima e não usa instrução destrutiva ampla", () => {
  it("não contém TRUNCATE, DROP nem desativação de constraint", () => {
    expect(CODIGO).not.toMatch(/TRUNCATE/i);
    expect(CODIGO).not.toMatch(/\bDROP\b/i);
    expect(CODIGO).not.toMatch(/session_replication_role/i);
    expect(CODIGO).not.toMatch(/DISABLE TRIGGER/i);
  });

  it("chama seedPlans e NÃO chama seedDemoCompany nem applyApprovedPriceChange", () => {
    expect(CODIGO).toMatch(/seedPlans\(/);
    expect(CODIGO).not.toMatch(/seedDemoCompany/);
    expect(CODIGO).not.toMatch(/applyApprovedPriceChange/);
  });

  it("confirma o alvo pelo servidor, não só pela URL", () => {
    expect(CODIGO).toMatch(/current_database\(\)/);
    expect(CODIGO).toMatch(/current_user/);
  });

  it("trava as tabelas antes de apagar", () => {
    expect(CODIGO).toMatch(/LOCK TABLE/);
    expect(CODIGO).toMatch(/SHARE ROW EXCLUSIVE/);
  });
});

describe("catálogo de planos — fonte única", () => {
  it("declara exatamente standard e pro", () => {
    expect([...PLAN_SLUGS]).toEqual(["standard", "pro"]);
  });

  it("preserva os limites que os testes de integração afirmam", () => {
    expect(PLANS.find((p) => p.slug === "standard")).toMatchObject({
      name: "Fluxy Standard",
      priceMonthly: 29,
      priceYearly: 290,
      maxUsers: 5,
      maxOrdersPerMonth: 500,
      maxProducts: 500,
      maxCustomers: 2000,
    });
    expect(PLANS.find((p) => p.slug === "pro")).toMatchObject({
      name: "Fluxy Pro",
      priceMonthly: 89,
      priceYearly: 890,
      maxUsers: 20,
      maxOrdersPerMonth: 3000,
      maxProducts: 3000,
      maxCustomers: 10_000,
    });
  });
});
