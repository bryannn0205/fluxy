import { randomUUID } from "crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaNotificationRepository } from "@/repositories/implementations/PrismaNotificationRepository";
import { PrismaOrderRepository } from "@/repositories/implementations/PrismaOrderRepository";
import { PrismaCustomerRepository } from "@/repositories/implementations/PrismaCustomerRepository";
import { PrismaProductRepository } from "@/repositories/implementations/PrismaProductRepository";
import { AuditService } from "@/services/AuditService";
import { NotificationService } from "@/services/NotificationService";
import { OrderService } from "@/services/OrderService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";

import { createTestPrismaClient } from "../helpers/prisma";
import { withRole, type ActingCompany } from "../helpers/company";

const prisma = createTestPrismaClient();

const service = prisma
  ? new NotificationService(new PrismaNotificationRepository(prisma))
  : null;

const orderService =
  prisma && service
    ? new OrderService(
        new PrismaOrderRepository(prisma),
        new PrismaCustomerRepository(prisma),
        new PrismaProductRepository(prisma),
        new AuditService(prisma),
        new SubscriptionGateService(),
        service,
      )
    : null;

// O fan-out grava N linhas com createMany e o "marcar como lida" depende de
// updateMany com filtro composto — nenhum dos dois se prova com mock do query
// builder, que não pegaria erro de constraint nem provaria o escopo do filtro.
describe.skipIf(!prisma)("Notificações", () => {
  let company: ActingCompany;
  let otherCompany: ActingCompany;
  let ana: string;
  let bruno: string;
  let carla: string;
  let vizinho: string;
  let orderId: string;

  beforeAll(async () => {
    if (!prisma) return;
    const suffix = randomUUID().slice(0, 8);

    const makeCompany = (label: string) =>
      prisma.company.create({
        data: {
          name: `Notif ${label} ${suffix}`,
          email: `notif-${label}-${suffix}@teste.com`,
          trialEndsAt: new Date(Date.now() + 86_400_000),
          subscriptionStatus: "ACTIVE",
        },
      });

    company = withRole(await makeCompany("A"));
    otherCompany = withRole(await makeCompany("B"));

    const makeUser = (companyId: string, name: string) =>
      prisma.user
        .create({
          data: {
            companyId,
            name,
            email: `${name.toLowerCase()}-${suffix}@teste.com`,
            role: "OPERATOR",
          },
        })
        .then((user) => user.id);

    ana = await makeUser(company.id, "Ana");
    bruno = await makeUser(company.id, "Bruno");
    carla = await makeUser(company.id, "Carla");
    vizinho = await makeUser(otherCompany.id, "Vizinho");

    const customer = await prisma.customer.create({
      data: { companyId: company.id, name: "Cliente Notif" },
    });
    const order = await prisma.order.create({
      data: {
        companyId: company.id,
        // Fora da faixa que Company.nextOrderNumber vai gerar: este pedido é
        // escrito direto, sem consumir o contador, e colidiria com o número
        // que o OrderService produz no teste do fluxo real.
        orderNumber: "9000",
        customerId: customer.id,
        status: "PENDING",
        subtotal: 100,
        discount: 0,
        total: 100,
        createdById: ana,
      },
    });
    orderId = order.id;
  });

  beforeEach(async () => {
    if (!prisma) return;
    await prisma.notification.deleteMany({
      where: { companyId: { in: [company.id, otherCompany.id] } },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = [company.id, otherCompany.id];

    // Criar pedido pelo OrderService também grava StockMovement e AuditLog,
    // ambos apontando para o usuário — precisam sair antes dele.
    await prisma.notification.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.stockMovement.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.order.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.product.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  async function notifyFromAna() {
    await service!.notifyOrderCreated({
      companyId: company.id,
      actorId: ana,
      orderId,
      orderNumber: "9000",
      customerName: "Cliente Notif",
    });
  }

  it("grava uma linha para cada colega e nenhuma para quem causou o evento", async () => {
    await notifyFromAna();

    const rows = await prisma!.notification.findMany({
      where: { companyId: company.id },
      select: { userId: true },
    });

    expect(rows.map((row) => row.userId).sort()).toEqual([bruno, carla].sort());
  });

  it("não alcança usuário de outra empresa", async () => {
    await notifyFromAna();

    const doVizinho = await prisma!.notification.count({ where: { userId: vizinho } });
    expect(doVizinho).toBe(0);
  });

  it("ignora membro que saiu da equipe (soft delete)", async () => {
    await prisma!.user.update({ where: { id: carla }, data: { deletedAt: new Date() } });

    try {
      await notifyFromAna();

      const rows = await prisma!.notification.findMany({
        where: { companyId: company.id },
        select: { userId: true },
      });
      expect(rows.map((row) => row.userId)).toEqual([bruno]);
    } finally {
      await prisma!.user.update({ where: { id: carla }, data: { deletedAt: null } });
    }
  });

  it("conta não lidas por usuário, não por empresa", async () => {
    await notifyFromAna();

    expect(await service!.countUnread(bruno, company.id)).toBe(1);
    expect(await service!.countUnread(ana, company.id)).toBe(0);
  });

  describe("marcar como lida", () => {
    it("zera a contagem de quem marcou, sem tocar na do colega", async () => {
      await notifyFromAna();

      await service!.markAllRead(bruno, company.id);

      expect(await service!.countUnread(bruno, company.id)).toBe(0);
      expect(await service!.countUnread(carla, company.id)).toBe(1);
    });

    // O filtro do updateMany é composto (id + userId + companyId) justamente
    // para isto: um id vazado não permite mexer na caixa alheia.
    it("não deixa um usuário marcar a notificação de outro", async () => {
      await notifyFromAna();

      const daCarla = await prisma!.notification.findFirstOrThrow({
        where: { userId: carla },
      });

      await service!.markRead(daCarla.id, bruno, company.id);

      const depois = await prisma!.notification.findUniqueOrThrow({
        where: { id: daCarla.id },
      });
      expect(depois.readAt).toBeNull();
    });

    it("marca a própria", async () => {
      await notifyFromAna();

      const daCarla = await prisma!.notification.findFirstOrThrow({
        where: { userId: carla },
      });

      await service!.markRead(daCarla.id, carla, company.id);

      const depois = await prisma!.notification.findUniqueOrThrow({
        where: { id: daCarla.id },
      });
      expect(depois.readAt).not.toBeNull();
    });
  });

  // O gancho no OrderService só é coberto por mock no teste unitário. Aqui o
  // caminho é o real: criar um pedido de verdade tem que produzir a linha.
  it("criar um pedido pelo OrderService notifica os colegas", async () => {
    const customer = await prisma!.customer.create({
      data: { companyId: company.id, name: "Cliente do Fluxo" },
    });
    const product = await prisma!.product.create({
      data: {
        companyId: company.id,
        sku: `FLOW-${randomUUID().slice(0, 8)}`,
        name: "Produto do Fluxo",
        price: 25,
        unit: "UN",
      },
    });

    const order = await orderService!.create(
      {
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 2 }],
        discount: 0,
        notes: "",
      },
      {
        id: company.id,
        role: "OWNER",
        subscriptionStatus: "ACTIVE",
        trialEndsAt: new Date(Date.now() + 86_400_000),
      },
      ana,
    );

    const rows = await prisma!.notification.findMany({
      where: { companyId: company.id, type: "ORDER_CREATED" },
      select: { userId: true, orderId: true },
    });

    expect(rows.map((row) => row.userId).sort()).toEqual([bruno, carla].sort());
    expect(rows.every((row) => row.orderId === order.id)).toBe(true);

    const [item] = await service!.listForUser(bruno, company.id);
    expect(item?.title).toBe(`Pedido ${order.orderNumber} criado`);
    expect(item?.description).toBe("Cliente Cliente do Fluxo por Ana");
  });

  it("lista só o que é do usuário, já com o texto resolvido", async () => {
    await notifyFromAna();

    const doBruno = await service!.listForUser(bruno, company.id);

    expect(doBruno).toHaveLength(1);
    expect(doBruno[0]?.title).toBe("Pedido 9000 criado");
    expect(doBruno[0]?.description).toBe("Cliente Cliente Notif por Ana");
    expect(doBruno[0]?.orderId).toBe(orderId);

    expect(await service!.listForUser(ana, company.id)).toHaveLength(0);
  });
});
