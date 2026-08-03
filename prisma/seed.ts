import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";
import { DEFAULT_PLAN_SLUG, MODULE_KEYS, TRIAL_DURATION_DAYS } from "@/lib/constants";
import { hashPassword } from "@/lib/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedDefaultPlan() {
  const plan = await prisma.plan.upsert({
    where: { slug: DEFAULT_PLAN_SLUG },
    update: {},
    create: {
      slug: DEFAULT_PLAN_SLUG,
      name: "Fluxy Standard",
      priceMonthly: 59,
      priceYearly: 590,
      modules: Object.values(MODULE_KEYS),
    },
  });

  console.log(`Plan seeded: ${plan.name} (${plan.slug})`);
  return plan;
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
  const plan = await seedDefaultPlan();

  if (process.env.NODE_ENV !== "production") {
    await seedDemoCompany(plan.id);
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
