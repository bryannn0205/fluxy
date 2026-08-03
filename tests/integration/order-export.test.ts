import { randomUUID } from "crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EXPORT_BATCH_SIZE } from "@/lib/constants";
import { PrismaOrderRepository } from "@/repositories/implementations/PrismaOrderRepository";
import { PrismaCustomerRepository } from "@/repositories/implementations/PrismaCustomerRepository";
import { PrismaProductRepository } from "@/repositories/implementations/PrismaProductRepository";
import { PrismaNotificationRepository } from "@/repositories/implementations/PrismaNotificationRepository";
import { AuditService } from "@/services/AuditService";
import { OrderService } from "@/services/OrderService";
import { NotificationService } from "@/services/NotificationService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";

import { createTestPrismaClient } from "../helpers/prisma";
import { withRole, type ActingCompany } from "../helpers/company";

const prisma = createTestPrismaClient();

const orderService = prisma
  ? new OrderService(
      new PrismaOrderRepository(prisma),
      new PrismaCustomerRepository(prisma),
      new PrismaProductRepository(prisma),
      new AuditService(prisma),
      new SubscriptionGateService(),
      new NotificationService(new PrismaNotificationRepository(prisma)),
    )
  : null;

async function collect(chunks: AsyncGenerator<string>): Promise<string> {
  let csv = "";
  for await (const chunk of chunks) csv += chunk;
  return csv;
}

function makeCompany(label: string, suffix: string) {
  return prisma!.company.create({
    data: {
      name: `Export ${label} ${suffix}`,
      email: `export-${label}-${suffix}@teste.com`,
      trialEndsAt: new Date(Date.now() + 86_400_000),
      subscriptionStatus: "ACTIVE",
    },
  });
}

describe.skipIf(!prisma)("Exportação de pedidos em CSV", () => {
  let company: ActingCompany;
  let otherCompany: ActingCompany;
  let userId: string;
  let customerId: string;

  beforeAll(async () => {
    if (!prisma) return;
    const suffix = randomUUID().slice(0, 8);

    company = withRole(await makeCompany("A", suffix));
    otherCompany = withRole(await makeCompany("B", suffix));

    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        name: "Usuário Export",
        email: `user-export-${suffix}@teste.com`,
        role: "OWNER",
      },
    });
    userId = user.id;

    // Nome hostil de propósito: é o cenário que a proteção contra injeção de
    // fórmula existe para cobrir, e ele entra pelo cadastro de cliente.
    const customer = await prisma.customer.create({
      data: {
        companyId: company.id,
        name: '=HYPERLINK("http://mal.co")',
        document: "123",
      },
    });
    customerId = customer.id;

    await prisma.order.createMany({
      data: [
        {
          companyId: company.id,
          orderNumber: "0001",
          customerId,
          status: "PENDING",
          subtotal: 100,
          discount: 10,
          total: 90,
          createdById: userId,
        },
        {
          companyId: company.id,
          orderNumber: "0002",
          customerId,
          status: "CANCELLED",
          subtotal: 50,
          discount: 0,
          total: 50,
          createdById: userId,
        },
      ],
    });
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

  it("começa com BOM e cabeçalho, e usa ponto-e-vírgula", async () => {
    const csv = await collect(orderService!.streamOrdersCsv(company.id, {}));
    const [header] = csv.split("\r\n");

    expect(csv.startsWith("﻿")).toBe(true);
    expect(header).toContain("Número;Data;Cliente;Documento;Status");
  });

  it("neutraliza o nome de cliente que o Excel avaliaria como fórmula", async () => {
    const csv = await collect(orderService!.streamOrdersCsv(company.id, {}));

    // O apóstrofo antes do `=` é o que impede a avaliação. Sem ele, abrir a
    // planilha dispararia a fórmula na máquina de quem baixou.
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/;=HYPERLINK/);
  });

  it("formata valores com vírgula decimal, para o Excel pt-BR somar a coluna", async () => {
    const csv = await collect(
      orderService!.streamOrdersCsv(company.id, { status: "PENDING" }),
    );
    const linha = csv.split("\r\n").find((row) => row.startsWith("0001"));

    expect(linha).toContain("100,00");
    expect(linha).toContain("10,00");
    expect(linha).toContain("90,00");
  });

  it("respeita o filtro de status, para a planilha bater com a tela", async () => {
    const pendentes = await collect(
      orderService!.streamOrdersCsv(company.id, { status: "PENDING" }),
    );

    expect(pendentes).toContain("0001");
    expect(pendentes).not.toContain("0002");
  });

  it("não deixa pedido de outra empresa entrar na planilha", async () => {
    const otherCustomer = await prisma!.customer.create({
      data: { companyId: otherCompany.id, name: "Cliente Vizinho" },
    });
    await prisma!.order.create({
      data: {
        companyId: otherCompany.id,
        orderNumber: "9999",
        customerId: otherCustomer.id,
        status: "PENDING",
        subtotal: 7777,
        discount: 0,
        total: 7777,
        createdById: userId,
      },
    });

    const csv = await collect(orderService!.streamOrdersCsv(company.id, {}));

    expect(csv).not.toContain("9999");
    expect(csv).not.toContain("Cliente Vizinho");
    expect(csv).not.toContain("7777");
  });
});

describe.skipIf(!prisma)("Exportação além do tamanho do lote", () => {
  let company: ActingCompany;

  const TOTAL = EXPORT_BATCH_SIZE + 1;

  beforeAll(async () => {
    if (!prisma) return;
    const suffix = randomUUID().slice(0, 8);

    company = withRole(await makeCompany("lote", suffix));

    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        name: "Usuário Lote",
        email: `user-lote-${suffix}@teste.com`,
        role: "OWNER",
      },
    });
    const customer = await prisma.customer.create({
      data: { companyId: company.id, name: "Cliente Lote" },
    });

    // Todos com o mesmo `createdAt`: é o pior caso para o cursor. Se a
    // ordenação não desempatasse pelo id, a virada do lote repetiria ou
    // pularia linhas exatamente aqui.
    const createdAt = new Date("2026-07-01T15:00:00Z");

    await prisma.order.createMany({
      data: Array.from({ length: TOTAL }, (_, index) => ({
        companyId: company.id,
        orderNumber: String(index + 1).padStart(5, "0"),
        customerId: customer.id,
        status: "PENDING" as const,
        subtotal: 10,
        discount: 0,
        total: 10,
        createdById: user.id,
        createdAt,
      })),
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.order.deleteMany({ where: { companyId: company.id } });
    await prisma.customer.deleteMany({ where: { companyId: company.id } });
    await prisma.user.deleteMany({ where: { companyId: company.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
    await prisma.$disconnect();
  });

  it("emite cada pedido exatamente uma vez ao atravessar a virada do lote", async () => {
    const csv = await collect(orderService!.streamOrdersCsv(company.id, {}));
    const numbers = csv
      .split("\r\n")
      .slice(1)
      .filter(Boolean)
      .map((row) => row.split(";")[0]);

    expect(numbers).toHaveLength(TOTAL);
    expect(new Set(numbers).size).toBe(TOTAL);
  });
});
