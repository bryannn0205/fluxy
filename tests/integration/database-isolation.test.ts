import { afterAll, describe, expect, it } from "vitest";

import { prisma as appPrisma } from "@/lib/db";

import { createTestPrismaClient } from "../helpers/prisma";
import { BANCO_ESPERADO } from "../helpers/test-database-url";

/**
 * Prova, com conexão real, que TODO caminho de Prisma sob o Vitest chega ao
 * banco de testes — e nenhum alcança `fluxy_dev`.
 *
 * São dois caminhos independentes, e cada um já vazou uma vez:
 *
 *   1. `createTestPrismaClient()`, usado diretamente pelos testes;
 *   2. o singleton de `lib/db.ts`, alcançado indiretamente quando um teste
 *      exercita serviços — foi por ele que `lib/tokens.ts` gravou
 *      `VerificationToken` no banco de desenvolvimento.
 *
 * Este arquivo é a rede que impede a regressão: se alguém remover a injeção de
 * `DATABASE_URL` do `vitest.config.ts`, ele falha antes de qualquer dado ser
 * escrito no lugar errado.
 */

const testPrisma = createTestPrismaClient();

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function currentDatabase(client: {
  $queryRaw: <T>(q: TemplateStringsArray) => Promise<T>;
}): Promise<string> {
  const rows = await client.$queryRaw<
    { current_database: string }[]
  >`SELECT current_database()`;
  return rows[0]!.current_database;
}

describe("isolamento do banco durante os testes", () => {
  it("helper de teste conecta em fluxy_test", async () => {
    const db = await currentDatabase(testPrisma);
    expect(db).toBe(BANCO_ESPERADO);
    expect(db).not.toBe("fluxy_dev");
  });

  it("singleton de lib/db.ts conecta em fluxy_test", async () => {
    const db = await currentDatabase(appPrisma);
    expect(db).toBe(BANCO_ESPERADO);
    expect(db).not.toBe("fluxy_dev");
  });

  it("os dois caminhos apontam para o MESMO banco", async () => {
    const [viaHelper, viaApp] = await Promise.all([
      currentDatabase(testPrisma),
      currentDatabase(appPrisma),
    ]);
    expect(viaHelper).toBe(viaApp);
  });
});
