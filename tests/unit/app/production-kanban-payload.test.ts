import { describe, expect, it } from "vitest";

import { toClientKanbanOrder } from "@/types/orders";
import type { KanbanOrder } from "@/types/orders";

/** Imita o Decimal do Prisma para `Number()` sem depender do runtime dele. */
const dec = (valor: number) =>
  ({ toString: () => String(valor) }) as unknown as KanbanOrder["total"];

function pedido(overrides: Partial<KanbanOrder> = {}): KanbanOrder {
  return {
    id: "pedido-1",
    orderNumber: "0042",
    status: "PROCESSING",
    priority: "HIGH",
    expectedDeliveryDate: new Date("2026-08-20T03:00:00Z"),
    total: dec(1_287.5),
    createdAt: new Date("2026-08-18T13:00:00Z"),
    customer: { id: "cliente-1", name: "Padaria Central" },
    _count: { items: 3 },
    ...overrides,
  } as KanbanOrder;
}

describe("toClientKanbanOrder — contagem de itens", () => {
  it("achata o _count do Prisma em itemCount", () => {
    expect(toClientKanbanOrder(pedido(), true).itemCount).toBe(3);
  });

  it("entrega a contagem também para quem não vê financeiro", () => {
    // Quantos itens o pedido tem não é informação de dinheiro: o operador que
    // separa a produção precisa dela.
    expect(toClientKanbanOrder(pedido(), false).itemCount).toBe(3);
  });

  it("não deixa a forma aninhada do ORM vazar para o cliente", () => {
    const cliente = toClientKanbanOrder(pedido(), true);

    expect(cliente).not.toHaveProperty("_count");
    expect(JSON.stringify(cliente)).not.toContain("_count");
  });

  it("nunca envia os itens em si, só quantos são", () => {
    // O board recebe a contagem; o detalhe é do drawer, sob demanda. Se um dia
    // alguém acrescentar `items` ao ORDER_KANBAN_SELECT, este teste avisa.
    const serializado = JSON.stringify(toClientKanbanOrder(pedido(), true));

    expect(serializado).not.toContain("productName");
    expect(serializado).not.toContain("unitPrice");
  });

  it("respeita um pedido de um item só", () => {
    expect(toClientKanbanOrder(pedido({ _count: { items: 1 } }), true).itemCount).toBe(1);
  });
});

describe("toClientKanbanOrder — redação financeira do board", () => {
  it("converte o Decimal para número quando há permissão", () => {
    expect(toClientKanbanOrder(pedido(), true).total).toBe(1287.5);
  });

  it("descarta o valor, em vez de zerá-lo, sem permissão", () => {
    const cliente = toClientKanbanOrder(pedido(), false);

    expect(cliente.total).toBeNull();
    expect(cliente.total).not.toBe(0);
    expect(JSON.stringify(cliente)).not.toContain("1287");
  });

  it("mantém os dados operacionais sem permissão financeira", () => {
    const cliente = toClientKanbanOrder(pedido(), false);

    expect(cliente).toMatchObject({
      orderNumber: "0042",
      status: "PROCESSING",
      priority: "HIGH",
      itemCount: 3,
    });
    expect(cliente.customer.name).toBe("Padaria Central");
    expect(cliente.expectedDeliveryDate).toEqual(new Date("2026-08-20T03:00:00Z"));
  });
});
