import { beforeEach, describe, expect, it, vi } from "vitest";

const validaPayRequest = vi.fn();

vi.mock("@/lib/validapay/client", () => ({ validaPayRequest }));

const { validaPaySubscriptions } = await import("@/lib/validapay/subscriptions");

/**
 * Derivação do snapshot de assinatura a partir da resposta REAL da ValidaPay.
 *
 * Os dois corpos abaixo são recortes fiéis do que a API devolveu em sandbox em
 * 17/08/2026: uma assinatura cancelada no painel e outra ativa, de controle.
 * Ficam aqui porque foi o contraste entre elas que revelou a armadilha —
 * `cancellation.effectiveAt` existe nas DUAS, e vale a data do próximo ciclo.
 *
 * Ler aquele campo sem exigir `cancelAtPeriodEnd` transformaria toda assinatura
 * saudável num cancelamento agendado para a data da próxima cobrança. É o teste
 * mais importante deste arquivo.
 */

/** Cancelada no painel: os três campos de cancelamento presentes. */
const CANCELADA = {
  subscriptionId: "sub_1786965610230_n6sleitaz",
  status: "ACTIVE",
  cancelAtPeriodEnd: true,
  cancelReason: "Cancelamento solicitado",
  cancelRequestedAt: "2026-08-17T12:29:56.466Z",
  cancellation: { immediate: false, effectiveAt: "2026-09-17T11:20:14.991Z" },
  currentCycleNumber: 1,
  nextCycleNumber: 2,
  billingCycles: [
    { cycleNumber: 1, cycle: { status: "PAID" } },
    { cycleNumber: 2, cycle: { status: "PENDING" } },
  ],
  metadata: { subscriptionCheckoutId: "cmsx50vw60001gwtvt7sbaq6p" },
};

/** Controle, ativa: sem os campos de cancelamento, MAS com `cancellation`. */
const ATIVA = {
  subscriptionId: "sub_1786965678423_welmx515s",
  status: "ACTIVE",
  cancellation: { immediate: false, effectiveAt: "2027-08-17T11:21:21.440Z" },
  currentCycleNumber: 1,
  nextCycleNumber: 2,
  billingCycles: [
    { cycleNumber: 1, cycle: { status: "PAID" } },
    { cycleNumber: 2, cycle: { status: "PENDING" } },
  ],
  metadata: { subscriptionCheckoutId: "cmsx52got0003t0tv6d8pl5ar" },
};

beforeEach(() => {
  validaPayRequest.mockReset();
});

async function ler(corpo: unknown) {
  validaPayRequest.mockResolvedValue(corpo);
  return validaPaySubscriptions.getSubscription("sub_qualquer");
}

describe("assinatura ativa de controle", () => {
  it("não é lida como cancelamento agendado", async () => {
    const snapshot = await ler(ATIVA);

    expect(snapshot.cancelamentoAgendado).toBe(false);
  });

  it("cancellation.effectiveAt NÃO vira data de cancelamento", async () => {
    // A armadilha: o campo existe e tem data, mas é a do próximo ciclo.
    const snapshot = await ler(ATIVA);

    expect(snapshot.cancelamentoEfetivoEm).toBeNull();
    expect(snapshot.cancelamentoImediato).toBe(false);
  });

  it("o ciclo corrente consta pago", async () => {
    expect((await ler(ATIVA)).cicloAtualPago).toBe(true);
  });
});

describe("assinatura cancelada no painel", () => {
  it("é lida como cancelamento agendado, apesar de status ACTIVE", async () => {
    const snapshot = await ler(CANCELADA);

    expect(snapshot.status).toBe("ACTIVE");
    expect(snapshot.cancelamentoAgendado).toBe(true);
  });

  it("carrega a data efetiva vinda da API", async () => {
    const snapshot = await ler(CANCELADA);

    expect(snapshot.cancelamentoEfetivoEm).toEqual(new Date("2026-09-17T11:20:14.991Z"));
    expect(snapshot.cancelamentoImediato).toBe(false);
  });

  it("preserva a metadata de correlação", async () => {
    const snapshot = await ler(CANCELADA);

    expect(snapshot.metadata).toEqual({
      subscriptionCheckoutId: "cmsx50vw60001gwtvt7sbaq6p",
    });
  });

  it("o ciclo corrente segue pago — o período foi comprado", async () => {
    expect((await ler(CANCELADA)).cicloAtualPago).toBe(true);
  });
});

describe("entradas hostis ou incompletas", () => {
  it("cancelAtPeriodEnd que não seja booleano verdadeiro é ignorado", async () => {
    for (const valor of ["true", 1, {}, [], "1", null]) {
      const snapshot = await ler({ ...ATIVA, cancelAtPeriodEnd: valor });
      expect(snapshot.cancelamentoAgendado).toBe(false);
      expect(snapshot.cancelamentoEfetivoEm).toBeNull();
    }
  });

  it("cancelamento sem data utilizável devolve data nula, não uma inventada", async () => {
    for (const cancellation of [null, {}, { effectiveAt: "nao-e-data" }, "x"]) {
      const snapshot = await ler({ ...CANCELADA, cancellation });
      expect(snapshot.cancelamentoAgendado).toBe(true);
      expect(snapshot.cancelamentoEfetivoEm).toBeNull();
    }
  });

  it("ciclo com status desconhecido não conta como pago", async () => {
    const snapshot = await ler({
      ...ATIVA,
      billingCycles: [{ cycleNumber: 1, cycle: { status: "SEI_LA" } }],
    });

    expect(snapshot.cicloAtualPago).toBe(false);
  });

  it("sem billingCycles não conta como pago", async () => {
    expect((await ler({ ...ATIVA, billingCycles: undefined })).cicloAtualPago).toBe(
      false,
    );
  });

  it("status ausente vira string vazia, não erro", async () => {
    const snapshot = await ler({ subscriptionId: "sub_x" });

    expect(snapshot.status).toBe("");
    expect(snapshot.cancelamentoAgendado).toBe(false);
    expect(snapshot.metadata).toEqual({});
  });
});
