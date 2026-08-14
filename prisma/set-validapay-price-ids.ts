// Como em `prisma/seed.ts`: script de linha de comando não passa pelo Next,
// que é quem normalmente carrega o `.env`.
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

import { avaliarAlvoDeEscrita } from "./validapay-price-target";

/**
 * Grava os `priceId` da ValidaPay num plano — e NADA mais.
 *
 * **Por que um script, e não `seedPlans`.** O catálogo de planos é o mesmo em
 * toda instalação; estes identificadores não são. Eles pertencem a uma conta
 * específica de um ambiente específico: os do sandbox, gravados por um seed,
 * viajariam para produção e apontariam cobranças reais para preços de teste.
 * O schema já registra a mesma decisão — os IDs vivem no banco, não em
 * constante no código, porque mudam por ação de quem administra a conta, não
 * por deploy.
 *
 * **Por que não uma migration.** Migration descreve ESTRUTURA. Um `UPDATE` de
 * dado operacional dentro dela seria aplicado a qualquer banco que rodasse
 * `migrate deploy`, incluindo produção, com valores de outro ambiente.
 *
 * Reproduzível e idempotente: rodar duas vezes deixa o mesmo estado. Toca
 * exclusivamente as duas colunas de identificador — preço comercial, nome,
 * módulos e limites não são lidos nem escritos.
 *
 * Uso:
 *   npm run db:validapay-prices -- --slug=standard \
 *     --monthly=price_xxx --yearly=price_yyy [--dry-run]
 */

interface Argumentos {
  slug: string;
  monthly: string;
  yearly: string;
  dryRun: boolean;
}

/** `price_` seguido de algo. Não valida o conteúdo — é identificador de terceiro. */
const FORMATO_DE_PRICE_ID = /^price_[A-Za-z0-9_-]+$/;

function lerArgumentos(): Argumentos {
  const bruto = new Map<string, string>();

  for (const argumento of process.argv.slice(2)) {
    const separador = argumento.indexOf("=");
    if (argumento === "--dry-run") {
      bruto.set("dry-run", "true");
      continue;
    }
    if (!argumento.startsWith("--") || separador === -1) continue;
    bruto.set(argumento.slice(2, separador), argumento.slice(separador + 1).trim());
  }

  const slug = bruto.get("slug");
  const monthly = bruto.get("monthly");
  const yearly = bruto.get("yearly");

  const faltando = [
    ["--slug", slug],
    ["--monthly", monthly],
    ["--yearly", yearly],
  ]
    .filter(([, valor]) => !valor)
    .map(([nome]) => nome);

  if (faltando.length > 0) {
    throw new Error(
      `Argumentos obrigatórios ausentes: ${faltando.join(", ")}\n` +
        "Uso: --slug=standard --monthly=price_xxx --yearly=price_yyy [--dry-run]",
    );
  }

  const pares: readonly (readonly [string, string])[] = [
    ["--monthly", monthly!],
    ["--yearly", yearly!],
  ];

  for (const [nome, valor] of pares) {
    if (!FORMATO_DE_PRICE_ID.test(valor)) {
      // Guarda contra o erro mais provável e mais caro: passar um `prod_…` no
      // lugar de um `price_…`. A cobrança falharia só no primeiro checkout real.
      throw new Error(`${nome} não parece um priceId da ValidaPay: "${valor}"`);
    }
  }

  if (monthly === yearly) {
    // Mensal e anual apontando para o mesmo preço cobraria o valor errado num
    // dos dois caminhos, em silêncio.
    throw new Error("--monthly e --yearly não podem ser o mesmo priceId");
  }

  return {
    slug: slug!,
    monthly: monthly!,
    yearly: yearly!,
    dryRun: bruto.get("dry-run") === "true",
  };
}

async function main(): Promise<void> {
  const { slug, monthly, yearly, dryRun } = lerArgumentos();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não está definida.");
  }

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    // O alvo aparece antes de qualquer escrita: quem roda precisa ver em que
    // banco vai mexer, sem precisar conferir variável de ambiente por fora.
    const alvo = await client.$queryRaw<
      { current_database: string }[]
    >`SELECT current_database()`;
    const databaseName = alvo[0]?.current_database ?? null;

    console.log(`banco alvo: ${databaseName ?? "desconhecido"}`);
    console.log(`plano: ${slug}${dryRun ? "  (dry-run — nada será escrito)" : ""}\n`);

    // Guarda ANTES de qualquer leitura de negócio, e muito antes do UPDATE.
    // Vem do banco realmente conectado, não da URL: uma URL enganosa não
    // engana `current_database()`.
    const decisao = avaliarAlvoDeEscrita({ databaseName, dryRun });
    if (!decisao.permitido) {
      throw new Error(`Escrita recusada — ${decisao.motivo}`);
    }

    const antes = await client.plan.findUnique({ where: { slug } });
    if (!antes) {
      throw new Error(`Plano "${slug}" não existe neste banco.`);
    }

    console.log("antes:");
    console.log(`  priceMonthly ............... ${antes.priceMonthly.toString()}`);
    console.log(`  priceYearly ................ ${antes.priceYearly.toString()}`);
    console.log(
      `  validapayPriceMonthlyId .... ${antes.validapayPriceMonthlyId ?? "NULL"}`,
    );
    console.log(
      `  validapayPriceYearlyId ..... ${antes.validapayPriceYearlyId ?? "NULL"}`,
    );

    if (dryRun) {
      console.log("\ndry-run: nenhuma escrita executada.");
      return;
    }

    // `update` com `data` de dois campos: o Prisma gera um UPDATE apenas
    // dessas colunas. Nome, módulos, limites e preço comercial não entram na
    // instrução — não há como sobrescrevê-los por engano.
    const depois = await client.plan.update({
      where: { slug },
      data: { validapayPriceMonthlyId: monthly, validapayPriceYearlyId: yearly },
    });

    console.log("\ndepois:");
    console.log(`  priceMonthly ............... ${depois.priceMonthly.toString()}`);
    console.log(`  priceYearly ................ ${depois.priceYearly.toString()}`);
    console.log(`  validapayPriceMonthlyId .... ${depois.validapayPriceMonthlyId}`);
    console.log(`  validapayPriceYearlyId ..... ${depois.validapayPriceYearlyId}`);

    const problemas: string[] = [];
    if (depois.validapayPriceMonthlyId !== monthly) problemas.push("mensal divergente");
    if (depois.validapayPriceYearlyId !== yearly) problemas.push("anual divergente");
    // O preço comercial é lido de novo e comparado: a garantia de que este
    // script não mexe em dinheiro é verificada, não apenas afirmada.
    if (!depois.priceMonthly.equals(antes.priceMonthly)) {
      problemas.push("priceMonthly foi alterado");
    }
    if (!depois.priceYearly.equals(antes.priceYearly)) {
      problemas.push("priceYearly foi alterado");
    }
    if (depois.name !== antes.name) problemas.push("name foi alterado");

    if (problemas.length > 0) {
      throw new Error(`Verificação pós-escrita falhou: ${problemas.join("; ")}`);
    }

    console.log("\nOK — identificadores gravados, dados comerciais intactos.");
  } finally {
    await client.$disconnect();
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
