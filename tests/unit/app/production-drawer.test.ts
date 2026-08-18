import { describe, expect, it } from "vitest";

import {
  ROTULO_DE_AVANCO,
  proximaEtapa,
} from "@/app/dashboard/production/_components/etapas";
import { toClientOrderDetail } from "@/types/orders";
import type { OrderWithRelations } from "@/types/orders";
import type { OrderStatus } from "@/lib/generated/prisma/client";

/** Imita o Decimal do Prisma para `Number()` sem depender do runtime dele. */
const dec = (valor: number) =>
  ({ toString: () => String(valor) }) as unknown as OrderWithRelations["total"];

function pedido(overrides: Partial<OrderWithRelations> = {}): OrderWithRelations {
  return {
    id: "pedido-1",
    companyId: "empresa-1",
    orderNumber: "0001",
    customerId: "cliente-1",
    status: "PENDING",
    priority: "NORMAL",
    subtotal: dec(100),
    discount: dec(10),
    deliveryFee: dec(5),
    surcharge: dec(2),
    total: dec(97),
    paidAmount: dec(0),
    paymentStatus: "PENDING",
    paymentMethod: "PIX",
    notes: "Entregar pela manhã",
    dueDate: null,
    expectedDeliveryDate: null,
    createdById: "user-1",
    createdAt: new Date("2026-08-10T12:00:00Z"),
    updatedAt: new Date("2026-08-10T12:00:00Z"),
    deletedAt: null,
    customer: {
      id: "cliente-1",
      companyId: "empresa-1",
      name: "Ana Silva",
      email: "ana@exemplo.com",
      phone: "11999999999",
      document: "11144477735",
      // Sem dígitos de propósito: o teste de vazamento procura os valores como
      // substring do payload, e um número de porta que coincida com um preço
      // faria o teste falhar sem haver vazamento nenhum.
      address: "Rua das Flores, sem número",
      notes: "cliente antigo",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    createdBy: { id: "user-1", name: "Admin Demo" },
    items: [
      {
        id: "item-1",
        orderId: "pedido-1",
        companyId: "empresa-1",
        productId: "produto-1",
        productName: "Sorvete de Chocolate 1L",
        unitPrice: dec(24.9),
        quantity: 2,
        total: dec(49.8),
        createdAt: new Date(),
      },
    ],
    attachments: [],
    auditLogs: [
      {
        id: "log-1",
        companyId: "empresa-1",
        userId: "user-1",
        action: "CREATE",
        resource: "order",
        resourceId: "pedido-1",
        changes: null,
        ip: "203.0.113.10",
        orderId: "pedido-1",
        createdAt: new Date("2026-08-10T12:00:00Z"),
        user: { id: "user-1", name: "Admin Demo" },
      },
    ],
    ...overrides,
  } as OrderWithRelations;
}

describe("toClientOrderDetail — redação financeira", () => {
  it("entrega os valores para quem pode ver financeiro", () => {
    const resultado = toClientOrderDetail(pedido(), true);

    expect(resultado.financials).toEqual({
      subtotal: 100,
      discount: 10,
      deliveryFee: 5,
      surcharge: 2,
      total: 97,
      paidAmount: 0,
      paymentStatus: "PENDING",
      paymentMethod: "PIX",
    });
    expect(resultado.items[0]).toMatchObject({ unitPrice: 24.9, total: 49.8 });
  });

  it("não entrega nenhum valor para quem não pode ver financeiro", () => {
    const resultado = toClientOrderDetail(pedido(), false);

    expect(resultado.financials).toBeNull();
    expect(resultado.items[0]).toMatchObject({ unitPrice: null, total: null });
  });

  it("não deixa nenhum valor monetário no objeto serializado quando redigido", () => {
    // O teste que interessa: o número não pode sobrar em lugar nenhum da
    // árvore, nem numa chave que a tela não lê. Serializar e procurar é o mais
    // próximo do que o navegador receberia.
    const serializado = JSON.stringify(toClientOrderDetail(pedido(), false));

    for (const valor of ["100", "97", "24.9", "49.8", "PIX"]) {
      expect(serializado).not.toContain(valor);
    }
  });

  it("mantém os dados operacionais mesmo sem permissão financeira", () => {
    const resultado = toClientOrderDetail(pedido(), false);

    expect(resultado.customer.name).toBe("Ana Silva");
    expect(resultado.items[0]?.productName).toBe("Sorvete de Chocolate 1L");
    expect(resultado.items[0]?.quantity).toBe(2);
    expect(resultado.createdBy?.name).toBe("Admin Demo");
    expect(resultado.notes).toBe("Entregar pela manhã");
  });

  it("nunca envia o IP registrado na auditoria", () => {
    const serializado = JSON.stringify(toClientOrderDetail(pedido(), true));

    expect(serializado).not.toContain("203.0.113.10");
    expect(serializado).not.toContain("ip");
  });

  it("trata campos ausentes do cliente sem quebrar", () => {
    const semDados = pedido({
      notes: null,
      customer: {
        ...pedido().customer,
        document: null,
        phone: null,
        email: null,
        address: null,
      },
    });

    const resultado = toClientOrderDetail(semDados, true);

    expect(resultado.customer).toMatchObject({
      document: null,
      phone: null,
      email: null,
      address: null,
    });
    expect(resultado.notes).toBeNull();
  });

  it("converte a auditoria para o formato da linha do tempo", () => {
    const resultado = toClientOrderDetail(pedido(), true);

    expect(resultado.activities).toHaveLength(1);
    expect(resultado.activities[0]).toMatchObject({
      id: "log-1",
      action: "CREATE",
      user: { name: "Admin Demo" },
    });
  });
});

describe("proximaEtapa — avanço respeita as transições reais", () => {
  it.each([
    ["PENDING", "PROCESSING"],
    ["PROCESSING", "READY"],
    ["READY", "COMPLETED"],
  ] as const)("de %s avança para %s", (origem, destino) => {
    expect(proximaEtapa(origem)).toBe(destino);
  });

  it("não oferece avanço a partir de COMPLETED", () => {
    expect(proximaEtapa("COMPLETED")).toBeNull();
  });

  it("não oferece avanço a partir de CANCELLED", () => {
    expect(proximaEtapa("CANCELLED")).toBeNull();
  });

  it("nunca sugere cancelar como se fosse avançar", () => {
    const etapas: OrderStatus[] = ["PENDING", "PROCESSING", "READY"];
    for (const etapa of etapas) {
      expect(proximaEtapa(etapa)).not.toBe("CANCELLED");
    }
  });

  it("nunca pula uma etapa", () => {
    // O destino de PENDING não pode ser READY nem COMPLETED.
    expect(proximaEtapa("PENDING")).not.toBe("READY");
    expect(proximaEtapa("PENDING")).not.toBe("COMPLETED");
    expect(proximaEtapa("PROCESSING")).not.toBe("COMPLETED");
  });

  it("tem rótulo para toda etapa alcançável por avanço", () => {
    for (const origem of ["PENDING", "PROCESSING", "READY"] as const) {
      const destino = proximaEtapa(origem);
      expect(destino).not.toBeNull();
      expect(ROTULO_DE_AVANCO[destino!]).toBeTruthy();
    }
  });
});
