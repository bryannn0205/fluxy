import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import {
  assertValidOrderAmounts,
  buildOrderTotals,
  calculateOrderTotal,
} from "@/lib/order-totals";
import {
  derivePaymentStatus,
  isOrderOverdue,
  remainingAmount,
} from "@/lib/payment-status";

describe("cálculo do total do pedido", () => {
  const base = { subtotal: 100, deliveryFee: 0, surcharge: 0, discount: 0 };

  it("soma só o subtotal quando não há ajustes", () => {
    expect(calculateOrderTotal(base)).toBe(100);
  });

  it("desconta", () => {
    expect(calculateOrderTotal({ ...base, discount: 30 })).toBe(70);
  });

  it("soma taxa de entrega", () => {
    expect(calculateOrderTotal({ ...base, deliveryFee: 15 })).toBe(115);
  });

  it("soma acréscimo", () => {
    expect(calculateOrderTotal({ ...base, surcharge: 8 })).toBe(108);
  });

  it("combina os quatro na ordem certa", () => {
    // 100 + 15 + 8 - 30 = 93
    expect(
      calculateOrderTotal({ subtotal: 100, deliveryFee: 15, surcharge: 8, discount: 30 }),
    ).toBe(93);
  });

  it("buildOrderTotals devolve os componentes junto do total", () => {
    const totals = buildOrderTotals({ ...base, deliveryFee: 10, discount: 5 });
    expect(totals).toEqual({
      subtotal: 100,
      deliveryFee: 10,
      surcharge: 0,
      discount: 5,
      total: 105,
    });
  });

  describe("validação", () => {
    it("aceita desconto que cobre a entrega, desde que o total não fique negativo", () => {
      // Cortesia de frete: desconto maior que o subtotal seria erro, mas
      // cobrir subtotal + frete é uma decisão comercial legítima.
      expect(() =>
        assertValidOrderAmounts({
          subtotal: 100,
          deliveryFee: 20,
          surcharge: 0,
          discount: 120,
        }),
      ).not.toThrow();
    });

    it("recusa desconto que deixaria o total negativo", () => {
      expect(() => assertValidOrderAmounts({ ...base, discount: 150 })).toThrow(
        ValidationError,
      );
    });

    it("recusa taxa de entrega negativa", () => {
      expect(() => assertValidOrderAmounts({ ...base, deliveryFee: -1 })).toThrow(
        ValidationError,
      );
    });

    it("recusa acréscimo negativo", () => {
      expect(() => assertValidOrderAmounts({ ...base, surcharge: -1 })).toThrow(
        ValidationError,
      );
    });
  });
});

describe("derivação do status financeiro", () => {
  const pedido = { status: "PENDING" as const, total: 100 };

  it("PENDING quando nunca houve pagamento", () => {
    expect(
      derivePaymentStatus(pedido, { netPaid: 0, hasPayments: false, hasRefunds: false }),
    ).toBe("PENDING");
  });

  it("PARTIAL quando recebeu menos que o total", () => {
    expect(
      derivePaymentStatus(pedido, { netPaid: 40, hasPayments: true, hasRefunds: false }),
    ).toBe("PARTIAL");
  });

  it("PAID quando recebeu o total exato", () => {
    expect(
      derivePaymentStatus(pedido, { netPaid: 100, hasPayments: true, hasRefunds: false }),
    ).toBe("PAID");
  });

  // O que separa REFUNDED de PENDING é a história, não o saldo: os dois têm
  // zero. Sem olhar o ledger, o financeiro perderia a diferença entre "nunca
  // pagou" e "pagou e foi devolvido".
  it("REFUNDED quando pagou e foi estornado por inteiro", () => {
    expect(
      derivePaymentStatus(pedido, { netPaid: 0, hasPayments: true, hasRefunds: true }),
    ).toBe("REFUNDED");
  });

  it("estorno PARCIAL de pedido pago volta para PARTIAL, não REFUNDED", () => {
    expect(
      derivePaymentStatus(pedido, { netPaid: 60, hasPayments: true, hasRefunds: true }),
    ).toBe("PARTIAL");
  });

  it("CANCELLED vence qualquer outro estado", () => {
    expect(
      derivePaymentStatus(
        { status: "CANCELLED", total: 100 },
        { netPaid: 0, hasPayments: false, hasRefunds: false },
      ),
    ).toBe("CANCELLED");
  });
});

describe("valor restante", () => {
  it("é a diferença entre total e pago", () => {
    expect(remainingAmount({ total: 100, paidAmount: 30 })).toBe(70);
  });

  it("nunca é negativo", () => {
    expect(remainingAmount({ total: 100, paidAmount: 120 })).toBe(0);
  });
});

describe("atraso derivado", () => {
  const emAberto = { status: "PENDING" as const, total: 100, paidAmount: 0 };
  // 12h UTC de 10/03 = 09h de Brasília — bem dentro do dia.
  const agora = new Date("2026-03-10T12:00:00.000Z");

  it("vencimento nulo nunca atrasa", () => {
    expect(isOrderOverdue({ ...emAberto, dueDate: null }, agora)).toBe(false);
  });

  it("não atrasa no próprio dia do vencimento", () => {
    // Este é o caso que uma comparação ingênua erraria: dueDate é meia-noite
    // UTC de 10/03, e `dueDate < now` diria "atrasado" às 09h de Brasília do
    // dia combinado.
    expect(
      isOrderOverdue(
        { ...emAberto, dueDate: new Date("2026-03-10T00:00:00.000Z") },
        agora,
      ),
    ).toBe(false);
  });

  it("atrasa depois que o dia de vencimento termina em Brasília", () => {
    expect(
      isOrderOverdue(
        { ...emAberto, dueDate: new Date("2026-03-08T00:00:00.000Z") },
        agora,
      ),
    ).toBe(true);
  });

  it("pedido quitado não atrasa, mesmo vencido", () => {
    expect(
      isOrderOverdue(
        { ...emAberto, paidAmount: 100, dueDate: new Date("2026-03-01T00:00:00.000Z") },
        agora,
      ),
    ).toBe(false);
  });

  it("pedido cancelado não atrasa", () => {
    expect(
      isOrderOverdue(
        {
          ...emAberto,
          status: "CANCELLED",
          dueDate: new Date("2026-03-01T00:00:00.000Z"),
        },
        agora,
      ),
    ).toBe(false);
  });
});
