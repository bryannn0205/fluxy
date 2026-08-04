import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";
import { DEFAULT_PLAN_SLUG, MODULE_KEYS, TRIAL_DURATION_DAYS } from "@/lib/constants";
import { hashPassword } from "@/lib/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Definição declarativa dos planos. Preço fica aqui só para a CRIAÇÃO — a
// sincronização normal não o toca; ver seedPlans e applyApprovedPriceChange.
const PLANS = [
  {
    slug: DEFAULT_PLAN_SLUG,
    name: "Fluxy Standard",
    priceMonthly: 29,
    priceYearly: 290,
    maxUsers: 5,
    maxOrdersPerMonth: 500,
    maxProducts: 500,
    maxCustomers: 2000,
  },
  {
    slug: "pro",
    name: "Fluxy Pro",
    priceMonthly: 89,
    priceYearly: 890,
    maxUsers: 20,
    maxOrdersPerMonth: 3000,
    maxProducts: 3000,
    maxCustomers: 10_000,
  },
] as const;

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
 */
async function seedPlans() {
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

    console.log(`Plan seeded: ${saved.name} (${saved.slug})`);
  }
}

// Reajuste comercial aprovado em 04/08/2026 para o plano standard.
// Aplica-se SOMENTE a este plano; o `pro` nunca é tocado por aqui.
const APPROVED_PRICE_CHANGE = {
  slug: DEFAULT_PLAN_SLUG,
  // Strings, não números: a comparação é feita pelo Decimal do Prisma, e
  // converter para Number para decidir sobre dinheiro é o hábito que produz
  // erro de centavo.
  from: { monthly: "59", yearly: "590" },
  to: { monthly: "29", yearly: "290" },
} as const;

/**
 * Reajuste de preço — exige autorização explícita por variável de ambiente.
 *
 * **Duas travas, e as duas precisam ceder:**
 *
 * 1. `APPLY_APPROVED_PLAN_PRICE_CHANGE` tem de ser exatamente `"true"`. Sem
 *    isso o seed roda inteiro e não encosta em preço. Um seed que reajusta
 *    sozinho porque "o banco ainda está no valor antigo" mudaria o que o
 *    cliente paga em produção ou staging só por alguém ter rodado o comando.
 * 2. O preço atual tem de ser EXATAMENTE o de origem aprovado. Se já foi
 *    aplicado, ou se alguém definiu outro valor por outra via, o valor
 *    existente é preservado — a flag autoriza *este* reajuste, não qualquer
 *    sobrescrita.
 *
 * Depois de aplicado em produção, a flag deve ser removida imediatamente das
 * variáveis do ambiente. Ela é controle operacional de uma execução, não
 * configuração permanente. Ver a nota em .env.example.
 */
async function applyApprovedPriceChange() {
  if (process.env.APPLY_APPROVED_PLAN_PRICE_CHANGE !== "true") {
    console.log(
      "Price change: ignorado — APPLY_APPROVED_PLAN_PRICE_CHANGE não está ativa.",
    );
    return;
  }

  const current = await prisma.plan.findUnique({
    where: { slug: APPROVED_PRICE_CHANGE.slug },
    select: { priceMonthly: true, priceYearly: true },
  });

  if (!current) {
    console.log(
      `Price change: plano ${APPROVED_PRICE_CHANGE.slug} não existe, ignorando.`,
    );
    return;
  }

  // `.equals()` é do Decimal e aceita string — compara valor, não formatação:
  // 59, 59.0 e 59.00 são o mesmo número, e nenhum float entra na conta.
  const atPricedOrigin =
    current.priceMonthly.equals(APPROVED_PRICE_CHANGE.from.monthly) &&
    current.priceYearly.equals(APPROVED_PRICE_CHANGE.from.yearly);

  if (!atPricedOrigin) {
    console.log(
      `Price change: preço atual de ${APPROVED_PRICE_CHANGE.slug} ` +
        `(${current.priceMonthly.toFixed(2)}/${current.priceYearly.toFixed(2)}) ` +
        `não corresponde ao de origem aprovado ` +
        `(${APPROVED_PRICE_CHANGE.from.monthly}/${APPROVED_PRICE_CHANGE.from.yearly}). ` +
        "Valor existente preservado.",
    );
    return;
  }

  await prisma.plan.update({
    where: { slug: APPROVED_PRICE_CHANGE.slug },
    data: {
      priceMonthly: APPROVED_PRICE_CHANGE.to.monthly,
      priceYearly: APPROVED_PRICE_CHANGE.to.yearly,
    },
  });

  console.log(
    `Price change APLICADO: ${APPROVED_PRICE_CHANGE.slug} ` +
      `${APPROVED_PRICE_CHANGE.from.monthly}/${APPROVED_PRICE_CHANGE.from.yearly} -> ` +
      `${APPROVED_PRICE_CHANGE.to.monthly}/${APPROVED_PRICE_CHANGE.to.yearly}`,
  );
}

