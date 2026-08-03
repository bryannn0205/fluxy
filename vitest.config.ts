import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["**/node_modules/**", "**/tests/e2e/**"],
    // Testes de integração abrem cada um seu próprio PrismaClient contra o
    // Postgres local do `prisma dev` — rodar os arquivos de teste em
    // paralelo (padrão do Vitest) faz esses clients concorrerem pela mesma
    // instância embutida e quebra no protocolo (bind message / prepared
    // statement). Sequencial evita a contenção; a suíte inteira ainda roda
    // em segundos.
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
