import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildPostAuthUrl, parsePlanIntent } from "@/lib/plan-intent";

/** O caminho que a intenção percorre de verdade: query → parser → destino. */
function destinoPara(query: string): string {
  const parametros = new URLSearchParams(query);
  return buildPostAuthUrl(
    parsePlanIntent({
      plan: parametros.get("plan"),
      billing: parametros.get("billing"),
    }),
  );
}

describe("destino após autenticação", () => {
  it("sem intenção vai ao painel limpo", () => {
    expect(buildPostAuthUrl(null)).toBe("/dashboard");
    expect(destinoPara("")).toBe("/dashboard");
  });

  it("Standard vai ao painel limpo — não há o que avisar", () => {
    expect(destinoPara("plan=standard&billing=monthly")).toBe("/dashboard");
    expect(destinoPara("plan=standard&billing=yearly")).toBe("/dashboard");
  });

  it("Pro carrega a escolha para o aviso", () => {
    expect(destinoPara("plan=pro&billing=monthly")).toBe(
      "/dashboard?plan=pro&billing=monthly",
    );
    expect(destinoPara("plan=pro&billing=yearly")).toBe(
      "/dashboard?plan=pro&billing=yearly",
    );
  });

  it("intenção inválida cai no painel limpo, nunca em Pro", () => {
    for (const query of [
      "plan=enterprise&billing=monthly",
      "plan=pro&billing=weekly",
      "plan=PRO&billing=monthly",
      "plan=%20pro&billing=monthly",
      "billing=yearly",
      "plan=&billing=",
    ]) {
      expect(destinoPara(query)).toBe("/dashboard");
    }
  });
});

describe("o destino é fechado no código", () => {
  it("sempre começa em /dashboard, seja qual for a entrada", () => {
    const entradas = [
      "plan=pro&billing=yearly",
      "plan=pro&billing=monthly&next=https://malicioso.example",
      "plan=standard&billing=monthly&callbackUrl=/dashboard/settings",
      "plan=pro&redirectTo=//evil.example",
    ];

    for (const query of entradas) {
      const destino = destinoPara(query);
      expect(destino.startsWith("/dashboard")).toBe(true);
      expect(destino.startsWith("//")).toBe(false);
      expect(destino).not.toMatch(/^[a-z]+:/i);
      expect(destino).not.toContain("://");
    }
  });

  it("nenhum parâmetro além de plan e billing atravessa", () => {
    const destino = destinoPara(
      "plan=pro&billing=yearly&planId=abc&price=0.00&subscriptionStatus=ACTIVE&role=OWNER&companyId=xyz",
    );
    const parametros = new URLSearchParams(destino.split("?")[1]);

    expect([...parametros.keys()].sort()).toEqual(["billing", "plan"]);
    for (const proibido of [
      "planId",
      "price",
      "subscriptionStatus",
      "role",
      "companyId",
    ]) {
      expect(destino).not.toContain(proibido);
    }
  });
});

describe("as actions revalidam no servidor", () => {
  const acoes = [
    join(process.cwd(), "app", "(auth)", "register", "actions.ts"),
    join(process.cwd(), "app", "(auth)", "login", "actions.ts"),
  ];

  function codigo(caminho: string): string {
    return readFileSync(caminho, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  it("chamam parsePlanIntent, sem confiar no cliente", () => {
    for (const caminho of acoes) {
      expect(codigo(caminho)).toContain("parsePlanIntent(");
    }
  });

  it("o destino sai de buildPostAuthUrl, não de string solta", () => {
    for (const caminho of acoes) {
      const fonte = codigo(caminho);
      expect(fonte).toContain("redirectTo: buildPostAuthUrl(intent)");
      expect(fonte).not.toContain('redirectTo: "/dashboard"');
    }
  });

  it("não honram callbackUrl nem redirect vindos do navegador", () => {
    for (const caminho of acoes) {
      const fonte = codigo(caminho);
      for (const proibido of ["callbackUrl", "redirectTo: input", "next=", "returnUrl"]) {
        expect(fonte).not.toContain(proibido);
      }
    }
  });

  it("a intenção não entra no schema que alimenta a persistência", () => {
    const schema = readFileSync(join(process.cwd(), "schemas", "auth.schema.ts"), "utf8");

    // registerSchema define o que vira User e Company. Se `plan` aparecesse
    // aqui, a intenção teria caminho até o banco.
    expect(schema).not.toContain("plan");
    expect(schema).not.toContain("billing");
    expect(schema).not.toContain("planId");
    expect(schema).not.toContain("subscriptionStatus");
  });

  it("o cadastro continua criando o trial pelo caminho existente", () => {
    const fonte = codigo(acoes[0]!);

    // Uma chamada, ao service que já existia — a regra de trial não foi
    // duplicada nem reimplementada nesta fase.
    expect(fonte).toContain("authService.register(validation.data)");
    expect(fonte).not.toContain("planId");
    expect(fonte).not.toContain("trialEndsAt");
    expect(fonte).not.toContain("subscriptionStatus");
  });
});
