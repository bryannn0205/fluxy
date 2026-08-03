import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Cliente Prisma dos testes de integração.
 *
 * Devolve `null` quando não há `DATABASE_URL`, para o teste se pular sozinho
 * via `describe.skipIf(!prisma)` em vez de falhar em ambiente sem banco.
 *
 * O `lib/db.ts` limita o pool a 3 conexões e este helper não. A diferença é
 * deliberada: aquele teto veio de um sintoma medido em runtime no Painel, e
 * copiá-lo para cá sem medir de novo seria adivinhação.
 */
export function createTestPrismaClient(): PrismaClient | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
