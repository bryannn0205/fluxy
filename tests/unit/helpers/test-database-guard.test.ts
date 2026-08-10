import { describe, expect, it } from "vitest";

import { createTestPrismaClient } from "../../helpers/prisma";
import { BANCO_ESPERADO, resolveTestDatabaseUrl } from "../../helpers/test-database-url";

/**
 * Guardas que impedem a suíte de escrever no banco de desenvolvimento.
 *
 * Existem por causa de dois incidentes reais e distintos:
 *
 *   1. `createTestPrismaClient` lia `DATABASE_URL` — 28 linhas em
 *      `VerificationToken` e o `updatedAt` de um `Plan` foram gravados em
 *      `fluxy_dev`;
 *   2. mesmo depois de isolar o helper, o singleton de `lib/db.ts` — usado por
 *      `lib/tokens.ts`, que os serviços exercitados pelos testes chamam —
 *      continuava lendo `DATABASE_URL` e gravou outras 28 linhas.
 *
 * Nenhum teste aqui abre conexão: todos falham na validação antes disso, e os
 * casos "OK" apenas constroem o objeto.
 */

const URL_VALIDA = `postgresql://fluxy:senha@localhost:5432/${BANCO_ESPERADO}?schema=public`;
const url = (s: string) => ({ TEST_DATABASE_URL: s });

describe("resolveTestDatabaseUrl", () => {
  it("falha quando TEST_DATABASE_URL não está definida", () => {
    expect(() => resolveTestDatabaseUrl({})).toThrow(/TEST_DATABASE_URL não definida/);
  });

  it("NÃO aceita DATABASE_URL como alternativa", () => {
    const env = { DATABASE_URL: URL_VALIDA };
    expect(() => resolveTestDatabaseUrl(env)).toThrow(/TEST_DATABASE_URL não definida/);
  });

  it.each(["fluxy_dev", "fluxy_shadow", "gestao_pedidos", "postgres"])(
    "recusa o banco proibido %s",
    (banco) => {
      expect(() =>
        resolveTestDatabaseUrl(url(`postgresql://fluxy:s@localhost:5432/${banco}`)),
      ).toThrow(/proibido para testes/);
    },
  );

  it("recusa qualquer banco que não seja fluxy_test", () => {
    expect(() =>
      resolveTestDatabaseUrl(url("postgresql://fluxy:s@localhost:5432/outro")),
    ).toThrow(/deve apontar para "fluxy_test"/);
  });

  it("recusa host remoto", () => {
    expect(() =>
      resolveTestDatabaseUrl(
        url(`postgresql://fluxy:s@db.exemplo.com:5432/${BANCO_ESPERADO}`),
      ),
    ).toThrow(/host local/);
  });

  it("recusa porta diferente de 5432", () => {
    expect(() =>
      resolveTestDatabaseUrl(
        url(`postgresql://fluxy:s@localhost:51218/${BANCO_ESPERADO}`),
      ),
    ).toThrow(/porta 5432/);
  });

  it("recusa URL malformada", () => {
    expect(() => resolveTestDatabaseUrl(url("isto-nao-e-uma-url"))).toThrow(
      /não é uma URL válida/,
    );
  });

  it("aceita localhost:5432/fluxy_test", () => {
    const alvo = resolveTestDatabaseUrl(url(URL_VALIDA));
    expect(alvo.host).toBe("localhost");
    expect(alvo.port).toBe(5432);
    expect(alvo.database).toBe(BANCO_ESPERADO);
  });

  it("aceita 127.0.0.1:5432/fluxy_test", () => {
    const alvo = resolveTestDatabaseUrl(
      url(`postgresql://fluxy:s@127.0.0.1:5432/${BANCO_ESPERADO}`),
    );
    expect(alvo.host).toBe("127.0.0.1");
    expect(alvo.database).toBe(BANCO_ESPERADO);
  });

  it("DATABASE_URL apontando para fluxy_dev não influencia o alvo de teste", () => {
    const env = {
      TEST_DATABASE_URL: URL_VALIDA,
      DATABASE_URL: "postgresql://fluxy:s@localhost:5432/fluxy_dev",
    };
    expect(resolveTestDatabaseUrl(env).database).toBe(BANCO_ESPERADO);
  });

  it("não vaza usuário nem senha na mensagem de erro", () => {
    const env = url("postgresql://fluxy:SENHA-SECRETA@localhost:5432/fluxy_dev");
    try {
      resolveTestDatabaseUrl(env);
      expect.unreachable("deveria ter lançado");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("SENHA-SECRETA");
      expect(msg).not.toContain("postgresql://");
      expect(msg).toContain("localhost:5432/fluxy_dev");
    }
  });
});

describe("ambiente resolvido durante o Vitest", () => {
  it("TEST_DATABASE_URL resolvida aponta para fluxy_test", () => {
    expect(resolveTestDatabaseUrl().database).toBe(BANCO_ESPERADO);
  });

  it("DATABASE_URL também aponta para fluxy_test — nenhum caminho alcança fluxy_dev", () => {
    const bruta = process.env.DATABASE_URL;
    expect(bruta).toBeDefined();
    const database = decodeURIComponent(new URL(bruta!).pathname.replace(/^\//, ""));
    expect(database).toBe(BANCO_ESPERADO);
    expect(database).not.toBe("fluxy_dev");
  });

  it("createTestPrismaClient constrói o client sem lançar", () => {
    expect(() => createTestPrismaClient()).not.toThrow();
  });
});
