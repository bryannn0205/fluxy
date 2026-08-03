import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Em produção (Neon), migrations devem rodar com a connection string
    // direta (sem pooler) — configurar DATABASE_URL como a URL direta
    // apenas no passo de `prisma migrate deploy` do pipeline de CI.
    url: env("DATABASE_URL"),

    // O `prisma dev` expõe o banco como `template1`, e o Postgres clona
    // template1 em toda database nova — o shadow que o Prisma criaria
    // sozinho nasceria com o schema já aplicado, e o replay das migrations
    // falharia com "type already exists". Apontar para a instância separada
    // que o próprio `prisma dev` sobe na porta seguinte resolve.
    // Em produção não é usada: `migrate deploy` não cria shadow.
    shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
  },
});
