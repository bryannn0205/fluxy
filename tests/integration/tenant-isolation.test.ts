import { randomUUID } from "crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaOrderRepository } from "@/repositories/implementations/PrismaOrderRepository";
import { PrismaOrderAttachmentRepository } from "@/repositories/implementations/PrismaOrderAttachmentRepository";
import { PrismaCustomerRepository } from "@/repositories/implementations/PrismaCustomerRepository";
import { PrismaProductRepository } from "@/repositories/implementations/PrismaProductRepository";
import { PrismaStockRepository } from "@/repositories/implementations/PrismaStockRepository";
import { AuditService } from "@/services/AuditService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";
import { NotificationService } from "@/services/NotificationService";
import { PrismaNotificationRepository } from "@/repositories/implementations/PrismaNotificationRepository";
import { OrderService } from "@/services/OrderService";
import { OrderAttachmentService } from "@/services/OrderAttachmentService";
import { StockService } from "@/services/StockService";
import type { Company } from "@/lib/generated/prisma/client";

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();

const orderRepository = prisma ? new PrismaOrderRepository(prisma) : null;
const orderAttachmentRepository = prisma
  ? new PrismaOrderAttachmentRepository(prisma)
  : null;
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

const orderAttachmentService =
  orderAttachmentRepository && orderRepository && auditService
    ? new OrderAttachmentService(
        orderAttachmentRepository,
        orderRepository,
        auditService,
        subscriptionGate,
      )
    : null;

const stockService = stockRepository
  ? new StockService(stockRepository, subscriptionGate)
  : null;

