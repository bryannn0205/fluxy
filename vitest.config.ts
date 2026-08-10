import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { config as loadDotenv } from "dotenv";

import { resolveTestDatabaseUrl } from "./tests/helpers/test-database-url";

// `dotenv` explícito, e não `loadEnv` do Vite: o `loadEnv` só expõe variáveis
// com o prefixo configurado (`VITE_` por padrão) e exigiria afrouxar isso para
// enxergar TEST_DATABASE_URL. O `dotenv` já é dependência do projeto e é o
// mesmo mecanismo usado por `prisma.config.ts`, `prisma/seed.ts` e
// `tests/setup.ts` — um só comportamento de carregamento em todo o repositório.
//
// Não se pode supor que `process.env.TEST_DATABASE_URL` já exista quando este
// arquivo é avaliado: quem roda `npm test` não exporta a variável no shell, ela
// vive no `.env`.
loadDotenv();

// GUARDA A — avaliada ao carregar o config, antes de qualquer teste.
// Se o alvo não for exatamente localhost:5432/fluxy_test, isto lança e o Vitest
// aborta sem executar nada.
const alvo = resolveTestDatabaseUrl();

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],

    // Prepara `fluxy_test` com o catálogo de planos antes da suíte e aborta se
    // o alvo ou o estado inicial não forem os esperados. Ver tests/global-setup.ts.
    globalSetup: ["./tests/global-setup.ts"],

    exclude: ["**/node_modules/**", "**/tests/e2e/**"],

    // AMBAS as variáveis apontam para o banco de testes.
    //
    // `TEST_DATABASE_URL` cobre `tests/helpers/prisma.ts`. `DATABASE_URL` cobre
    // o singleton de `lib/db.ts`, que os serviços e actions exercitados pelos
    // testes importam — foi por esse segundo caminho que `lib/tokens.ts`
    // gravou `VerificationToken` no banco de desenvolvimento.
    //
    // Nenhuma lógica de teste foi colocada em `lib/db.ts`: ele continua lendo
    // `DATABASE_URL` normalmente, e é o AMBIENTE que muda sob o Vitest. Fora
    // dos testes, `DATABASE_URL` segue apontando para `fluxy_dev`.
    //
    // `tests/setup.ts` faz `import "dotenv/config"`, e o dotenv não sobrescreve
    // variável já presente — então estes valores prevalecem.
    env: {
      TEST_DATABASE_URL: alvo.url,
      DATABASE_URL: alvo.url,
    },

    // Testes de integração abrem cada um seu próprio PrismaClient contra o
    // Postgres local — rodar os arquivos de teste em paralelo (padrão do
    // Vitest) faz esses clients concorrerem pela mesma instância e quebra no
    // protocolo (bind message / prepared statement). Sequencial evita a
    // contenção; a suíte inteira ainda roda em segundos.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["services/**", "lib/**", "repositories/**"],
      exclude: ["lib/generated/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
