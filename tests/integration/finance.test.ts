import { randomUUID } from "crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { PrismaOrderRepository } from "@/repositories/implementations/PrismaOrderRepository";
import { PrismaCustomerRepository } from "@/repositories/implementations/PrismaCustomerRepository";
import { PrismaProductRepository } from "@/repositories/implementations/PrismaProductRepository";
import { PrismaNotificationRepository } from "@/repositories/implementations/PrismaNotificationRepository";
import { PrismaPaymentRepository } from "@/repositories/implementations/PrismaPaymentRepository";
import { AuditService } from "@/services/AuditService";
import { FinanceService } from "@/services/FinanceService";
import { NotificationService } from "@/services/NotificationService";
import { OrderService } from "@/services/OrderService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";

import { createTestPrismaClient } from "../helpers/prisma";
import { withRole, type ActingCompany } from "../helpers/company";

const prisma = createTestPrismaClient();
const gate = new SubscriptionGateService();
const paymentRepository = prisma ? new PrismaPaymentRepository(prisma) : null;

const financeService = prisma
  ? new FinanceService(paymentRepository!, new AuditService(prisma), gate)
  : null;

const orderService = prisma
  ? new OrderService(
      new PrismaOrderRepository(prisma),
      new PrismaCustomerRepository(prisma),
      new PrismaProductRepository(prisma),
      new AuditService(prisma),
      gate,
      new NotificationService(new PrismaNotificationRepository(prisma)),
    )
  : null;

