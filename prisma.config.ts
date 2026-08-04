import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Lido com `process.env`, e NÃO com `env()`, de propósito.
//
// `env()` resolve na CARGA deste arquivo, não no momento em que o comando
// precisa do valor — então `prisma generate` num ambiente sem a variável
// falhava com PrismaConfigEnvError antes de sequer decidir se usaria shadow.
// É o que quebrava o build na Vercel, onde a variável não existe (e não deve
// existir: nenhum comando de deploy cria banco sombra).
//
// Só o `prisma migrate dev` local usa shadow. Quando a variável está definida,
// o comportamento continua idêntico ao de antes.
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL?.trim();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Segue obrigatória e com `env()`: sem DATABASE_URL nada funciona, e a
    // falha na carga é justamente o que se quer — clara e imediata.
    //
    // Em produção (Neon), migrations devem rodar com a connection string
    // direta (sem pooler) — configurar DATABASE_URL como a URL direta
    // apenas no passo de `prisma migrate deploy` do pipeline de CI.
    url: env("DATABASE_URL"),

    // Incluída apenas quando existe de fato. Nada de cair para DATABASE_URL:
    // o shadow precisa ser uma instância SEPARADA, senão o `migrate dev`
    // apagaria o banco de trabalho ao recriar o schema do zero.
    //
    // O `prisma dev` expõe o banco como `template1`, e o Postgres clona
    // template1 em toda database nova — o shadow que o Prisma criaria sozinho
    // nasceria com o schema já aplicado, e o replay das migrations falharia
    // com "type already exists". Apontar para a instância separada que o
    // próprio `prisma dev` sobe na porta seguinte resolve.
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});
