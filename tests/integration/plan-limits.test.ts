import { randomUUID } from "crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { EmailAlreadyInUseError, PlanLimitReachedError } from "@/lib/errors";
import { PrismaCustomerRepository } from "@/repositories/implementations/PrismaCustomerRepository";
import { PrismaInvitationRepository } from "@/repositories/implementations/PrismaInvitationRepository";
import { PrismaNotificationRepository } from "@/repositories/implementations/PrismaNotificationRepository";
import { PrismaOrderRepository } from "@/repositories/implementations/PrismaOrderRepository";
import { PrismaProductRepository } from "@/repositories/implementations/PrismaProductRepository";
import { PrismaUserRepository } from "@/repositories/implementations/PrismaUserRepository";
import { AuditService } from "@/services/AuditService";
import { CustomerService } from "@/services/CustomerService";
import { NotificationService } from "@/services/NotificationService";
import { OrderService } from "@/services/OrderService";
import { ProductService } from "@/services/ProductService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";
import { TeamService } from "@/services/TeamService";
import { startOfMonthBrazil, startOfNextMonthBrazil } from "@/lib/dates";

import { createTestPrismaClient } from "../helpers/prisma";
import { buildPlanLimitService } from "../helpers/services";
import { withRole, type ActingCompany } from "../helpers/company";

const prisma = createTestPrismaClient();
const gate = new SubscriptionGateService();
const planLimitService = prisma ? buildPlanLimitService(prisma) : null;

const orderService = prisma
  ? new OrderService(
      new PrismaOrderRepository(prisma),
      new PrismaCustomerRepository(prisma),
      new PrismaProductRepository(prisma),
      new AuditService(prisma),
      gate,
      new NotificationService(new PrismaNotificationRepository(prisma)),
      planLimitService!,
    )
  : null;

const productService = prisma
  ? new ProductService(
      new PrismaProductRepository(prisma),
      new AuditService(prisma),
      gate,
      planLimitService!,
    )
  : null;

const customerService = prisma
  ? new CustomerService(
      new PrismaCustomerRepository(prisma),
      new AuditService(prisma),
      gate,
      planLimitService!,
    )
  : null;

const teamService = prisma
  ? new TeamService(
      new PrismaUserRepository(prisma),
      new PrismaInvitationRepository(prisma),
      new AuditService(prisma),
      gate,
      planLimitService!,
    )
  : null;

