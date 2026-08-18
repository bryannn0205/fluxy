import { describe, expect, it } from "vitest";

import { calcularIndicadores } from "@/app/dashboard/production/_components/indicadores";
import type { ClientKanbanOrder } from "@/types/orders";
import type { OrderPriority, OrderStatus } from "@/lib/generated/prisma/client";

// 18/08/2026, meio-dia em Brasília. Instante fixo: atraso depende de "hoje", e
// um teste preso ao relógio real passa hoje e falha em outubro.
const AGORA = new Date("2026-08-18T15:00:00Z");

function pedido(
  overrides: Partial<ClientKanbanOrder> & { status: OrderStatus },
): ClientKanbanOrder {
  return {
    id: crypto.randomUUID(),
    orderNumber: "0001",
    priority: "NORMAL" as OrderPriority,
    expectedDeliveryDate: null,
    total: null,
    itemCount: 1,
    createdAt: new Date("2026-08-10T12:00:00Z"),
    customer: { id: "cliente-1", name: "Cliente Teste" },
    ...overrides,
  };
}

// Convenção do projeto: data-calendário é meia-noite UTC do dia escolhido.
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("calcularIndicadores", () => {
  it("conta apenas pedidos em PROCESSING como 'em produção'", () => {
    const { emProducao } = calcularIndicadores(
      [
        pedido({ status: "PROCESSING" }),
        pedido({ status: "PROCESSING" }),
        pedido({ status: "PENDING" }),
        pedido({ status: "READY" }),
        pedido({ status: "COMPLETED" }),
      ],
      AGORA,
    );

    expect(emProducao).toBe(2);
  });

  it("conta como atrasado o pedido cuja previsão já venceu", () => {
    const { atrasados } = calcularIndicadores(
      [
        pedido({ status: "PENDING", expectedDeliveryDate: dia("2026-08-10") }),
        pedido({ status: "PROCESSING", expectedDeliveryDate: dia("2026-08-01") }),
        pedido({ status: "READY", expectedDeliveryDate: dia("2026-08-30") }),
      ],
      AGORA,
    );

    expect(atrasados).toBe(2);
  });

  it("não conta pedido entregue como atrasado, mesmo com previsão vencida", () => {
    const { atrasados } = calcularIndicadores(
      [pedido({ status: "COMPLETED", expectedDeliveryDate: dia("2026-07-01") })],
      AGORA,
    );

    expect(atrasados).toBe(0);
  });

  it("não conta pedido sem previsão de entrega como atrasado", () => {
    const { atrasados } = calcularIndicadores(
      [pedido({ status: "PENDING", expectedDeliveryDate: null })],
      AGORA,
    );

    expect(atrasados).toBe(0);
  });

  it("respeita a carência do fuso: vence no fim do dia de Brasília, não à meia-noite UTC", () => {
    // A previsão é 18/08 e "agora" é 18/08 ao meio-dia em Brasília — ainda no
    // prazo. Sem a carência de lib/dates, isto contaria como atrasado.
    const { atrasados } = calcularIndicadores(
      [pedido({ status: "PROCESSING", expectedDeliveryDate: dia("2026-08-18") })],
      AGORA,
    );

    expect(atrasados).toBe(0);
  });

  it("devolve zeros para um board vazio", () => {
    expect(calcularIndicadores([], AGORA)).toEqual({ emProducao: 0, atrasados: 0 });
  });
});
