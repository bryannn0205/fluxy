import { randomUUID } from "crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaOrderRepository } from "@/repositories/implementations/PrismaOrderRepository";
import { PrismaCustomerRepository } from "@/repositories/implementations/PrismaCustomerRepository";
import { PrismaProductRepository } from "@/repositories/implementations/PrismaProductRepository";
import { AuditService } from "@/services/AuditService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";
import { NotificationService } from "@/services/NotificationService";
import { PrismaNotificationRepository } from "@/repositories/implementations/PrismaNotificationRepository";
import { OrderService } from "@/services/OrderService";
import { CustomerService } from "@/services/CustomerService";

import { createTestPrismaClient } from "../helpers/prisma";
import { withRole, type ActingCompany } from "../helpers/company";

const prisma = createTestPrismaClient();

const orderRepository = prisma ? new PrismaOrderRepository(prisma) : null;
const customerRepository = prisma ? new PrismaCustomerRepository(prisma) : null;
const productRepository = prisma ? new PrismaProductRepository(prisma) : null;

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

const customerService = customerRepository
  ? new CustomerService(customerRepository, auditService!, subscriptionGate)
  : null;

// Agregações de CRM (groupBy, _sum, _max) só se verificam de verdade contra
// Postgres real — mockar a cadeia do query builder do Prisma não pegaria um
// erro de sintaxe da query nem provaria o resultado agregado correto.
describe.skipIf(!prisma)("CustomerService.getStats", () => {
  let company: ActingCompany;
  let userId: string;

  beforeAll(async () => {
    if (!prisma) return;

    const suffix = randomUUID().slice(0, 8);

    company = withRole(
      await prisma.company.create({
        data: {
          name: `CRM Teste ${suffix}`,
          email: `crm-${suffix}@teste.com`,
          trialEndsAt: new Date(Date.now() + 86_400_000),
          subscriptionStatus: "ACTIVE",
        },
      }),
    );

    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        name: "Usuário CRM",
        email: `user-crm-${suffix}@teste.com`,
        role: "OWNER",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (!prisma) return;

    await prisma.orderItem.deleteMany({ where: { companyId: company.id } });
    await prisma.order.deleteMany({ where: { companyId: company.id } });
    await prisma.product.deleteMany({ where: { companyId: company.id } });
    await prisma.customer.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { companyId: company.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  });

  it("agrega gasto total, ticket médio e produto favorito ignorando pedidos cancelados", async () => {
    const suffix = randomUUID().slice(0, 8);

    const customer = await prisma!.customer.create({
      data: { companyId: company.id, name: "Cliente com histórico" },
    });

    const productX = await prisma!.product.create({
      data: {
        companyId: company.id,
        sku: `X-${suffix}`,
        name: "Produto X",
        price: 10,
        unit: "UN",
      },
    });
    const productY = await prisma!.product.create({
      data: {
        companyId: company.id,
        sku: `Y-${suffix}`,
        name: "Produto Y",
        price: 5,
        unit: "UN",
      },
    });

    const order1 = await orderService!.create(
      {
        customerId: customer.id,
        items: [
          { productId: productX.id, quantity: 2 },
          { productId: productY.id, quantity: 1 },
        ],
        discount: 0,
        notes: "",
      },
      company,
      userId,
    );

    const order2 = await orderService!.create(
      {
        customerId: customer.id,
        items: [{ productId: productX.id, quantity: 5 }],
        discount: 0,
        notes: "",
      },
      company,
      userId,
    );

    const cancelledOrder = await orderService!.create(
      {
        customerId: customer.id,
        items: [{ productId: productY.id, quantity: 100 }],
        discount: 0,
        notes: "",
      },
      company,
      userId,
    );
    await orderService!.updateStatus(cancelledOrder.id, "CANCELLED", company, userId);

    const stats = await customerService!.getStats(customer.id, company.id);

    expect(stats.orderCount).toBe(2);
    expect(stats.totalSpent).toBe(75); // (2*10 + 1*5) + (5*10) — pedido cancelado (100*5) fora
    expect(stats.averageTicket).toBe(37.5);
    expect(stats.favoriteProduct).toMatchObject({ id: productX.id, totalQuantity: 7 }); // 2 + 5
    expect(stats.lastOrderAt?.getTime()).toBe(order2.createdAt.getTime());
    expect(order1.id).not.toBe(order2.id); // sanity: dois pedidos distintos foram de fato criados
  });

  it("retorna zeros e null para cliente sem nenhum pedido", async () => {
    const customer = await prisma!.customer.create({
      data: { companyId: company.id, name: "Cliente sem pedidos" },
    });

    const stats = await customerService!.getStats(customer.id, company.id);

    expect(stats).toEqual({
      orderCount: 0,
      totalSpent: 0,
      averageTicket: 0,
      lastOrderAt: null,
      favoriteProduct: null,
    });
  });
});
