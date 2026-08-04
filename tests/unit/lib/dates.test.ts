import { describe, expect, it } from "vitest";

import {
  isOverdue,
  overdueCutoff,
  startOfDaysAgoBrazil,
  startOfMonthBrazil,
  startOfNextMonthBrazil,
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

// A constante do módulo guarda a MAGNITUDE do offset (3), não o valor
// assinado (−3). Estes casos travam essa convenção: se alguém "corrigir" o
// sinal, todo corte de período desloca 6 horas e o bloco inteiro quebra.
//
// A pegadinha é a meia-noite UTC — às 00:00Z ainda são 21:00 do dia ANTERIOR
// em Brasília, e é aí que a cota mensal atribuiria o pedido ao mês errado.
describe("fronteiras do mês comercial", () => {
  /** Rótulo "YYYY-MM" do mês a que um início de mês corresponde. */
  function mesComercial(inicioDoMes: Date): string {
    return new Date(inicioDoMes.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
  }

  it.each([
    ["31/01/2026 23:59:59 BRT", "2026-02-01T02:59:59.000Z", "2026-01"],
    ["01/02/2026 00:00:00 BRT", "2026-02-01T03:00:00.000Z", "2026-02"],
    ["31/12/2026 23:59:59 BRT", "2027-01-01T02:59:59.000Z", "2026-12"],
    ["01/01/2027 00:00:00 BRT", "2027-01-01T03:00:00.000Z", "2027-01"],
    ["01/02 00:00 UTC (= 31/01 21:00 BRT)", "2026-02-01T00:00:00.000Z", "2026-01"],
    ["01/01 00:00 UTC (= 31/12 21:00 BRT)", "2027-01-01T00:00:00.000Z", "2026-12"],
  ])("%s pertence a %s", (_rotulo, instante, mesEsperado) => {
    expect(mesComercial(startOfMonthBrazil(new Date(instante)))).toBe(mesEsperado);
  });
});

describe("startOfNextMonthBrazil", () => {
  it("avança de dezembro para janeiro do ano seguinte", () => {
    const emDezembro = new Date("2026-12-15T15:00:00.000Z");

    expect(startOfMonthBrazil(emDezembro).toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(startOfNextMonthBrazil(emDezembro).toISOString()).toBe(
      "2027-01-01T03:00:00.000Z",
    );
  });

  it("avança de janeiro para fevereiro", () => {
    expect(
      startOfNextMonthBrazil(new Date("2026-01-10T12:00:00.000Z")).toISOString(),
    ).toBe("2026-02-01T03:00:00.000Z");
  });

  it.each([
    ["31/01 23:59:59 BRT", "2026-02-01T02:59:59.000Z"],
    ["01/02 00:00:00 BRT", "2026-02-01T03:00:00.000Z"],
    ["31/12 23:59:59 BRT", "2027-01-01T02:59:59.000Z"],
    ["01/01 00:00:00 BRT", "2027-01-01T03:00:00.000Z"],
    ["meia-noite UTC de 01/02", "2026-02-01T00:00:00.000Z"],
  ])("%s cai dentro do próprio intervalo [início, próximo)", (_rotulo, instante) => {
    const agora = new Date(instante);

    expect(agora.getTime()).toBeGreaterThanOrEqual(startOfMonthBrazil(agora).getTime());
    expect(agora.getTime()).toBeLessThan(startOfNextMonthBrazil(agora).getTime());
  });

  // Sem esta propriedade, um pedido criado na virada cairia em dois meses
  // (sobreposição) ou em nenhum (lacuna), e a cota mensal erraria a conta.
  it("24 meses consecutivos são contíguos, sem lacuna nem sobreposição", () => {
    for (let mes = 0; mes < 24; mes++) {
      const meioDoMes = new Date(Date.UTC(2026, mes, 15, 15, 0, 0));
      const proximo = startOfNextMonthBrazil(meioDoMes);

      // O início do mês seguinte, calculado a partir de um instante DENTRO
      // dele, tem de ser exatamente o mesmo instante.
      const inicioDoSeguinte = startOfMonthBrazil(new Date(proximo.getTime() + 1_000));

      expect(inicioDoSeguinte.toISOString()).toBe(proximo.toISOString());
    }
  });

  it("o instante imediatamente anterior ao próximo início ainda é do mês corrente", () => {
    const emJaneiro = new Date("2026-01-20T12:00:00.000Z");
    const ultimoInstante = new Date(startOfNextMonthBrazil(emJaneiro).getTime() - 1);

    expect(startOfMonthBrazil(ultimoInstante).toISOString()).toBe(
      "2026-01-01T03:00:00.000Z",
    );
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
