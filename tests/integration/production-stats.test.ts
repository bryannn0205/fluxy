import { randomUUID } from "crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startOfDaysAgoBrazil } from "@/lib/dates";
import { PrismaOrderRepository } from "@/repositories/implementations/PrismaOrderRepository";

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();
const repository = prisma ? new PrismaOrderRepository(prisma) : null;

/**
 * A janela do dia de `getStats` e a contagem de itens do board.
 *
 * Contra Postgres real, e não com o repositório mockado, porque o que está sob
 * teste é a consulta: um `gte` no fuso errado, um `deletedAt` esquecido ou um
 * `_count` mal declarado passam por qualquer mock e só aparecem no banco.
 *
 * As datas são ancoradas em `startOfDaysAgoBrazil(0)`, não em literais: o teste
 * roda a qualquer hora do dia, inclusive nas três horas em que a data UTC já
 * virou e a de Brasília não — que é justamente o caso que ele existe para
 * proteger.
 */
describe.skipIf(!prisma)("getStats — janela do dia", () => {
  const inicioDeHoje = startOfDaysAgoBrazil(0);

  let companyId: string;
  let outraCompanyId: string;
  let customerId: string;
  let productId: string;
  let userId: string;
  let proximoNumero = 1;

  async function criarPedido(options: {
    companyId?: string;
    createdAt: Date;
    total: number;
    status?: "PENDING" | "PROCESSING" | "READY" | "COMPLETED" | "CANCELLED";
    deletedAt?: Date;
    itens?: number;
  }) {
    const dono = options.companyId ?? companyId;
    const quantidadeDeItens = options.itens ?? 1;

    return prisma!.order.create({
      data: {
        companyId: dono,
        orderNumber: String(proximoNumero++).padStart(4, "0"),
        customerId,
        status: options.status ?? "PENDING",
        subtotal: options.total,
        discount: 0,
        total: options.total,
        createdById: userId,
        createdAt: options.createdAt,
        ...(options.deletedAt ? { deletedAt: options.deletedAt } : {}),
        items: {
          create: Array.from({ length: quantidadeDeItens }, (_, indice) => ({
            companyId: dono,
            productId,
            productName: `Item ${indice + 1}`,
            unitPrice: options.total / quantidadeDeItens,
            quantity: 1,
            total: options.total / quantidadeDeItens,
          })),
        },
      },
    });
  }

  beforeAll(async () => {
    if (!prisma) return;

    const suffix = randomUUID().slice(0, 8);

    const empresa = await prisma.company.create({
      data: {
        name: `Producao Teste ${suffix}`,
        email: `producao-${suffix}@teste.com`,
        trialEndsAt: new Date(Date.now() + 86_400_000),
        subscriptionStatus: "ACTIVE",
      },
    });
    companyId = empresa.id;

    const vizinha = await prisma.company.create({
      data: {
        name: `Producao Vizinha ${suffix}`,
        email: `vizinha-${suffix}@teste.com`,
        trialEndsAt: new Date(Date.now() + 86_400_000),
        subscriptionStatus: "ACTIVE",
      },
    });
    outraCompanyId = vizinha.id;

    const user = await prisma.user.create({
      data: {
        companyId,
        name: "Usuário Produção",
        email: `user-producao-${suffix}@teste.com`,
        role: "OWNER",
      },
    });
    userId = user.id;

    const customer = await prisma.customer.create({
      data: { companyId, name: "Cliente Produção" },
    });
    customerId = customer.id;

    const product = await prisma.product.create({
      data: {
        companyId,
        sku: `PROD-${suffix}`,
        name: "Produto Produção",
        price: 10,
        unit: "UN",
      },
    });
    productId = product.id;

    await Promise.all([
      // Exatamente a meia-noite de Brasília: o limite pertence ao dia que começa.
      criarPedido({ createdAt: inicioDeHoje, total: 100 }),
      // Um milissegundo antes: último instante de ontem, fora da conta.
      criarPedido({
        createdAt: new Date(inicioDeHoje.getTime() - 1),
        total: 999,
      }),
      // Hoje, mas cancelado: mesma regra do faturamento do mês.
      criarPedido({ createdAt: new Date(), total: 777, status: "CANCELLED" }),
      // Hoje, mas excluído: soft-deleted não fatura.
      criarPedido({ createdAt: new Date(), total: 555, deletedAt: new Date() }),
      // Hoje, válido, com três itens — também serve ao teste do board.
      criarPedido({ createdAt: new Date(), total: 250.5, itens: 3 }),
      // Hoje, válido, mas de outra empresa.
      criarPedido({
        companyId: outraCompanyId,
        createdAt: new Date(),
        total: 4_000,
      }),
    ]);
  });

  afterAll(async () => {
    if (!prisma) return;

    const empresas = { in: [companyId, outraCompanyId] };
    await prisma.orderItem.deleteMany({ where: { companyId: empresas } });
    await prisma.order.deleteMany({ where: { companyId: empresas } });
    await prisma.product.deleteMany({ where: { companyId: empresas } });
    await prisma.customer.deleteMany({ where: { companyId: empresas } });
    await prisma.user.deleteMany({ where: { companyId: empresas } });
    await prisma.company.deleteMany({ where: { id: empresas } });
    await prisma.$disconnect();
  });

  it("conta apenas os pedidos válidos criados hoje", async () => {
    const stats = await repository!.getStats(companyId);

    // Os dois de hoje que valem: o da meia-noite e o de 250,50.
    expect(stats.todayOrderCount).toBe(2);
  });

  it("soma o faturamento do dia com a mesma regra do mês", async () => {
    const stats = await repository!.getStats(companyId);

    // 100 + 250,50. O de 999 é de ontem, o de 777 está cancelado, o de 555 foi
    // excluído e o de 4.000 é de outra empresa.
    expect(stats.todayRevenue).toBeCloseTo(350.5, 2);
  });

  it("inclui o pedido criado exatamente à meia-noite de Brasília", async () => {
    const stats = await repository!.getStats(companyId);

    // Se o corte usasse meia-noite UTC, este pedido cairia fora e o valor
    // seria 250,50 — três horas de expediente perdidas todo dia.
    expect(stats.todayRevenue).toBeGreaterThanOrEqual(100);
  });

  it("não deixa o dia contar mais do que o mês", async () => {
    const stats = await repository!.getStats(companyId);

    // O dia está sempre contido no mês; um recorte invertido apareceria aqui.
    expect(stats.monthRevenue).toBeGreaterThanOrEqual(stats.todayRevenue);
    expect(stats.monthOrderCount).toBeGreaterThanOrEqual(stats.todayOrderCount);
  });

  it("não enxerga o faturamento de outra empresa", async () => {
    const daVizinha = await repository!.getStats(outraCompanyId);

    expect(daVizinha.todayRevenue).toBe(4_000);
    expect(daVizinha.todayOrderCount).toBe(1);
  });

  // No mesmo describe porque depende dos mesmos pedidos: separá-lo faria o
  // afterAll acima apagar a empresa antes de ele rodar.
  it("o board traz quantos itens o pedido tem, sem trazer os itens", async () => {
    const pedidos = await repository!.listForKanban(companyId);
    const comTresItens = pedidos.find((pedido) => pedido._count.items === 3);

    expect(comTresItens).toBeDefined();
    // O payload do board não carrega a lista de itens: o cartão mostra quantos
    // são, e o drawer busca quais quando alguém pergunta.
    expect(comTresItens).not.toHaveProperty("items");
  });
});
