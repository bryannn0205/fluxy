import { describe, expect, it } from "vitest";

import {
  isOverdue,
  overdueCutoff,
  startOfDaysAgoBrazil,
  startOfMonthBrazil,
  toBrazilDateKey,
} from "@/lib/dates";

describe("isOverdue", () => {
  it("retorna false quando não há data de entrega", () => {
    expect(isOverdue(null, new Date("2026-08-02T15:00:00Z"))).toBe(false);
  });

  it("não considera atrasado ainda de manhã, no dia do vencimento (horário de Brasília)", () => {
    const dueDate = new Date("2026-08-02T00:00:00Z"); // "02/08" escolhido no formulário
    const now = new Date("2026-08-02T15:00:00Z"); // meio-dia em Brasília (UTC-3)
    expect(isOverdue(dueDate, now)).toBe(false);
  });

  it("não considera atrasado 1h antes da meia-noite local do dia seguinte", () => {
    const dueDate = new Date("2026-08-02T00:00:00Z");
    const now = new Date("2026-08-03T02:00:00Z"); // 23h do dia 02 em Brasília
    expect(isOverdue(dueDate, now)).toBe(false);
  });

  it("considera atrasado logo após a meia-noite local do dia seguinte ao vencimento", () => {
    const dueDate = new Date("2026-08-02T00:00:00Z");
    const now = new Date("2026-08-03T03:00:01Z"); // 00:00:01 do dia 03 em Brasília
    expect(isOverdue(dueDate, now)).toBe(true);
  });

  it("NÃO considera atrasado no instante em que a meia-noite UTC do vencimento bate (21h do dia anterior em Brasília)", () => {
    const dueDate = new Date("2026-08-02T00:00:00Z");
    const now = new Date("2026-08-02T00:00:00Z");
    expect(isOverdue(dueDate, now)).toBe(false);
  });
});

describe("overdueCutoff", () => {
  it("é 27h antes de `now`", () => {
    const now = new Date("2026-08-03T03:00:00Z");
    expect(overdueCutoff(now).toISOString()).toBe("2026-08-02T00:00:00.000Z");
  });
});

describe("startOfMonthBrazil", () => {
  it("retorna 1º dia do mês às 00:00 de Brasília (03:00 UTC) no meio do mês", () => {
    const now = new Date("2026-08-15T18:00:00Z");
    expect(startOfMonthBrazil(now).toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });

  it("ainda reconhece como julho quando faltam 2h para meia-noite UTC do dia 1º de agosto (23h de 31/07 em Brasília)", () => {
    const now = new Date("2026-08-01T02:00:00Z");
    expect(startOfMonthBrazil(now).toISOString()).toBe("2026-07-01T03:00:00.000Z");
  });

  it("já reconhece como agosto às 03:00 UTC do dia 1º (00:00 em Brasília)", () => {
    const now = new Date("2026-08-01T03:00:00Z");
    expect(startOfMonthBrazil(now).toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });
});

describe("startOfDaysAgoBrazil", () => {
  it("com 0 dias retorna o início de hoje em Brasília (03:00 UTC)", () => {
    const now = new Date("2026-08-03T18:00:00Z");
    expect(startOfDaysAgoBrazil(0, now).toISOString()).toBe("2026-08-03T03:00:00.000Z");
  });

  it("volta a quantidade pedida de dias", () => {
    const now = new Date("2026-08-03T18:00:00Z");
    expect(startOfDaysAgoBrazil(6, now).toISOString()).toBe("2026-07-28T03:00:00.000Z");
  });

  it("atravessa a virada de mês", () => {
    const now = new Date("2026-08-02T18:00:00Z");
    expect(startOfDaysAgoBrazil(3, now).toISOString()).toBe("2026-07-30T03:00:00.000Z");
  });

  it("ainda considera 03/08 quando em UTC já é 04/08 mas no Brasil são 22h de 03/08", () => {
    const now = new Date("2026-08-04T01:00:00Z");
    expect(startOfDaysAgoBrazil(0, now).toISOString()).toBe("2026-08-03T03:00:00.000Z");
  });
});

describe("toBrazilDateKey", () => {
  it("usa o dia de Brasília, não o de UTC, perto da virada", () => {
    expect(toBrazilDateKey(new Date("2026-08-04T01:00:00Z"))).toBe("2026-08-03");
  });

  it("vira o dia às 03:00 UTC (00:00 em Brasília)", () => {
    expect(toBrazilDateKey(new Date("2026-08-04T03:00:00Z"))).toBe("2026-08-04");
  });

  it("é o inverso de startOfDaysAgoBrazil", () => {
    const now = new Date("2026-08-03T18:00:00Z");
    expect(toBrazilDateKey(startOfDaysAgoBrazil(5, now))).toBe("2026-07-29");
  });
});