// Cota depende de contagem no banco e do lock da empresa — nenhum dos dois
// existe num mock de repositório. O que estes testes provam é que o teto
// realmente barra, e que o caminho concorrente não fura.
describe.skipIf(!prisma)("Limites de plano", () => {
  let companyA: ActingCompany;
  let companyB: ActingCompany;
  let planoId: string;
  let ownerA: string;
  let customerA: string;
  let productA: string;

  beforeAll(async () => {
    if (!prisma) return;
    const suffix = randomUUID().slice(0, 8);

    // Plano próprio do teste: mexer no `standard` real afetaria as empresas
    // de verdade e os outros arquivos de teste.
    planoId = (
      await prisma.plan.create({
        data: {
          slug: `teste-${suffix}`,
          name: "Plano de Teste",
          priceMonthly: 0,
          priceYearly: 0,
          modules: [],
        },
      })
    ).id;

    const criarEmpresa = (label: string) =>
      prisma.company.create({
        data: {
          name: `Cota ${label} ${suffix}`,
          email: `cota-${label}-${suffix}@teste.com`,
          trialEndsAt: new Date(Date.now() + 86_400_000),
          subscriptionStatus: "ACTIVE",
          planId: planoId,
        },
      });

    companyA = withRole(await criarEmpresa("A"));
    companyB = withRole(await criarEmpresa("B"));

    ownerA = (
      await prisma.user.create({
        data: {
          companyId: companyA.id,
          name: "Dono A",
          email: `dono-cota-${suffix}@teste.com`,
          role: "OWNER",
        },
      })
    ).id;

    customerA = (
      await prisma.customer.create({
        data: { companyId: companyA.id, name: "Cliente Cota" },
      })
    ).id;

    productA = (
      await prisma.product.create({
        data: {
          companyId: companyA.id,
          sku: `COTA-${suffix}`,
          name: "Produto Cota",
          price: 10,
          stockQuantity: 100_000,
        },
      })
    ).id;
  });

  beforeEach(async () => {
    if (!prisma) return;
    // Cada teste define o próprio teto; sem isso um vazaria no seguinte.
    await prisma.plan.update({
      where: { id: planoId },
      data: {
        maxUsers: null,
        maxOrdersPerMonth: null,
        maxProducts: null,
        maxCustomers: null,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = [companyA.id, companyB.id];

    await prisma.payment.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.stockMovement.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.order.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.product.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.invitation.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await prisma.plan.delete({ where: { id: planoId } });
    await prisma.$disconnect();
  });

  const definirTeto = (campo: string, valor: number | null) =>
    prisma!.plan.update({ where: { id: planoId }, data: { [campo]: valor } });

  const criarPedido = () =>
    orderService!.create(
      {
        customerId: customerA,
        items: [{ productId: productA, quantity: 1 }],
        discount: 0,
        notes: "",
      },
      companyA,
      ownerA,
    );

  describe("pedidos por mês", () => {
    it("null não barra nada", async () => {
      await definirTeto("maxOrdersPerMonth", null);
      await expect(criarPedido()).resolves.toBeDefined();
    });

    it("zero bloqueia até o primeiro pedido", async () => {
      await definirTeto("maxOrdersPerMonth", 0);
      await expect(criarPedido()).rejects.toThrow(PlanLimitReachedError);
    });

    it("barra ao ultrapassar o teto e libera de novo quando ele sobe", async () => {
      const jaCriados = await prisma!.order.count({
        where: {
          companyId: companyA.id,
          createdAt: {
            gte: startOfMonthBrazil(),
            lt: startOfNextMonthBrazil(),
          },
        },
      });

      // Teto exatamente no uso atual: o próximo estoura.
      await definirTeto("maxOrdersPerMonth", jaCriados);
      await expect(criarPedido()).rejects.toThrow(PlanLimitReachedError);

      // Uma vaga a mais: passa.
      await definirTeto("maxOrdersPerMonth", jaCriados + 1);
      await expect(criarPedido()).resolves.toBeDefined();
    });

    // Devolver cota ao excluir tornaria o teto contornável em looping:
    // criar, excluir, criar de novo.
    it("pedido excluído (soft delete) continua consumindo cota", async () => {
      await definirTeto("maxOrdersPerMonth", null);
      const pedido = await criarPedido();
      await orderService!.delete(pedido.id, companyA, ownerA);

      const usoDepois = await planLimitService!.getCurrentUsage(
        companyA.id,
        "ordersPerMonth",
      );
      const visiveis = await prisma!.order.count({
        where: { companyId: companyA.id, deletedAt: null },
      });

      expect(usoDepois).toBeGreaterThan(visiveis);
    });

    it("pedido cancelado continua consumindo cota", async () => {
      await definirTeto("maxOrdersPerMonth", null);
      const antes = await planLimitService!.getCurrentUsage(
        companyA.id,
        "ordersPerMonth",
      );

      const pedido = await criarPedido();
      await orderService!.updateStatus(pedido.id, "CANCELLED", companyA, ownerA);

      expect(await planLimitService!.getCurrentUsage(companyA.id, "ordersPerMonth")).toBe(
        antes + 1,
      );
    });

    // Sem o lock, as duas leriam a mesma contagem e ambas passariam.
    it("duas criações concorrentes não ultrapassam a última vaga", async () => {
      const jaCriados = await planLimitService!.getCurrentUsage(
        companyA.id,
        "ordersPerMonth",
      );
      await definirTeto("maxOrdersPerMonth", jaCriados + 1);

      const resultados = await Promise.allSettled([criarPedido(), criarPedido()]);
      const aceitos = resultados.filter((r) => r.status === "fulfilled").length;

      expect(aceitos).toBe(1);
      expect(await planLimitService!.getCurrentUsage(companyA.id, "ordersPerMonth")).toBe(
        jaCriados + 1,
      );
    });
  });

  describe("produtos e clientes", () => {
    it("produto inativo continua ocupando vaga", async () => {
      await definirTeto("maxProducts", null);
      const criado = await productService!.create(
        {
          sku: `INAT-${randomUUID().slice(0, 6)}`,
          name: "Inativo",
          price: 5,
          unit: "UN",
          active: true,
        },
        companyA,
        ownerA,
      );

      const antes = await planLimitService!.getCurrentUsage(companyA.id, "products");
      await productService!.update(criado.id, { active: false }, companyA, ownerA);

      // Se desativar isentasse, o teto seria contornável: desativar tudo,
      // criar de novo, reativar.
      expect(await planLimitService!.getCurrentUsage(companyA.id, "products")).toBe(
        antes,
      );
    });

    it("produto excluído libera vaga", async () => {
      await definirTeto("maxProducts", null);
      const criado = await productService!.create(
        {
          sku: `DEL-${randomUUID().slice(0, 6)}`,
          name: "Temporário",
          price: 5,
          unit: "UN",
          active: true,
        },
        companyA,
        ownerA,
      );

      const antes = await planLimitService!.getCurrentUsage(companyA.id, "products");
      await productService!.delete(criado.id, companyA, ownerA);

      expect(await planLimitService!.getCurrentUsage(companyA.id, "products")).toBe(
        antes - 1,
      );
    });

    it("barra produto acima do teto", async () => {
      const uso = await planLimitService!.getCurrentUsage(companyA.id, "products");
      await definirTeto("maxProducts", uso);

      await expect(
        productService!.create(
          {
            sku: `X-${randomUUID().slice(0, 6)}`,
            name: "Excedente",
            price: 5,
            unit: "UN",
            active: true,
          },
          companyA,
          ownerA,
        ),
      ).rejects.toThrow(PlanLimitReachedError);
    });

    it("barra cliente acima do teto", async () => {
      const uso = await planLimitService!.getCurrentUsage(companyA.id, "customers");
      await definirTeto("maxCustomers", uso);

      await expect(
        customerService!.create({ name: "Excedente" }, companyA, ownerA),
      ).rejects.toThrow(PlanLimitReachedError);
    });
  });

  describe("usuários e convites", () => {
    const email = () => `convidado-${randomUUID().slice(0, 8)}@teste.com`;
    const empresaComNome = () => ({ ...companyA, name: "Cota A" });
    const ator = () => ({ id: ownerA, role: "OWNER" as const });

    it("convite pendente reserva vaga", async () => {
      await definirTeto("maxUsers", null);
      const antes = await planLimitService!.getCurrentUsage(companyA.id, "users");

      await teamService!.invite(
        { email: email(), role: "OPERATOR" },
        empresaComNome(),
        ator(),
      );

      expect(await planLimitService!.getCurrentUsage(companyA.id, "users")).toBe(
        antes + 1,
      );
    });

    it("reenviar convite para o mesmo e-mail NÃO reserva segunda vaga", async () => {
      await definirTeto("maxUsers", null);
      const alvo = email();

      await teamService!.invite(
        { email: alvo, role: "OPERATOR" },
        empresaComNome(),
        ator(),
      );
      const depoisDoPrimeiro = await planLimitService!.getCurrentUsage(
        companyA.id,
        "users",
      );

      await teamService!.invite(
        { email: alvo, role: "OPERATOR" },
        empresaComNome(),
        ator(),
      );

      expect(await planLimitService!.getCurrentUsage(companyA.id, "users")).toBe(
        depoisDoPrimeiro,
      );
      expect(
        await prisma!.invitation.count({
          where: { companyId: companyA.id, email: alvo },
        }),
      ).toBe(1);
    });

    it("convite expirado não reserva vaga", async () => {
      await definirTeto("maxUsers", null);
      const alvo = email();

      await teamService!.invite(
        { email: alvo, role: "OPERATOR" },
        empresaComNome(),
        ator(),
      );
      const comValido = await planLimitService!.getCurrentUsage(companyA.id, "users");

      await prisma!.invitation.updateMany({
        where: { companyId: companyA.id, email: alvo },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      expect(await planLimitService!.getCurrentUsage(companyA.id, "users")).toBe(
        comValido - 1,
      );
    });

    it("barra convite quando não há vaga", async () => {
      const uso = await planLimitService!.getCurrentUsage(companyA.id, "users");
      await definirTeto("maxUsers", uso);

      await expect(
        teamService!.invite(
          { email: email(), role: "OPERATOR" },
          empresaComNome(),
          ator(),
        ),
      ).rejects.toThrow(PlanLimitReachedError);
    });

    // O convite já ocupa a vaga; aceitá-lo troca reserva por pessoa e o uso
    // total não muda. Sem descontar a reserva, este caso seria recusado.
    it("convite no limite exato pode ser aceito", async () => {
      await definirTeto("maxUsers", null);
      const alvo = email();
      await teamService!.invite(
        { email: alvo, role: "OPERATOR" },
        empresaComNome(),
        ator(),
      );

      const uso = await planLimitService!.getCurrentUsage(companyA.id, "users");
      await definirTeto("maxUsers", uso); // uso == teto, sem folga

      const convite = await prisma!.invitation.findFirstOrThrow({
        where: { companyId: companyA.id, email: alvo },
      });

      await expect(
        teamService!.acceptInvite({
          token: convite.token,
          name: "Aceito no limite",
          password: "Senha@123",
        }),
      ).resolves.toMatchObject({ companyId: companyA.id });

      // Uso permanece o mesmo: uma reserva virou um usuário.
      expect(await planLimitService!.getCurrentUsage(companyA.id, "users")).toBe(uso);
    });

    it("recusa e-mail de usuário ativo, sem criar convite", async () => {
      await definirTeto("maxUsers", null);
      const dono = await prisma!.user.findUniqueOrThrow({ where: { id: ownerA } });

      await expect(
        teamService!.invite(
          { email: dono.email, role: "OPERATOR" },
          empresaComNome(),
          ator(),
        ),
      ).rejects.toThrow(EmailAlreadyInUseError);

      expect(
        await prisma!.invitation.count({
          where: { companyId: companyA.id, email: dono.email },
        }),
      ).toBe(0);
    });

    // O e-mail é único GLOBALMENTE, sem exceção para soft delete. Antes, este
    // convite passava e só estourava no aceite, com um P2002 cru na interface.
    it("recusa e-mail de usuário REMOVIDO, com erro tratado", async () => {
      await definirTeto("maxUsers", null);
      const removido = await prisma!.user.create({
        data: {
          companyId: companyA.id,
          name: "Ex-membro",
          email: `ex-${randomUUID().slice(0, 8)}@teste.com`,
          role: "OPERATOR",
          deletedAt: new Date(),
        },
      });

      await expect(
        teamService!.invite(
          { email: removido.email, role: "OPERATOR" },
          empresaComNome(),
          ator(),
        ),
      ).rejects.toThrow(EmailAlreadyInUseError);
    });

    it("dois aceites simultâneos do mesmo token criam apenas um usuário", async () => {
      await definirTeto("maxUsers", null);
      const alvo = email();
      await teamService!.invite(
        { email: alvo, role: "OPERATOR" },
        empresaComNome(),
        ator(),
      );

      const convite = await prisma!.invitation.findFirstOrThrow({
        where: { companyId: companyA.id, email: alvo },
      });

      const tentativa = () =>
        teamService!.acceptInvite({
          token: convite.token,
          name: "Concorrente",
          password: "Senha@123",
        });

      const resultados = await Promise.allSettled([tentativa(), tentativa()]);

      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await prisma!.user.count({ where: { email: alvo } })).toBe(1);
      expect(await prisma!.invitation.count({ where: { id: convite.id } })).toBe(0);
    });
  });

  describe("isolamento entre empresas", () => {
    it("o uso da empresa A não enxerga registros da empresa B", async () => {
      await definirTeto("maxProducts", null);

      const antesA = await planLimitService!.getCurrentUsage(companyA.id, "products");
      await prisma!.product.create({
        data: {
          companyId: companyB.id,
          sku: `B-${randomUUID().slice(0, 6)}`,
          name: "Produto da B",
          price: 5,
          stockQuantity: 1,
        },
      });

      expect(await planLimitService!.getCurrentUsage(companyA.id, "products")).toBe(
        antesA,
      );
      expect(await planLimitService!.getCurrentUsage(companyB.id, "products")).toBe(1);
    });

    it("convites da empresa B não contam para a empresa A", async () => {
      await definirTeto("maxUsers", null);
      const antesA = await planLimitService!.getCurrentUsage(companyA.id, "users");

      await prisma!.invitation.create({
        data: {
          companyId: companyB.id,
          email: `b-${randomUUID().slice(0, 8)}@teste.com`,
          role: "OPERATOR",
          token: randomUUID(),
          invitedById: ownerA,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });

      expect(await planLimitService!.getCurrentUsage(companyA.id, "users")).toBe(antesA);
    });
  });
});
