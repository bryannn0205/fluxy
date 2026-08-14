import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BANCO_PERMITIDO_PARA_ESCRITA,
  avaliarAlvoDeEscrita,
} from "@/prisma/validapay-price-target";

const CAMINHO_SCRIPT = join(process.cwd(), "prisma", "set-validapay-price-ids.ts");

function codigoDoScript(): string {
  return readFileSync(CAMINHO_SCRIPT, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("alvo permitido", () => {
  it("fluxy_dev com escrita é permitido", () => {
    expect(avaliarAlvoDeEscrita({ databaseName: "fluxy_dev", dryRun: false })).toEqual({
      permitido: true,
    });
  });

  it("fluxy_dev com dry-run é permitido", () => {
    expect(avaliarAlvoDeEscrita({ databaseName: "fluxy_dev", dryRun: true })).toEqual({
      permitido: true,
    });
  });

  it("dry-run inspeciona qualquer alvo — não escreve nada", () => {
    for (const databaseName of ["fluxy_prod", "postgres", "gestao_pedidos", null]) {
      expect(avaliarAlvoDeEscrita({ databaseName, dryRun: true }).permitido).toBe(true);
    }
  });
});

describe("alvo recusado", () => {
  it.each(["fluxy_prod", "producao", "fluxy_test", "postgres", "gestao_pedidos"])(
    "escrita em %s é recusada",
    (databaseName) => {
      const decisao = avaliarAlvoDeEscrita({ databaseName, dryRun: false });

      // Identificador de sandbox gravado em outro banco apontaria cobrança
      // real para preço de teste.
      expect(decisao.permitido).toBe(false);
    },
  );

  it("banco não identificado é recusado — falha FECHADA", () => {
    const decisao = avaliarAlvoDeEscrita({ databaseName: null, dryRun: false });

    // Não saber onde se está não pode virar permissão.
    expect(decisao.permitido).toBe(false);
  });

  it("string vazia não passa por engano", () => {
    expect(avaliarAlvoDeEscrita({ databaseName: "", dryRun: false }).permitido).toBe(
      false,
    );
  });

  it("a comparação é exata — nome parecido não passa", () => {
    for (const parecido of [
      "fluxy_dev2",
      "xfluxy_dev",
      "fluxy_development",
      "FLUXY_DEV",
    ]) {
      expect(
        avaliarAlvoDeEscrita({ databaseName: parecido, dryRun: false }).permitido,
      ).toBe(false);
    }
  });

  it("o motivo nomeia o banco, e nunca a URL ou a senha", () => {
    const decisao = avaliarAlvoDeEscrita({ databaseName: "fluxy_prod", dryRun: false });

    expect(decisao.permitido).toBe(false);
    if (decisao.permitido) return;

    expect(decisao.motivo).toContain("fluxy_prod");
    expect(decisao.motivo).toContain(BANCO_PERMITIDO_PARA_ESCRITA);
    // Mensagem de erro é um dos lugares por onde credencial vaza para log.
    for (const proibido of ["postgresql://", "@localhost", "password", "://"]) {
      expect(decisao.motivo).not.toContain(proibido);
    }
  });
});

describe("o script honra a guarda", () => {
  it("avalia o alvo antes de qualquer update", () => {
    const fonte = codigoDoScript();

    const posicaoDaGuarda = fonte.indexOf("avaliarAlvoDeEscrita");
    const posicaoDoUpdate = fonte.indexOf("client.plan.update");

    expect(posicaoDaGuarda).toBeGreaterThan(-1);
    expect(posicaoDoUpdate).toBeGreaterThan(-1);
    // A ordem no arquivo é a ordem de execução: a guarda vem antes.
    expect(posicaoDaGuarda).toBeLessThan(posicaoDoUpdate);
  });

  it("não existe escape de produção", () => {
    const fonte = codigoDoScript();

    // Um `--force` transformaria a guarda em sugestão.
    for (const proibido of ["force", "FORCE", "skipGuard", "allowProduction", "--prod"]) {
      expect(fonte).not.toContain(proibido);
    }
  });

  it("nenhum priceId de sandbox está embutido no script", () => {
    const fonte = codigoDoScript();

    // Os identificadores são configuração de ambiente, passada por argumento.
    expect(fonte).not.toMatch(/price_\d{10,}/);
  });
});