// Dinheiro não se prova com mock: o que importa aqui é a transação, o lock de
// linha, a constraint de idempotência e as FKs compostas — nada disso existe
// num duplo de repositório.
describe.skipIf(!prisma)("Financeiro dos pedidos", () => {
  let companyA: ActingCompany;
  let companyB: ActingCompany;
  let userA: string;
  let userB: string;
  let customerA: string;
  let productA: string;
  let orderB: string;

  beforeAll(async () => {
    if (!prisma) return;
    const suffix = randomUUID().slice(0, 8);

    const criarEmpresa = (label: string) =>
      prisma.company.create({
        data: {
          name: `Fin ${label} ${suffix}`,
          email: `fin-${label}-${suffix}@teste.com`,
          trialEndsAt: new Date(Date.now() + 86_400_000),
          subscriptionStatus: "ACTIVE",
        },
      });

    companyA = withRole(await criarEmpresa("A"));
    companyB = withRole(await criarEmpresa("B"));

    const criarUsuario = (companyId: string, nome: string) =>
      prisma.user
        .create({
          data: {
            companyId,
            name: nome,
            email: `${nome.toLowerCase()}-${suffix}@teste.com`,
            role: "OWNER",
          },
        })
        .then((u) => u.id);

    userA = await criarUsuario(companyA.id, "DonoA");
    userB = await criarUsuario(companyB.id, "DonoB");

    customerA = (
      await prisma.customer.create({
        data: { companyId: companyA.id, name: "Cliente Fin" },
      })
    ).id;

    productA = (
      await prisma.product.create({
        data: {
          companyId: companyA.id,
          sku: `FIN-${suffix}`,
          name: "Produto Fin",
          price: 100,
          stockQuantity: 10_000,
        },
      })
    ).id;

    const clienteB = await prisma.customer.create({
      data: { companyId: companyB.id, name: "Cliente B" },
    });
    const produtoB = await prisma.product.create({
      data: {
        companyId: companyB.id,
        sku: `FINB-${suffix}`,
        name: "Produto B",
        price: 100,
        stockQuantity: 100,
      },
    });
    orderB = (
      await orderService!.create(
        {
          customerId: clienteB.id,
          items: [{ productId: produtoB.id, quantity: 1 }],
          discount: 0,
          notes: "",
        },
        companyB,
        userB,
      )
    ).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = [companyA.id, companyB.id];

    // Payment sai PRIMEIRO: as FKs para Order, User e Company são RESTRICT,
    // então qualquer outra ordem faz a limpeza falhar. É o preço — desejado —
    // de o ledger não sumir por cascata.
    await prisma.payment.deleteMany({ where: { companyId: { in: ids } } });
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

  /** Pedido novo de R$ 100 na empresa A, isolado por teste. */
  async function novoPedido(): Promise<string> {
    const pedido = await orderService!.create(
      {
        customerId: customerA,
        items: [{ productId: productA, quantity: 1 }],
        discount: 0,
        notes: "",
      },
      companyA,
      userA,
    );
    return pedido.id;
  }

  const chave = () => randomUUID();
  const hoje = () => new Date().toISOString().slice(0, 10);

  function lancamento(
    orderId: string,
    amount: number,
    extra: { method?: "PIX" | "CASH"; note?: string } = {},
  ) {
    return {
      orderId,
      amount,
      method: extra.method ?? ("PIX" as const),
      paidAt: hoje(),
      idempotencyKey: chave(),
      ...(extra.note !== undefined ? { note: extra.note } : {}),
    };
  }

  // Estorno exige justificativa no schema, então o helper a torna obrigatória
  // na assinatura — o compilador cobra em vez de o teste falhar em runtime.
  function estorno(
    orderId: string,
    amount: number,
    note: string,
    method?: "PIX" | "CASH",
  ) {
    return {
      orderId,
      amount,
      method: method ?? ("PIX" as const),
      paidAt: hoje(),
      idempotencyKey: chave(),
      note,
    };
  }

  async function estado(orderId: string) {
    const pedido = await prisma!.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { paidAmount: true, paymentStatus: true, total: true },
    });
    return {
      paidAmount: Number(pedido.paidAmount),
      paymentStatus: pedido.paymentStatus,
      total: Number(pedido.total),
    };
  }

  describe("recebimentos", () => {
    it("pagamento total leva o pedido a PAID", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 100), companyA, userA);

      expect(await estado(id)).toMatchObject({ paidAmount: 100, paymentStatus: "PAID" });
    });

    it("pagamento parcial leva a PARTIAL", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 40), companyA, userA);

      expect(await estado(id)).toMatchObject({
        paidAmount: 40,
        paymentStatus: "PARTIAL",
      });
    });

    it("vários pagamentos somam até quitar", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 30), companyA, userA);
      await financeService!.registerPayment(lancamento(id, 30), companyA, userA);
      await financeService!.registerPayment(lancamento(id, 40), companyA, userA);

      expect(await estado(id)).toMatchObject({ paidAmount: 100, paymentStatus: "PAID" });
    });

    it("aceita métodos diferentes no mesmo pedido", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 60), companyA, userA);
      await financeService!.registerPayment(
        lancamento(id, 40, { method: "CASH" }),
        companyA,
        userA,
      );

      const linhas = await paymentRepository!.listByOrder(id, companyA.id);
      expect(linhas.map((l) => l.method).sort()).toEqual(["CASH", "PIX"]);
      expect(await estado(id)).toMatchObject({ paymentStatus: "PAID" });
    });

    it("aceita pagamento exatamente igual ao restante", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 70), companyA, userA);
      await financeService!.registerPayment(lancamento(id, 30), companyA, userA);

      expect(await estado(id)).toMatchObject({ paidAmount: 100, paymentStatus: "PAID" });
    });

    it("recusa pagamento acima do restante", async () => {
      const id = await novoPedido();
      await expect(
        financeService!.registerPayment(lancamento(id, 150), companyA, userA),
      ).rejects.toThrow(ValidationError);

      expect(await estado(id)).toMatchObject({ paidAmount: 0, paymentStatus: "PENDING" });
    });

    it("recusa valor zero e valor negativo no schema", async () => {
      const { registerPaymentSchema } = await import("@/schemas/payment.schema");
      const id = await novoPedido();

      expect(registerPaymentSchema.safeParse(lancamento(id, 0)).success).toBe(false);
      expect(registerPaymentSchema.safeParse(lancamento(id, -10)).success).toBe(false);
    });
  });

  describe("estornos", () => {
    it("estorno total volta o pedido para REFUNDED", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 100), companyA, userA);
      await financeService!.refundPayment(
        estorno(id, 100, "cliente desistiu"),
        companyA,
        userA,
      );

      expect(await estado(id)).toMatchObject({
        paidAmount: 0,
        paymentStatus: "REFUNDED",
      });
    });

    it("estorno parcial de pedido pago volta para PARTIAL", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 100), companyA, userA);
      await financeService!.refundPayment(
        estorno(id, 40, "devolução parcial"),
        companyA,
        userA,
      );

      expect(await estado(id)).toMatchObject({
        paidAmount: 60,
        paymentStatus: "PARTIAL",
      });
    });

    it("recusa estorno acima do recebido", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 50), companyA, userA);

      await expect(
        financeService!.refundPayment(estorno(id, 80, "tentativa"), companyA, userA),
      ).rejects.toThrow(ValidationError);

      expect(await estado(id)).toMatchObject({ paidAmount: 50 });
    });

    it("exige justificativa no estorno", async () => {
      const { refundPaymentSchema } = await import("@/schemas/payment.schema");
      const id = await novoPedido();

      expect(refundPaymentSchema.safeParse(lancamento(id, 10)).success).toBe(false);
      expect(refundPaymentSchema.safeParse(estorno(id, 10, "motivo")).success).toBe(true);
    });
  });

  describe("idempotência", () => {
    it("mesma chave e mesmos dados devolve o lançamento existente, sem duplicar", async () => {
      const id = await novoPedido();
      const payload = lancamento(id, 50);

      const primeiro = await financeService!.registerPayment(payload, companyA, userA);
      const segundo = await financeService!.registerPayment(payload, companyA, userA);

      expect(segundo.id).toBe(primeiro.id);

      const linhas = await paymentRepository!.listByOrder(id, companyA.id);
      expect(linhas).toHaveLength(1);
      expect(await estado(id)).toMatchObject({ paidAmount: 50 });
    });

    it("mesma chave com dados diferentes é 409, e nada é criado", async () => {
      const id = await novoPedido();
      const payload = lancamento(id, 50);
      await financeService!.registerPayment(payload, companyA, userA);

      await expect(
        financeService!.registerPayment({ ...payload, amount: 70 }, companyA, userA),
      ).rejects.toThrow(ConflictError);

      const linhas = await paymentRepository!.listByOrder(id, companyA.id);
      expect(linhas).toHaveLength(1);
      expect(await estado(id)).toMatchObject({ paidAmount: 50 });
    });

    it("clique duplo simultâneo grava uma linha só", async () => {
      const id = await novoPedido();
      const payload = lancamento(id, 50);

      const [a, b] = await Promise.all([
        financeService!.registerPayment(payload, companyA, userA),
        financeService!.registerPayment(payload, companyA, userA),
      ]);

      expect(a.id).toBe(b.id);
      expect(await paymentRepository!.listByOrder(id, companyA.id)).toHaveLength(1);
    });
  });

  describe("concorrência", () => {
    // Sem o FOR UPDATE, duas requisições leriam paidAmount=0 ao mesmo tempo e
    // as duas passariam pela validação, gravando 120 num pedido de 100.
    it("duas requisições concorrentes não ultrapassam o total", async () => {
      const id = await novoPedido();

      const resultados = await Promise.allSettled([
        financeService!.registerPayment(lancamento(id, 60), companyA, userA),
        financeService!.registerPayment(lancamento(id, 60), companyA, userA),
      ]);

      const aceitos = resultados.filter((r) => r.status === "fulfilled").length;
      expect(aceitos).toBe(1);

      const final = await estado(id);
      expect(final.paidAmount).toBe(60);
      expect(final.paidAmount).toBeLessThanOrEqual(final.total);
    });

    it("o cache paidAmount bate com a soma do ledger", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 30), companyA, userA);
      await financeService!.registerPayment(lancamento(id, 50), companyA, userA);
      await financeService!.refundPayment(estorno(id, 20, "ajuste"), companyA, userA);

      const resumo = await paymentRepository!.summarize(id, companyA.id);
      const cache = await estado(id);

      expect(cache.paidAmount).toBe(resumo.netPaid);
      expect(cache.paidAmount).toBe(60);
    });
  });

  describe("cancelamento", () => {
    it("bloqueia cancelar pedido com valor recebido", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 50), companyA, userA);

      await expect(
        orderService!.updateStatus(id, "CANCELLED", companyA, userA),
      ).rejects.toThrow(ValidationError);

      const pedido = await prisma!.order.findUniqueOrThrow({ where: { id } });
      expect(pedido.status).not.toBe("CANCELLED");
    });

    it("permite cancelar depois do estorno completo", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 50), companyA, userA);
      await financeService!.refundPayment(
        estorno(id, 50, "estorno para cancelar"),
        companyA,
        userA,
      );

      await expect(
        orderService!.updateStatus(id, "CANCELLED", companyA, userA),
      ).resolves.not.toThrow();
    });

    it("recusa lançamento em pedido cancelado", async () => {
      const id = await novoPedido();
      await orderService!.updateStatus(id, "CANCELLED", companyA, userA);

      await expect(
        financeService!.registerPayment(lancamento(id, 10), companyA, userA),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("permissões", () => {
    const como = (role: ActingCompany["role"]) => ({ ...companyA, role });

    it("MANAGER registra pagamento", async () => {
      const id = await novoPedido();
      await expect(
        financeService!.registerPayment(lancamento(id, 10), como("MANAGER"), userA),
      ).resolves.toBeDefined();
    });

    it("MANAGER não estorna", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 10), companyA, userA);

      await expect(
        financeService!.refundPayment(
          estorno(id, 10, "tentativa"),
          como("MANAGER"),
          userA,
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it("FINANCE registra e estorna", async () => {
      const id = await novoPedido();
      await financeService!.registerPayment(lancamento(id, 20), como("FINANCE"), userA);
      await expect(
        financeService!.refundPayment(estorno(id, 20, "ok"), como("FINANCE"), userA),
      ).resolves.toBeDefined();
    });

    it("OPERATOR não acessa o financeiro", async () => {
      const id = await novoPedido();
      await expect(
        financeService!.registerPayment(lancamento(id, 10), como("OPERATOR"), userA),
      ).rejects.toThrow(ForbiddenError);
    });

    it("VIEWER não acessa o financeiro", async () => {
      const id = await novoPedido();
      await expect(
        financeService!.registerPayment(lancamento(id, 10), como("VIEWER"), userA),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("isolamento entre empresas", () => {
    it("empresa A não lança pagamento em pedido da empresa B", async () => {
      await expect(
        financeService!.registerPayment(lancamento(orderB, 10), companyA, userA),
      ).rejects.toThrow();

      const linhas = await paymentRepository!.listByOrder(orderB, companyB.id);
      expect(linhas).toHaveLength(0);
    });

    // A FK composta é a última barreira: mesmo que um bug no service deixasse
    // passar, o Postgres recusa a linha.
    it("a FK composta recusa pagamento com pedido de outra empresa", async () => {
      await expect(
        prisma!.payment.create({
          data: {
            companyId: companyA.id,
            orderId: orderB,
            createdById: userA,
            type: "PAYMENT",
            amount: 10,
            method: "PIX",
            paidAt: new Date(),
            idempotencyKey: randomUUID(),
          },
        }),
      ).rejects.toThrow();
    });

    it("a FK composta recusa autor de outra empresa", async () => {
      const id = await novoPedido();
      await expect(
        prisma!.payment.create({
          data: {
            companyId: companyA.id,
            orderId: id,
            createdById: userB,
            type: "PAYMENT",
            amount: 10,
            method: "PIX",
            paidAt: new Date(),
            idempotencyKey: randomUUID(),
          },
        }),
      ).rejects.toThrow();
    });

    it("o CHECK do banco recusa valor zero ou negativo", async () => {
      const id = await novoPedido();
      await expect(
        prisma!.payment.create({
          data: {
            companyId: companyA.id,
            orderId: id,
            createdById: userA,
            type: "PAYMENT",
            amount: 0,
            method: "PIX",
            paidAt: new Date(),
            idempotencyKey: randomUUID(),
          },
        }),
      ).rejects.toThrow();
    });
  });
});
