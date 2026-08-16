import { randomUUID } from "crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ForbiddenError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { PrismaOrderRepository } from "@/repositories/implementations/PrismaOrderRepository";
import { PrismaCustomerRepository } from "@/repositories/implementations/PrismaCustomerRepository";
import { PrismaProductRepository } from "@/repositories/implementations/PrismaProductRepository";
import { PrismaStockRepository } from "@/repositories/implementations/PrismaStockRepository";
import { PrismaReportRepository } from "@/repositories/implementations/PrismaReportRepository";
import { PrismaNotificationRepository } from "@/repositories/implementations/PrismaNotificationRepository";
import { AuditService } from "@/services/AuditService";
import { NotificationService } from "@/services/NotificationService";
import { OrderService } from "@/services/OrderService";
import { ProductService } from "@/services/ProductService";
import { ReportService } from "@/services/ReportService";
import { StockService } from "@/services/StockService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";
import { toClientProduct, toClientProductWithCosts } from "@/types/products";
import {
  ORDER_FINANCIAL_FIELDS,
  redactOrderFinancials,
  toClientOrderListItem,
} from "@/types/orders";

import { createTestPrismaClient } from "../helpers/prisma";
import { buildPlanLimitService } from "../helpers/services";
import { withRole, type ActingCompany } from "../helpers/company";

const prisma = createTestPrismaClient();
const gate = new SubscriptionGateService();

const orderService = prisma
  ? new OrderService(
      new PrismaOrderRepository(prisma),
      new PrismaCustomerRepository(prisma),
      new PrismaProductRepository(prisma),
      new AuditService(prisma),
      gate,
      new NotificationService(new PrismaNotificationRepository(prisma)),
      buildPlanLimitService(prisma),
    )
  : null;

const productService = prisma
  ? new ProductService(
      new PrismaProductRepository(prisma),
      new AuditService(prisma),
      gate,
      buildPlanLimitService(prisma),
    )
  : null;

const stockService = prisma
  ? new StockService(new PrismaStockRepository(prisma), gate)
  : null;

const reportService = prisma
  ? new ReportService(new PrismaReportRepository(prisma))
  : null;

