import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const CLIENTE = {
  name: "Empresa Teste",
  email: "empresa@teste.com",
  documentNumber: "12345678000199",
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/env");
});

describe("criação de cobrança", () => {
  it("usa POST /v1/charges com paymentMethod pix e items[]", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(json(TOKEN))
      .mockResolvedValueOnce(json({ chargeId: "cha_1", customerId: "cus_1" }));
    vi.stubGlobal("fetch", fetchFalso);

    const { validaPayCharges } = await import("@/lib/validapay/charges");
    const resultado = await validaPayCharges.createPixCharge({
      externalId: "fluxy-checkout-abc",
      priceId: "price_1",
      customer: CLIENTE,
      metadata: { subscriptionCheckoutId: "abc" },
    });

    const [url, init] = fetchFalso.mock.calls[1]!;
    expect(url).toBe("https://sandbox.validapay.com.br/v1/charges");
    expect(init.method).toBe("POST");

    const corpo = JSON.parse(init.body as string);
    expect(corpo.paymentMethod).toBe("pix");
    expect(corpo.externalId).toBe("fluxy-checkout-abc");
    expect(corpo.items).toEqual([{ priceId: "price_1", quantity: 1 }]);
    // Propagado para a assinatura — é a correlação de um webhook sem chargeId.
    expect(corpo.metadata).toEqual({ subscriptionCheckoutId: "abc" });

    expect(resultado).toEqual({
      chargeId: "cha_1",
      customerId: "cus_1",
      duplicated: false,
      // Resposta sem bloco `pix`: nada a exibir, e nada inventado no lugar.
      pix: null,
    });
  });

  it("expõe o Pix da criação para exibição", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(json(TOKEN))
      .mockResolvedValueOnce(
        json({
          chargeId: "cha_1",
          customerId: "cus_1",
          pix: {
            emv: "emv-sintetico-de-teste",
            qrCode: "data:image/png;base64,iVBORw0=",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchFalso);

    const { validaPayCharges } = await import("@/lib/validapay/charges");
    const resultado = await validaPayCharges.createPixCharge({
      externalId: "fluxy-checkout-abc",
      priceId: "price_1",
      customer: CLIENTE,
      metadata: { subscriptionCheckoutId: "abc" },
    });

    expect(resultado.pix).toEqual({
      emv: "emv-sintetico-de-teste",
      qrCodeImage: "data:image/png;base64,iVBORw0=",
    });
  });

  it("NÃO chama POST /v1/subscriptions — não é rota de criação documentada", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(json(TOKEN))
      .mockResolvedValueOnce(json({ chargeId: "cha_1" }));
    vi.stubGlobal("fetch", fetchFalso);

    const { validaPayCharges } = await import("@/lib/validapay/charges");
    await validaPayCharges.createPixCharge({
      externalId: "e",
      priceId: "p",
      customer: CLIENTE,
      metadata: {},
    });

    for (const [url] of fetchFalso.mock.calls) {
      expect(String(url)).not.toContain("/v1/subscriptions");
    }
  });

  it("409 DUPLICATE_CHARGE devolve o chargeId original como recuperação", async () => {
    mockarEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(TOKEN))
        .mockResolvedValueOnce(
          json(
            {
              error: {
                message: "Cobrança duplicada",
                code: "DUPLICATE_CHARGE",
                details: { chargeId: "cha_original" },
              },
            },
            409,
          ),
        ),
    );

    const { validaPayCharges } = await import("@/lib/validapay/charges");
    const resultado = await validaPayCharges.createPixCharge({
      externalId: "e",
      priceId: "p",
      customer: CLIENTE,
      metadata: {},
    });

    // 200 e 409 são equivalentes para recuperação: o que importa é convergir
    // no mesmo chargeId, nunca abrir uma segunda cobrança.
    expect(resultado.chargeId).toBe("cha_original");
    expect(resultado.duplicated).toBe(true);
    // A resposta de ERRO não carrega o Pix — quem precisa exibir consulta a
    // cobrança original. Inventar um código aqui seria pior que devolver null.
    expect(resultado.pix).toBeNull();
  });

  it("409 sem chargeId legível sobe como erro — não inventa identificador", async () => {
    mockarEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(TOKEN))
        .mockResolvedValueOnce(new Response("indisponível", { status: 409 })),
    );

    const { validaPayCharges } = await import("@/lib/validapay/charges");
    const { ValidaPayRequestError } = await import("@/lib/validapay/errors");

    await expect(
      validaPayCharges.createPixCharge({
        externalId: "e",
        priceId: "p",
        customer: CLIENTE,
        metadata: {},
      }),
    ).rejects.toBeInstanceOf(ValidaPayRequestError);
  });

  it("200 sem chargeId é recusado — sem identificador não há como confirmar", async () => {
    mockarEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(TOKEN))
        .mockResolvedValueOnce(json({ success: true })),
    );

    const { validaPayCharges } = await import("@/lib/validapay/charges");
    const { ValidaPayRequestError } = await import("@/lib/validapay/errors");

    await expect(
      validaPayCharges.createPixCharge({
        externalId: "e",
        priceId: "p",
        customer: CLIENTE,
        metadata: {},
      }),
    ).rejects.toBeInstanceOf(ValidaPayRequestError);
  });
});

