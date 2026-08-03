import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";

const __dirname = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = defineConfig([
  // next/core-web-vitals já inclui eslint-plugin-jsx-a11y (acessibilidade).
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "no-console": "error",
    },
  },
  {
    // Scripts de CLI (seed, migrations) rodam fora do app — console é a
    // saída esperada aqui, não um logger estruturado de produção.
    files: ["prisma/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Error boundaries são Client Components por exigência do Next.js —
    // não podem importar o logger estruturado (server-only, ver lib/env.ts).
    // console é o reporte correto aqui.
    files: ["**/error.tsx", "**/global-error.tsx"],
    rules: {
      "no-console": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "lib/generated/**",
  ]),
]);

export default eslintConfig;