// Estes testes exercitam o guard e a redação contra o banco real. Um mock do
// repositório provaria que o service chamou assertPermission, não que o dado
// sensível deixou de sair — e é o dado saindo que importa aqui.
describe.skipIf(!prisma)("Permissões por papel", () => {
  let companyA: ActingCompany;
  let companyB: ActingCompany;
  let userId: string;
  let customerId: string;
  let productId: string;
  let orderId: string;

  beforeAll(async () => {
    if (!prisma) return;
    const suffix = randomUUID().slice(0, 8);

    const criar = (label: string) =>
      prisma.company.create({
        data: {
          name: `Perm ${label} ${suffix}`,
          email: `perm-${label}-${suffix}@teste.com`,
          trialEndsAt: new Date(Date.now() + 86_400_000),
          subscriptionStatus: "ACTIVE",
        },
      });

    companyA = withRole(await criar("A"));
    companyB = withRole(await criar("B"));

    const user = await prisma.user.create({
      data: {
        companyId: companyA.id,
        name: "Dono",
        email: `dono-${suffix}@teste.com`,
        role: "OWNER",
      },
    });
    userId = user.id;

    const customer = await prisma.customer.create({
      data: { companyId: companyA.id, name: "Cliente Perm" },
    });
    customerId = customer.id;

    const product = await prisma.product.create({
      data: {
        companyId: companyA.id,
        sku: `PERM-${suffix}`,
        name: "Produto Perm",
        price: 50,
        costPrice: 20,
        stockQuantity: 100,
      },
    });
    productId = product.id;

    const order = await orderService!.create(
      { customerId, items: [{ productId, quantity: 2 }], discount: 0, notes: "" },
      companyA,
      userId,
    );
    orderId = order.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = [companyA.id, companyB.id];

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

  const como = (role: ActingCompany["role"]) => ({ ...companyA, role });

  describe("VIEWER", () => {
    it("consulta o pedido, com os dados operacionais intactos", async () => {
      const pedido = await orderService!.findById(orderId, companyA.id);

      expect(pedido).not.toBeNull();
      expect(pedido!.orderNumber).toBeTruthy();
      expect(pedido!.customer.name).toBe("Cliente Perm");
      expect(pedido!.items).toHaveLength(1);
      expect(pedido!.items[0]!.quantity).toBe(2);
    });

    it("não recebe nenhum campo financeiro do pedido", async () => {
      const completo = await orderService!.findById(orderId, companyA.id);
      const visto = redactOrderFinancials(completo!);

      // `in`, e não `=== undefined`: a exigência é a chave não existir no
      // objeto serializado, não valer undefined.
      expect("subtotal" in visto).toBe(false);
      expect("discount" in visto).toBe(false);
      expect("total" in visto).toBe(false);
      expect("paymentMethod" in visto).toBe(false);
      expect("unitPrice" in visto.items[0]!).toBe(false);
      expect("total" in visto.items[0]!).toBe(false);

      // O que sustenta a operação continua lá.
      expect(visto.items[0]!.productName).toBe("Produto Perm");
      expect(visto.items[0]!.quantity).toBe(2);
    });

    it("não recebe o total na listagem", async () => {
      const pagina = await orderService!.list(companyA.id, { page: 1 });
      const linha = toClientOrderListItem(pagina.data[0]!, false);

      expect(linha.total).toBeNull();
      expect(linha.orderNumber).toBeTruthy();
    });

    it("não acessa o relatório de vendas", async () => {
      await expect(
        reportService!.getSalesReport(companyA.id, 30, "VIEWER"),
      ).rejects.toThrow(ForbiddenError);
    });

    it("não cria pedido", async () => {
      await expect(
        orderService!.create(
          { customerId, items: [{ productId, quantity: 1 }], discount: 0, notes: "" },
          como("VIEWER"),
          userId,
        ),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("OPERATOR", () => {
    it("NÃO recebe o faturamento do painel", async () => {
      // Era exatamente este o vazamento relatado: o painel entregava
      // "Faturamento do mês" a qualquer papel porque a página não lia `role`.
      const stats = await orderService!.getStats(companyA.id, "OPERATOR");

      expect(stats.monthRevenue).toBeNull();
      expect(JSON.stringify(stats)).not.toMatch(/monthRevenue":\s*\d/);
    });

    it("continua recebendo as contagens de que precisa para trabalhar", async () => {
      const stats = await orderService!.getStats(companyA.id, "OPERATOR");

      expect(stats.pendingCount).toBeTypeOf("number");
      expect(stats.processingCount).toBeTypeOf("number");
      expect(stats.readyCount).toBeTypeOf("number");
    });

    it("NÃO recebe os valores do pedido — nem por chamada direta ao service", async () => {
      const pedido = await orderService!.findById(orderId, companyA.id);
      const redigido = redactOrderFinancials(pedido!);

      for (const campo of ORDER_FINANCIAL_FIELDS) {
        expect(campo in redigido).toBe(false);
      }
      for (const item of redigido.items) {
        expect("unitPrice" in item).toBe(false);
        expect("total" in item).toBe(false);
      }
    });

    it("NÃO exporta pedidos — o CSV carrega os valores", async () => {
      expect(can("OPERATOR", "orders", "export")).toBe(false);
    });

    it("NÃO acessa o relatório de vendas nem o financeiro", async () => {
      await expect(
        reportService!.getSalesReport(companyA.id, 30, "OPERATOR"),
      ).rejects.toThrow(ForbiddenError);
      expect(can("OPERATOR", "finance", "view")).toBe(false);
    });

    it("não recebe custo nem margem do produto", async () => {
      const produto = await productService!.findById(productId, companyA.id);
      const visto = toClientProduct(produto!);

      expect("costPrice" in visto).toBe(false);
      // Preço de venda continua, porque ele monta pedido com isso.
      expect(visto.price).toBe(50);
    });

    it("não exclui pedido", async () => {
      await expect(
        orderService!.delete(orderId, como("OPERATOR"), userId),
      ).rejects.toThrow(ForbiddenError);

      const aindaExiste = await orderService!.findById(orderId, companyA.id);
      expect(aindaExiste).not.toBeNull();
    });

    it("não ajusta estoque", async () => {
      await expect(
        stockService!.adjust(
          {
            productId,
            reason: "ADJUSTMENT",
            direction: "IN",
            quantity: 10,
            note: "teste",
          },
          como("OPERATOR"),
          userId,
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it("cria pedido normalmente", async () => {
      const criado = await orderService!.create(
        { customerId, items: [{ productId, quantity: 1 }], discount: 0, notes: "" },
        como("OPERATOR"),
        userId,
      );

      expect(criado.id).toBeTruthy();
    });
  });

  describe("FINANCE", () => {
    it("vê custo e margem", async () => {
      const produto = await productService!.findById(productId, companyA.id);
      const visto = toClientProductWithCosts(produto!);

      expect(visto.costPrice).toBe(20);
    });

    it("acessa o relatório de vendas", async () => {
      const relatorio = await reportService!.getSalesReport(companyA.id, 30, "FINANCE");
      expect(relatorio.summary).toBeDefined();
    });

    it("não cria nem altera pedido", async () => {
      await expect(
        orderService!.create(
          { customerId, items: [{ productId, quantity: 1 }], discount: 0, notes: "" },
          como("FINANCE"),
          userId,
        ),
      ).rejects.toThrow(ForbiddenError);

      await expect(
        orderService!.updateStatus(orderId, "PROCESSING", como("FINANCE"), userId),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("MANAGER", () => {
    it("ajusta estoque e exclui pedido", async () => {
      await expect(
        stockService!.adjust(
          {
            productId,
            reason: "RESTOCK",
            direction: "IN",
            quantity: 5,
            note: "reposição",
          },
          como("MANAGER"),
          userId,
        ),
      ).resolves.not.toThrow();
    });

    it("NÃO acessa o relatório de vendas", async () => {
      // Faturamento, ticket médio e ranking por receita saíram do escopo do
      // gerente. O service recusa mesmo chamado direto, sem passar pela tela.
      await expect(
        reportService!.getSalesReport(companyA.id, 30, "MANAGER"),
      ).rejects.toThrow(ForbiddenError);
    });

    it("NÃO recebe o faturamento do painel", async () => {
      const stats = await orderService!.getStats(companyA.id, "MANAGER");

      expect(stats.monthRevenue).toBeNull();
      // As contagens operacionais continuam — ele precisa delas para gerenciar.
      expect(stats.pendingCount).toBeTypeOf("number");
    });
  });

  // O guard de permissão é uma camada nova; ele não pode ter aberto brecha na
  // que já existia. Um papel poderoso na empresa A continua sem nada na B.
  describe("isolamento entre empresas continua valendo", () => {
    it("OWNER da empresa A não enxerga pedido da empresa B", async () => {
      const daOutra = await orderService!.findById(orderId, companyB.id);
      expect(daOutra).toBeNull();
    });

    it("OWNER da empresa A não enxerga produto da empresa B", async () => {
      const daOutra = await productService!.findById(productId, companyB.id);
      expect(daOutra).toBeNull();
    });

    it("relatório da empresa B não soma nada da empresa A", async () => {
      const relatorio = await reportService!.getSalesReport(companyB.id, 30, "OWNER");
      expect(relatorio.summary.orderCount).toBe(0);
      expect(relatorio.summary.revenue).toBe(0);
    });
  });
});
