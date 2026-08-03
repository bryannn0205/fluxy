import { randomUUID } from "crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaOrderRepository } from "@/repositories/implementations/PrismaOrderRepository";
import { PrismaCustomerRepository } from "@/repositories/implementations/PrismaCustomerRepository";
import { PrismaProductRepository } from "@/repositories/implementations/PrismaProductRepository";
import { PrismaStockRepository } from "@/repositories/implementations/PrismaStockRepository";
import { AuditService } from "@/services/AuditService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";
import { NotificationService } from "@/services/NotificationService";
import { PrismaNotificationRepository } from "@/repositories/implementations/PrismaNotificationRepository";
import { OrderService } from "@/services/OrderService";
import { StockService } from "@/services/StockService";
import type { Product } from "@/lib/generated/prisma/client";

import { createTestPrismaClient } from "../helpers/prisma";
import { withRole, type ActingCompany } from "../helpers/company";

const prisma = createTestPrismaClient();

const orderRepository = prisma ? new PrismaOrderRepository(prisma) : null;
const customerRepository = prisma ? new PrismaCustomerRepository(prisma) : null;
const productRepository = prisma ? new PrismaProductRepository(prisma) : null;
const stockRepository = prisma ? new PrismaStockRepository(prisma) : null;

const auditService = prisma ? new AuditService(prisma) : null;
const subscriptionGate = new SubscriptionGateService();

// Real, não mock: notificar faz parte do que acontece ao mexer num pedido, e
// estes testes exercitam o caminho completo contra o banco.
const notificationService = prisma
  ? new NotificationService(new PrismaNotificationRepository(prisma))
  : null!;

const orderService =
  orderRepository && customerRepository && productRepository && auditService
    ? new OrderService(
        orderRepository,
        customerRepository,
        productRepository,
        auditService,
        subscriptionGate,
        notificationService,
      )
    : null;

const stockService = stockRepository
  ? new StockService(stockRepository, subscriptionGate)
  : null;

// Ledger de estoque é dinheiro/inventário real — precisa rodar contra
// Postgres de verdade (transações, increments atômicos), nunca mock. Ver
// .claude/docs/development/testing.md.
describe.skipIf(!prisma)("Ledger de estoque", () => {
  let company: ActingCompany;
  let userId: string;
  let customerId: string;

  beforeAll(async () => {
    if (!prisma) return;

    const suffix = randomUUID().slice(0, 8);

    company = withRole(
      await prisma.company.create({
        data: {
          name: `Estoque Teste ${suffix}`,
          email: `estoque-${suffix}@teste.com`,
          trialEndsAt: new Date(Date.now() + 86_400_000),
          subscriptionStatus: "ACTIVE",
        },
      }),
    );

    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        name: "Usuário Estoque",
        email: `user-estoque-${suffix}@teste.com`,
        role: "OWNER",
      },
    });
    userId = user.id;

    const customer = await prisma.customer.create({
      data: { companyId: company.id, name: "Cliente Estoque" },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    if (!prisma) return;

    await prisma.stockMovement.deleteMany({ where: { companyId: company.id } });
    await prisma.orderItem.deleteMany({ where: { companyId: company.id } });
    await prisma.order.deleteMany({ where: { companyId: company.id } });
    await prisma.product.deleteMany({ where: { companyId: company.id } });
    await prisma.customer.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { companyId: company.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  });

  async function createProduct(stockQuantity: number): Promise<Product> {
    const suffix = randomUUID().slice(0, 8);
    return prisma!.product.create({
      data: {
        companyId: company.id,
        sku: `SKU-${suffix}`,
        name: `Produto ${suffix}`,
        price: 10,
        unit: "UN",
        stockQuantity,
      },
    });
  }

  it("debita estoque e registra SALE ao criar um pedido", async () => {
    const product = await createProduct(20);

    const order = await orderService!.create(
      {
        customerId,
        items: [{ productId: product.id, quantity: 5 }],
        discount: 0,
        notes: "",
      },
      company,
      userId,
    );

    const updated = await prisma!.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(updated.stockQuantity).toBe(15);

    const movements = await prisma!.stockMovement.findMany({
      where: { productId: product.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      reason: "SALE",
      quantityDelta: -5,
      balanceAfter: 15,
      orderId: order.id,
    });
  });

  it("permite estoque negativo na criação do pedido (não bloqueia a venda)", async () => {
    const product = await createProduct(2);

    await orderService!.create(
      {
        customerId,
        items: [{ productId: product.id, quantity: 5 }],
        discount: 0,
        notes: "",
      },
      company,
      userId,
    );

    const updated = await prisma!.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(updated.stockQuantity).toBe(-3);
  });

  it("repõe estoque e registra CANCELLATION ao cancelar um pedido", async () => {
    const product = await createProduct(20);

    const order = await orderService!.create(
      {
        customerId,
        items: [{ productId: product.id, quantity: 5 }],
        discount: 0,
        notes: "",
      },
      company,
      userId,
    );

    await orderService!.updateStatus(order.id, "CANCELLED", company, userId);

    const updated = await prisma!.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(updated.stockQuantity).toBe(20);

    const movements = await prisma!.stockMovement.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: "asc" },
    });
    expect(movements).toHaveLength(2);
    expect(movements[1]).toMatchObject({
      reason: "CANCELLATION",
      quantityDelta: 5,
      balanceAfter: 20,
    });
  });

  it("repõe estoque ao excluir um pedido que não estava cancelado", async () => {
    const product = await createProduct(20);

    const order = await orderService!.create(
      {
        customerId,
        items: [{ productId: product.id, quantity: 5 }],
        discount: 0,
        notes: "",
      },
      company,
      userId,
    );

    await orderService!.delete(order.id, company, userId);

    const updated = await prisma!.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(updated.stockQuantity).toBe(20);
  });

  it("não repõe estoque duas vezes ao excluir um pedido já cancelado", async () => {
    const product = await createProduct(20);

    const order = await orderService!.create(
      {
        customerId,
        items: [{ productId: product.id, quantity: 5 }],
        discount: 0,
        notes: "",
      },
      company,
      userId,
    );

    await orderService!.updateStatus(order.id, "CANCELLED", company, userId);
    await orderService!.delete(order.id, company, userId);

    const updated = await prisma!.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(updated.stockQuantity).toBe(20);

    const restorations = await prisma!.stockMovement.findMany({
      where: { productId: product.id, reason: "CANCELLATION" },
    });
    expect(restorations).toHaveLength(1);
  });

  it("registra ajuste manual de entrada (RESTOCK)", async () => {
    const product = await createProduct(10);

    await stockService!.adjust(
      {
        productId: product.id,
        reason: "RESTOCK",
        direction: "IN",
        quantity: 15,
        note: "Compra NF 999",
      },
      company,
      userId,
    );

    const updated = await prisma!.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(updated.stockQuantity).toBe(25);
  });

  it("rejeita ajuste manual de saída que deixaria o estoque negativo", async () => {
    const product = await createProduct(3);

    await expect(
      stockService!.adjust(
        {
          productId: product.id,
          reason: "ADJUSTMENT",
          direction: "OUT",
          quantity: 5,
          note: "",
        },
        company,
        userId,
      ),
    ).rejects.toThrow();

    const unchanged = await prisma!.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(unchanged.stockQuantity).toBe(3);
  });
});
