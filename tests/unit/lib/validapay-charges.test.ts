import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /v1/charges/:id` — a única prova de pagamento do Fluxy.
 *
 * A criação de cobrança saiu deste módulo quando a contratação passou ao
 * checkout hospedado: quem abre a cobrança é a ValidaPay, dentro da página
 * dela. O que sobrou é a leitura, e ela carrega toda a decisão de ativar.
 *
 * O teste que mais importa é o do status desconhecido: `paid` sai de uma
 * comparação POSITIVA com `"PAID"`, nunca de "não é um dos que eu conheço".
 */

const CREDENCIAIS_FALSAS = {
  VALIDAPAY_CLIENT_ID: "id-de-teste",
  VALIDAPAY_CLIENT_SECRET: "segredo-de-teste-nunca-real",
  VALIDAPAY_SCOPE: "escopo-de-teste",
  VALIDAPAY_ENV: "sandbox" as const,
};

function mockarEnv() {
  vi.doMock("@/lib/env", () => ({
    env: {
      NODE_ENV: "test",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      ...CREDENCIAIS_FALSAS,
    },
  }));
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TOKEN = { access_token: "t", expires_in: 3600 };

/** Primeira resposta é o token OAuth; a segunda, a consulta. */
function responder(corpoDaConsulta: unknown) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json(TOKEN))
      .mockResolvedValueOnce(json(corpoDaConsulta)),
  );
}

async function consultar(corpo: unknown) {
  mockarEnv();
  responder(corpo);

  const { validaPayCharges } = await import("@/lib/validapay/charges");
  return validaPayCharges.getCharge("cha_1");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/env");
});

describe("consulta de cobrança", () => {
  it("PAID marca paid e extrai subscriptionId e paymentId", async () => {
    const snapshot = await consultar({
      chargeId: "cha_1",
      status: "PAID",
      subscriptionId: "sub_1",
      paymentId: "pay_1",
      paidAt: "2026-08-17T10:00:00.000Z",
    });

    expect(snapshot.paid).toBe(true);
    expect(snapshot.status).toBe("PAID");
    expect(snapshot.subscriptionId).toBe("sub_1");
    expect(snapshot.paymentId).toBe("pay_1");
    expect(snapshot.paidAt).toEqual(new Date("2026-08-17T10:00:00.000Z"));
  });

  it("PENDING não é pago", async () => {
    expect((await consultar({ chargeId: "cha_1", status: "PENDING" })).paid).toBe(false);
  });

  it("PROCESSING não é pago — é a resposta do simulador antes de processar", async () => {
    expect((await consultar({ chargeId: "cha_1", status: "PROCESSING" })).paid).toBe(
      false,
    );
  });

  it("status desconhecido é legível e NÃO é pago", async () => {
    // Comparação positiva: um status que a ValidaPay introduza amanhã não pode
    // virar pagamento por não estar numa lista de recusados.
    const snapshot = await consultar({ chargeId: "cha_1", status: "SEI_LA_O_QUE" });

    expect(snapshot.status).toBe("SEI_LA_O_QUE");
    expect(snapshot.paid).toBe(false);
  });

  it("lê o subscriptionId aninhado quando não vem na raiz", async () => {
    const snapshot = await consultar({
      chargeId: "cha_1",
      status: "PAID",
      subscription: { subscriptionId: "sub_aninhado" },
    });

    expect(snapshot.subscriptionId).toBe("sub_aninhado");
  });

  it("aceita endToEndId no lugar de paymentId", async () => {
    const snapshot = await consultar({
      chargeId: "cha_1",
      status: "PAID",
      endToEndId: "E123",
    });

    expect(snapshot.paymentId).toBe("E123");
  });

  it("campos ausentes não viram erro", async () => {
    const snapshot = await consultar({ chargeId: "cha_1" });

    expect(snapshot.status).toBe("");
    expect(snapshot.paid).toBe(false);
    expect(snapshot.subscriptionId).toBeNull();
    expect(snapshot.paidAt).toBeNull();
  });

  it("não expõe criação de cobrança — o Fluxy não abre cobrança", async () => {
    mockarEnv();
    const { validaPayCharges } = await import("@/lib/validapay/charges");

    expect(Object.keys(validaPayCharges)).toEqual(["getCharge"]);
  });
});
