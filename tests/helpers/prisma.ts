import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

import { resolveTestDatabaseUrl } from "./test-database-url";

/**
 * Cliente Prisma dos testes de integração.
 *
 * Segunda guarda do isolamento: `vitest.config.ts` já aborta a suíte inteira se
 * o alvo não for `fluxy_test`, e aqui a validação acontece de novo, na criação
 * do client. Duas guardas porque a primeira depende do config ter sido carregado
 * como esperado; esta vale por qualquer caminho de invocação.
 *
 * LANÇA em vez de devolver `null`. A versão anterior devolvia `null` quando não
 * havia URL, e os testes se pulavam sozinhos via `skipIf` — uma suíte verde
 * podia significar que nada rodou.
 *
 * O `lib/db.ts` limita o pool a 3 conexões e este helper não. A diferença é
 * deliberada: aquele teto veio de um sintoma medido em runtime no Painel, e
 * copiá-lo para cá sem medir de novo seria adivinhação.
 */
export function createTestPrismaClient(): PrismaClient {
  const { url } = resolveTestDatabaseUrl();
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
