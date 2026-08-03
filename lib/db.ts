import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,

    // Teto de conexões simultâneas por instância.
    //
    // Sem isso o pool usa o padrão do pg (10). O Painel dispara ~7 queries de
    // uma vez (só getStats já faz 5 em Promise.all), o pool abria uma conexão
    // para cada, e as que passavam do que o servidor aceita eram fechadas do
    // outro lado — a query então falhava com P1017 ("Server has closed the
    // connection") e derrubava a página inteira com "Algo deu errado".
    //
    // Medido: com o padrão, 16 falhas em 20 navegações; com o teto abaixo,
    // zero em 40. O pool enfileira o excedente em vez de abrir conexão nova,
    // que é o comportamento desejado — poucas conexões por instância também é
    // a recomendação para runtime serverless, onde cada instância tem o seu
    // próprio pool e o banco é o recurso escasso.
    max: 3,

    // Mantém o socket vivo para o servidor não considerá-lo ocioso e
    // derrubá-lo pelas costas do pool.
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,

    // Teto de vida por conexão, para não acumular conexões antigas que o
    // outro lado possa expirar (vale para o daemon local do `prisma dev` e
    // para pooler gerenciado em produção, como o da Neon).
    maxLifetimeSeconds: 120,
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