async function seedDemoCompany(planId: string) {
  const existing = await prisma.company.findUnique({
    where: { email: "demo@fluxy.com.br" },
  });
  if (existing) {
    console.log("Demo company already exists, skipping.");
    return;
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

  const passwordHash = await hashPassword("Teste@123");

  const company = await prisma.company.create({
    data: {
      name: "Sorveteria Demo",
      email: "demo@fluxy.com.br",
      planId,
      trialEndsAt,
      subscriptionStatus: "TRIALING",
      users: {
        create: {
          name: "Admin Demo",
          email: "demo@fluxy.com.br",
          passwordHash,
          role: "OWNER",
          emailVerified: new Date(),
        },
      },
    },
    include: { users: true },
  });

  const owner = company.users[0];
  if (!owner) throw new Error("Owner not created");
  const ownerId = owner.id;

  const customers = await Promise.all(
    ["Ana Silva", "Bruno Costa", "Carla Souza"].map((name, i) =>
      prisma.customer.create({
        data: {
          companyId: company.id,
          name,
          email: `cliente${i + 1}@exemplo.com`,
          phone: "11999999999",
        },
      }),
    ),
  );

  // morango nasce abaixo do próprio lowStockThreshold de propósito — para o
  // alerta de estoque baixo (Painel e página de Estoque) já aparecer populado.
  const products = await Promise.all(
    [
      {
        sku: "SORV-001",
        name: "Sorvete de Chocolate 1L",
        price: 24.9,
        costPrice: 12,
        stockQuantity: 15,
        lowStockThreshold: 10,
      },
      {
        sku: "SORV-002",
        name: "Sorvete de Morango 1L",
        price: 22.9,
        costPrice: 11,
        stockQuantity: 8,
        lowStockThreshold: 10,
      },
      {
        sku: "SORV-003",
        name: "Picolé de Limão",
        price: 4.5,
        costPrice: 1.8,
        stockQuantity: 120,
        lowStockThreshold: 30,
      },
    ].map((product) =>
      prisma.product.create({
        data: { companyId: company.id, unit: "UN", active: true, ...product },
      }),
    ),
  );

  const [ana, bruno, carla] = customers;
  const [chocolate, morango, picole] = products;
  if (!ana || !bruno || !carla || !chocolate || !morango || !picole) {
    throw new Error("Seed data not created as expected");
  }

  // Pedidos abaixo são criados via prisma.order.create() direto (não
  // OrderService), então não passam pelo débito automático de estoque em
  // PrismaOrderRepository — por isso o saldo inicial acima já é o saldo
  // "atual" exibido. Só o registro do saldo inicial no ledger é seedado
  // aqui, para a aba de Movimentações não aparecer vazia na demo.
  await prisma.stockMovement.createMany({
    data: products.map((product) => ({
      companyId: company.id,
      productId: product.id,
      reason: "RESTOCK" as const,
      quantityDelta: product.stockQuantity,
      balanceAfter: product.stockQuantity,
      note: "Estoque inicial",
      createdById: ownerId,
    })),
  });

  // Constrói a data-calendário do mesmo jeito que o fluxo real (input date
  // do navegador → "YYYY-MM-DD" → `new Date(...)`, ver OrderDetailsForm.tsx)
  // em vez de `date.setHours(0,0,0,0)`, que zera no fuso LOCAL do processo
  // e gravaria uma meia-noite diferente da meia-noite UTC usada por pedidos
  // reais — os dados de demonstração ficariam inconsistentes com o que a
  // aplicação realmente grava.
  function daysFromNow(days: number): Date {
    const local = new Date();
    local.setDate(local.getDate() + days);
    const year = local.getFullYear();
    const month = String(local.getMonth() + 1).padStart(2, "0");
    const day = String(local.getDate()).padStart(2, "0");
    return new Date(`${year}-${month}-${day}`);
  }

  // companyId é passado explicitamente em cada order/order.items abaixo por
  // consistência com o padrão do PrismaOrderRepository (denormalização
  // proposital em OrderItem), não porque o seed precise disso além do Prisma.
  async function createDemoOrder(data: {
    customerId: string;
    status: "PENDING" | "PROCESSING" | "READY" | "COMPLETED";
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    expectedDeliveryDate: Date | null;
    items: { product: (typeof products)[number]; quantity: number }[];
  }) {
    const updatedCompany = await prisma.company.update({
      where: { id: company.id },
      data: { nextOrderNumber: { increment: 1 } },
      select: { nextOrderNumber: true },
    });

    const subtotal = data.items.reduce(
      (sum, item) => sum + Number(item.product.price) * item.quantity,
      0,
    );

    await prisma.order.create({
      data: {
        companyId: company.id,
        orderNumber: String(updatedCompany.nextOrderNumber - 1).padStart(4, "0"),
        customerId: data.customerId,
        createdById: ownerId,
        status: data.status,
        priority: data.priority,
        expectedDeliveryDate: data.expectedDeliveryDate,
        subtotal,
        discount: 0,
        total: subtotal,
        items: {
          create: data.items.map((item) => ({
            companyId: company.id,
            productId: item.product.id,
            productName: item.product.name,
            unitPrice: item.product.price,
            quantity: item.quantity,
            total: Number(item.product.price) * item.quantity,
          })),
        },
      },
    });
  }

  // Um pedido em cada coluna do Kanban de Produção, incluindo um atrasado
  // (para mostrar o alerta no Painel) e prioridades variadas.
  await createDemoOrder({
    customerId: ana.id,
    status: "PENDING",
    priority: "NORMAL",
    expectedDeliveryDate: daysFromNow(5),
    items: [
      { product: chocolate, quantity: 1 },
      { product: morango, quantity: 1 },
    ],
  });

  await createDemoOrder({
    customerId: bruno.id,
    status: "PROCESSING",
    priority: "HIGH",
    expectedDeliveryDate: daysFromNow(3),
    items: [{ product: picole, quantity: 10 }],
  });

  await createDemoOrder({
    customerId: bruno.id,
    status: "PROCESSING",
    priority: "URGENT",
    expectedDeliveryDate: daysFromNow(-2),
    items: [{ product: chocolate, quantity: 2 }],
  });

  await createDemoOrder({
    customerId: carla.id,
    status: "READY",
    priority: "URGENT",
    expectedDeliveryDate: daysFromNow(1),
    items: [{ product: morango, quantity: 3 }],
  });

  await createDemoOrder({
    customerId: ana.id,
    status: "COMPLETED",
    priority: "LOW",
    expectedDeliveryDate: daysFromNow(-2),
    items: [{ product: picole, quantity: 5 }],
  });

  console.log(`Demo company seeded: ${company.email} / senha: Teste@123`);
}

async function main() {
  // Três etapas separadas de propósito, na ordem em que dependem uma da outra:
  //   1. seedPlans              — cria o que falta, sincroniza nome/módulos/limites
  //   2. applyApprovedPriceChange — reajuste comercial, auto-limitante
  //   3. seedDemoCompany        — dados de demonstração, só fora de produção
  await seedPlans();
  await applyApprovedPriceChange();

  const defaultPlan = await prisma.plan.findUniqueOrThrow({
    where: { slug: DEFAULT_PLAN_SLUG },
  });

  if (process.env.NODE_ENV !== "production") {
    await seedDemoCompany(defaultPlan.id);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