describe("consulta de cobrança", () => {
  it("PAID marca paid e extrai subscriptionId e paymentId", async () => {
    mockarEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(TOKEN))
        .mockResolvedValueOnce(
          json({
            chargeId: "cha_1",
            status: "PAID",
            subscriptionId: "sub_1",
            endToEndId: "E123",
            paidAt: "2026-08-10T18:34:06.981Z",
          }),
        ),
    );

    const { validaPayCharges } = await import("@/lib/validapay/charges");
    const cobranca = await validaPayCharges.getCharge("cha_1");

    expect(cobranca.paid).toBe(true);
    expect(cobranca.subscriptionId).toBe("sub_1");
    // A consulta chama de endToEndId o que o webhook chama de paymentId.
    expect(cobranca.paymentId).toBe("E123");
    expect(cobranca.paidAt?.toISOString()).toBe("2026-08-10T18:34:06.981Z");
  });

  it("expõe o Pix da consulta, sob qualquer um dos nomes da API", async () => {
    mockarEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(TOKEN))
        .mockResolvedValueOnce(
          json({ chargeId: "cha_1", status: "PENDING", emvQrCode: "emv-do-topo" }),
        ),
    );

    const { validaPayCharges } = await import("@/lib/validapay/charges");

    // É por aqui que a recuperação por 409 recupera o código para exibir.
    expect((await validaPayCharges.getCharge("cha_1")).pix).toEqual({
      emv: "emv-do-topo",
      qrCodeImage: null,
    });
  });

  it("aceita o Pix aninhado em paymentDetails", async () => {
    mockarEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(TOKEN))
        .mockResolvedValueOnce(
          json({
            chargeId: "cha_1",
            status: "PENDING",
            paymentDetails: { emvQrCode: "emv-aninhado" },
          }),
        ),
    );

    const { validaPayCharges } = await import("@/lib/validapay/charges");

    expect((await validaPayCharges.getCharge("cha_1")).pix?.emv).toBe("emv-aninhado");
  });

  it("PENDING não é pago", async () => {
    mockarEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(TOKEN))
        .mockResolvedValueOnce(json({ chargeId: "cha_1", status: "PENDING" })),
    );

    const { validaPayCharges } = await import("@/lib/validapay/charges");
    expect((await validaPayCharges.getCharge("cha_1")).paid).toBe(false);
  });

  it("PROCESSING não é pago — é a resposta do simulador antes de processar", async () => {
    mockarEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(TOKEN))
        .mockResolvedValueOnce(json({ chargeId: "cha_1", status: "PROCESSING" })),
    );

    const { validaPayCharges } = await import("@/lib/validapay/charges");
    const cobranca = await validaPayCharges.getCharge("cha_1");

    expect(cobranca.paid).toBe(false);
    expect(cobranca.status).toBe("PROCESSING");
  });

  it("status desconhecido é legível, não rejeitado", async () => {
    mockarEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(TOKEN))
        .mockResolvedValueOnce(json({ chargeId: "cha_1", status: "ALGO_NOVO" })),
    );

    const { validaPayCharges } = await import("@/lib/validapay/charges");
    const cobranca = await validaPayCharges.getCharge("cha_1");

    expect(cobranca.status).toBe("ALGO_NOVO");
    expect(cobranca.paid).toBe(false);
  });

  it("lê o subscriptionId aninhado quando não vem na raiz", async () => {
    mockarEnv();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(TOKEN))
        .mockResolvedValueOnce(
          json({
            chargeId: "cha_1",
            status: "PAID",
            subscription: { subscriptionId: "sub_aninhado" },
          }),
        ),
    );

    const { validaPayCharges } = await import("@/lib/validapay/charges");
    expect((await validaPayCharges.getCharge("cha_1")).subscriptionId).toBe(
      "sub_aninhado",
    );
  });
});
