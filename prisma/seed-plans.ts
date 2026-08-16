import type { PrismaClient } from "@/lib/generated/prisma/client";
import { DEFAULT_PLAN_SLUG, MODULE_KEYS, PUBLIC_PLAN_NAMES } from "@/lib/constants";

/**
 * Catálogo de planos — FONTE ÚNICA.
 *
 * Vive fora de `prisma/seed.ts` porque aquele arquivo é um script: ele cria um
 * PrismaClient e chama `main()` ao ser importado. Qualquer `import` dali
 * dispararia o seed completo, incluindo a empresa de demonstração. Extraindo
 * para cá, o seed e a preparação do banco de testes compartilham a mesma
 * definição sem que uma arraste a outra.
 *
 * Os testes afirmam estes valores literalmente (`maxUsers = 5`,
 * `maxOrdersPerMonth = 500`); duplicar a lista faria a duplicata divergir em
 * silêncio no dia em que um limite mudasse.
 */
/**
 * Anual = dez mensalidades, ou seja, dois meses grátis.
 *
 * Não é invenção: é a regra que os dois planos originais já seguiam
 * (29 → 290 e 89 → 890). Deixá-la explícita evita que o próximo plano seja
 * criado com um anual arbitrário, e o teste de catálogo a verifica.
 */
const MESES_COBRADOS_NO_ANUAL = 10;

function anual(mensal: number): number {
  return mensal * MESES_COBRADOS_NO_ANUAL;
}

export const PLANS = [
  {
    slug: DEFAULT_PLAN_SLUG,
    name: PUBLIC_PLAN_NAMES.standard,
    priceMonthly: 29,
    priceYearly: anual(29),
    maxUsers: 5,
    maxOrdersPerMonth: 500,
    maxProducts: 500,
    maxCustomers: 2000,
  },
  {
    slug: "plus",
    name: PUBLIC_PLAN_NAMES.plus,
    priceMonthly: 49,
    priceYearly: anual(49),
    maxUsers: 10,
    maxOrdersPerMonth: 1500,
    maxProducts: 1500,
    maxCustomers: 5000,
  },
  {
    slug: "pro",
    name: PUBLIC_PLAN_NAMES.pro,
    priceMonthly: 89,
    priceYearly: anual(89),
    maxUsers: 20,
    maxOrdersPerMonth: 3000,
    maxProducts: 3000,
    maxCustomers: 10_000,
  },
] as const;

/** Slugs esperados no catálogo, para verificação após a semeadura. */
export const PLAN_SLUGS: readonly string[] = PLANS.map((p) => p.slug);

/**
 * Sincroniza nome, módulos e limites — nunca preço.
 *
 * O `update` deixou de ser vazio de propósito. Com `update: {}`, mudar um
 * limite aqui nunca chegava a uma instalação existente: foi assim que o
 * `standard` ficou com 3 dos 5 módulos, criado antes de PRODUCTION e STOCK
 * entrarem em MODULE_KEYS e nunca mais corrigido.
 *
 * **Preço fica fora do update.** Alterá-lo é decisão comercial com contrato
 * por trás; um seed que reescreve preço a cada execução muda o que o cliente
 * paga sem ninguém pedir. Preço só é gravado na criação, quando não há
 * contrato anterior a respeitar.
 *
 * `modules` vem de Object.values(MODULE_KEYS), nunca de uma lista repetida
 * aqui — duplicar a lista faz o banco divergir do código na primeira vez que
 * um módulo novo for declarado.
 *
 * Idempotente: `upsert` por `slug`.
 */
export async function seedPlans(
  prisma: PrismaClient,
  log: (message: string) => void = console.log,
): Promise<void> {
  for (const plan of PLANS) {
    const { slug, name, priceMonthly, priceYearly, ...limits } = plan;

    const saved = await prisma.plan.upsert({
      where: { slug },
      update: {
        name,
        modules: Object.values(MODULE_KEYS),
        ...limits,
      },
      create: {
        slug,
        name,
        priceMonthly,
        priceYearly,
        modules: Object.values(MODULE_KEYS),
        ...limits,
      },
    });

    log(`Plan seeded: ${saved.name} (${saved.slug})`);
  }
}
