import { randomUUID } from "crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Company } from "@/lib/generated/prisma/client";
import { startOfDaysAgoBrazil, toBrazilDateKey } from "@/lib/dates";
import { PrismaReportRepository } from "@/repositories/implementations/PrismaReportRepository";
import { ReportService } from "@/services/ReportService";

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();

const reportService = prisma
  ? new ReportService(new PrismaReportRepository(prisma))
  : null;

/** Meio-dia de Brasília de `daysAgo` dias atrás — longe de qualquer virada de dia. */
function middayBrazil(daysAgo: number): Date {
  return new Date(startOfDaysAgoBrazil(daysAgo).getTime() + 12 * 60 * 60 * 1000);
}

// O agrupamento por dia usa SQL cru com truncamento de data e conversão de
// fuso; groupBy/_sum do Prisma também só se verificam de verdade contra
// Postgres. Um mock do query builder não pegaria erro de sintaxe nem provaria
// que o bucket caiu no dia certo.
describe.skipIf(!prisma)("Relatório de vendas", () => {
  let company: Company;
  let otherCompany: Company;
  let customerId: string;
  let productId: string;
  let userId: string;

  beforeAll(async () => {
    if (!prisma) return;
    const suffix = randomUUID().slice(0, 8);

    const makeCompany = (label: string) =>
      prisma.company.create({
        data: {
          name: `Relatório ${label} ${suffix}`,
          email: `report-${label}-${suffix}@teste.com`,
          trialEndsAt: new Date(Date.now() + 86_400_000),
          subscriptionStatus: "ACTIVE",
        },
      });

    company = await makeCompany("A");
    otherCompany = await makeCompany("B");

    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        name: "Usuário Relatório",
        email: `user-report-${suffix}@teste.com`,
        role: "OWNER",
      },
    });
    userId = user.id;

    const customer = await prisma.customer.create({
      data: { companyId: company.id, name: "Cliente Relatório" },
    });
    customerId = customer.id;

    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        sku: `REP-${suffix}`,
        name: "Produto Relatório",
        price: 10,
        unit: "UN",
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = [company.id, otherCompany.id];

    await prisma.orderItem.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.order.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.product.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  async function createOrder(options: {
    companyId: string;
    customerId: string;
    productId: string;
    daysAgo: number;
    total: number;
    status?: "PENDING" | "CANCELLED";
    orderNumber: string;
  }) {
    const createdAt = middayBrazil(options.daysAgo);

    // Escrita direta, sem OrderService: o Service carimba `createdAt` como
    // agora, e este teste precisa de pedidos em dias passados.
    return prisma!.order.create({
      data: {
        companyId: options.companyId,
        orderNumber: options.orderNumber,
        customerId: options.customerId,
        status: options.status ?? "PENDING",
        subtotal: options.total,
        discount: 0,
        total: options.total,
        createdById: userId,
        createdAt,
        items: {
          create: {
            companyId: options.companyId,
            productId: options.productId,
            productName: "Produto Relatório",
            unitPrice: options.total,
            quantity: 1,
            total: options.total,
          },
        },
      },
    });
  }

  it("agrupa o faturamento no dia certo e zera os dias sem venda", async () => {
    await createOrder({
      companyId: company.id,
      customerId,
      productId,
      daysAgo: 5,
      total: 100,
      orderNumber: "0001",
    });
    await createOrder({
      companyId: company.id,
      customerId,
      productId,
      daysAgo: 2,
      total: 50,
      orderNumber: "0002",
    });

    const report = await reportService!.getSalesReport(company.id, 7);

    expect(report.revenueByDay).toHaveLength(7);

    const byDate = new Map(report.revenueByDay.map((point) => [point.date, point]));
    expect(byDate.get(toBrazilDateKey(middayBrazil(5)))?.revenue).toBe(100);
    expect(byDate.get(toBrazilDateKey(middayBrazil(2)))?.revenue).toBe(50);

    // Dias 4 e 3 não tiveram venda: precisam existir na série, valendo zero.
    for (const daysAgo of [4, 3]) {
      const point = byDate.get(toBrazilDateKey(middayBrazil(daysAgo)));
      expect(point).toBeDefined();
      expect(point?.revenue).toBe(0);
      expect(point?.orderCount).toBe(0);
    }
  });

  it("ignora pedidos cancelados no faturamento e no ranking", async () => {
    await createOrder({
      companyId: company.id,
      customerId,
      productId,
      daysAgo: 1,
      total: 9999,
      status: "CANCELLED",
      orderNumber: "0003",
    });

    const report = await reportService!.getSalesReport(company.id, 7);

    expect(report.summary.revenue).toBe(150);
    expect(report.summary.orderCount).toBe(2);
    expect(report.topProducts[0]?.revenue).toBe(150);
  });

  it("não deixa pedidos de outra empresa entrarem em nenhum agregado", async () => {
    const otherCustomer = await prisma!.customer.create({
      data: { companyId: otherCompany.id, name: "Cliente da outra empresa" },
    });
    const otherProduct = await prisma!.product.create({
      data: {
        companyId: otherCompany.id,
        sku: `REP-OTHER-${randomUUID().slice(0, 8)}`,
        name: "Produto da outra empresa",
        price: 500,
        unit: "UN",
      },
    });

    await createOrder({
      companyId: otherCompany.id,
      customerId: otherCustomer.id,
      productId: otherProduct.id,
      daysAgo: 1,
      total: 7777,
      orderNumber: "0001",
    });

    const report = await reportService!.getSalesReport(company.id, 7);

    expect(report.summary.revenue).toBe(150);
    expect(report.revenueByDay.some((point) => point.revenue === 7777)).toBe(false);
    expect(report.topProducts.map((entry) => entry.label)).not.toContain(
      "Produto da outra empresa",
    );
    expect(report.topCustomers.map((entry) => entry.label)).not.toContain(
      "Cliente da outra empresa",
    );
  });
});