// Testes de integração — obrigatórios para isolamento multi-tenant, ver
// .claude/docs/development/testing.md. Rodam contra um Postgres real (nunca
// mock de banco). Pulados automaticamente se DATABASE_URL não estiver
// configurado (ex.: `npm run type-check` em ambiente sem banco).
describe.skipIf(!prisma)("Isolamento multi-tenant — Orders", () => {
  let companyA: Company;
  let companyB: Company;
  let userBId: string;
  let orderBId: string;
  let attachmentBId: string;
  let productBId: string;

  beforeAll(async () => {
    if (!prisma) return;

    const suffix = randomUUID().slice(0, 8);

    companyA = await prisma.company.create({
      data: {
        name: `Empresa A ${suffix}`,
        email: `a-${suffix}@teste.com`,
        trialEndsAt: new Date(Date.now() + 86_400_000),
        subscriptionStatus: "ACTIVE",
      },
    });

    companyB = await prisma.company.create({
      data: {
        name: `Empresa B ${suffix}`,
        email: `b-${suffix}@teste.com`,
        trialEndsAt: new Date(Date.now() + 86_400_000),
        subscriptionStatus: "ACTIVE",
      },
    });

    const userB = await prisma.user.create({
      data: {
        companyId: companyB.id,
        name: "Usuário B",
        email: `user-b-${suffix}@teste.com`,
        role: "OWNER",
      },
    });
    userBId = userB.id;

    const customerB = await prisma.customer.create({
      data: { companyId: companyB.id, name: "Cliente B" },
    });

    const productB = await prisma.product.create({
      data: {
        companyId: companyB.id,
        sku: `SKU-B-${suffix}`,
        name: "Produto B",
        price: 50,
        unit: "UN",
      },
    });
    productBId = productB.id;

    const orderB = await orderService!.create(
      {
        customerId: customerB.id,
        items: [{ productId: productB.id, quantity: 1 }],
        discount: 0,
        notes: "",
      },
      companyB,
      userB.id,
    );
    orderBId = orderB.id;

    const attachmentB = await orderAttachmentService!.create(
      {
        orderId: orderBId,
        uploadedById: userBId,
        category: "OUTRO",
        fileName: "nota-b.pdf",
        fileKey: `${companyB.id}/orders/${orderBId}/nota-b.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 1024,
      },
      companyB,
      userBId,
    );
    attachmentBId = attachmentB.id;
  });

  afterAll(async () => {
    if (!prisma) return;

    await prisma.orderAttachment.deleteMany({
      where: { companyId: { in: [companyA.id, companyB.id] } },
    });
    await prisma.stockMovement.deleteMany({
      where: { companyId: { in: [companyA.id, companyB.id] } },
    });
    await prisma.auditLog.deleteMany({
      where: { companyId: { in: [companyA.id, companyB.id] } },
    });
    await prisma.orderItem.deleteMany({
      where: { companyId: { in: [companyA.id, companyB.id] } },
    });
    await prisma.order.deleteMany({
      where: { companyId: { in: [companyA.id, companyB.id] } },
    });
    await prisma.product.deleteMany({
      where: { companyId: { in: [companyA.id, companyB.id] } },
    });
    await prisma.customer.deleteMany({
      where: { companyId: { in: [companyA.id, companyB.id] } },
    });
    await prisma.user.deleteMany({
      where: { companyId: { in: [companyA.id, companyB.id] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyA.id, companyB.id] } },
    });
    await prisma.$disconnect();
  });

  it("não retorna pedidos de outra empresa na listagem", async () => {
    const result = await orderService!.list(companyA.id, {});
    expect(result.data.every((order) => order.id !== orderBId)).toBe(true);
  });

  it("não retorna pedidos de outra empresa no board de Produção", async () => {
    const result = await orderService!.listForKanban(companyA.id);
    expect(result.every((order) => order.id !== orderBId)).toBe(true);
  });

  it("não permite buscar pedido de outra empresa por id", async () => {
    const result = await orderService!.findById(orderBId, companyA.id);
    expect(result).toBeNull();
  });

  it("não permite alterar status de pedido de outra empresa", async () => {
    await expect(
      orderService!.updateStatus(orderBId, "PROCESSING", companyA, "fake-user"),
    ).rejects.toThrow();

    // Confirma que o pedido de B continua intacto (não foi alterado por A).
    const stillPending = await orderService!.findById(orderBId, companyB.id);
    expect(stillPending?.status).toBe("PENDING");
  });

  it("não permite atualizar detalhes de pedido de outra empresa", async () => {
    await expect(
      orderService!.updateDetails(
        {
          orderId: orderBId,
          priority: "URGENT",
          expectedDeliveryDate: "",
          paymentMethod: "",
        },
        companyA,
        "fake-user",
      ),
    ).rejects.toThrow();

    const untouched = await orderService!.findById(orderBId, companyB.id);
    expect(untouched?.priority).toBe("NORMAL");
  });

  it("não permite acessar nem excluir anexo de pedido de outra empresa", async () => {
    await expect(
      orderAttachmentService!.delete(attachmentBId, companyA, "fake-user"),
    ).rejects.toThrow();

    // Confirma que o anexo de B continua intacto (não foi apagado por A).
    const orderB = await orderService!.findById(orderBId, companyB.id);
    expect(
      orderB?.attachments.some((attachment) => attachment.id === attachmentBId),
    ).toBe(true);
  });

  it("não permite excluir pedido de outra empresa", async () => {
    await expect(orderService!.delete(orderBId, companyA, "fake-user")).rejects.toThrow();

    const stillExists = await orderService!.findById(orderBId, companyB.id);
    expect(stillExists).not.toBeNull();
  });

  it("não permite ajustar estoque de produto de outra empresa", async () => {
    await expect(
      stockService!.adjust(
        {
          productId: productBId,
          reason: "RESTOCK",
          direction: "IN",
          quantity: 10,
          note: "",
        },
        companyA,
        "fake-user",
      ),
    ).rejects.toThrow();

    // Confirma que o estoque de B não mudou (só o débito da criação do pedido, -1).
    const productB = await prisma!.product.findUniqueOrThrow({
      where: { id: productBId },
    });
    expect(productB.stockQuantity).toBe(-1);
  });

  it("não retorna movimentações de estoque de produto de outra empresa", async () => {
    const result = await stockService!.listMovements(productBId, companyA.id);
    expect(result).toHaveLength(0);
  });
});
