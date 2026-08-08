import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CREDENCIAIS_FALSAS = {
  VALIDAPAY_CLIENT_ID: "id-de-teste",
  VALIDAPAY_CLIENT_SECRET: "segredo-de-teste-nunca-real",
  VALIDAPAY_SCOPE: "escopo-de-teste",
  VALIDAPAY_ENV: "sandbox" as const,
};

/**
 * `lib/env.ts` valida process.env na carga do módulo, então a configuração
 * precisa ser injetada por mock — não dá para mexer em process.env depois.
 * Cada teste importa os módulos por `await import` para pegar o mock vigente.
 */
function mockarEnv(sobrescritas: Record<string, unknown> = {}) {
  vi.doMock("@/lib/env", () => ({
    env: {
      NODE_ENV: "test",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      ...CREDENCIAIS_FALSAS,
      ...sobrescritas,
    },
  }));
}

function respostaDeToken(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Duplo de `fetch` que devolve uma Response NOVA a cada chamada.
 *
 * `mockResolvedValue(new Response(...))` devolveria sempre a mesma instância,
 * e o corpo de uma Response só pode ser lido uma vez — o segundo `fetch`
 * quebraria com "Body is unusable" por defeito do teste, não do código.
 */
function fetchQueRepete(corpo: unknown, status = 200) {
  return vi.fn(async () => respostaDeToken(corpo, status));
}

beforeEach(() => {
  vi.resetModules();
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/env");
  vi.useRealTimers();
});

describe("configuração", () => {
  it("escolhe os hosts de sandbox", async () => {
    mockarEnv();
    const { loadValidaPayConfig } = await import("@/lib/validapay/config");
    const config = loadValidaPayConfig();

    expect(config.environment).toBe("sandbox");
    expect(config.apiBaseUrl).toBe("https://sandbox.validapay.com.br");
    expect(config.tokenUrl).toBe("https://oauth2-sandbox.validapay.com.br/auth/token");
  });

  it("escolhe os hosts de produção quando pedido explicitamente", async () => {
    mockarEnv({ VALIDAPAY_ENV: "production" });
    const { loadValidaPayConfig } = await import("@/lib/validapay/config");
    const config = loadValidaPayConfig();

    expect(config.apiBaseUrl).toBe("https://api.validapay.com.br");
    expect(config.tokenUrl).toBe("https://oauth2.validapay.com.br/auth/token");
  });

  it("o host de OAuth é separado do host da API", async () => {
    mockarEnv();
    const { loadValidaPayConfig } = await import("@/lib/validapay/config");
    const config = loadValidaPayConfig();

    expect(new URL(config.tokenUrl).host).not.toBe(new URL(config.apiBaseUrl).host);
  });

  it("credencial ausente lança erro com os NOMES do que falta", async () => {
    mockarEnv({ VALIDAPAY_CLIENT_SECRET: undefined, VALIDAPAY_SCOPE: undefined });
    const { loadValidaPayConfig } = await import("@/lib/validapay/config");
    const { ValidaPayConfigError } = await import("@/lib/validapay/errors");

    expect(() => loadValidaPayConfig()).toThrow(ValidaPayConfigError);
    try {
      loadValidaPayConfig();
    } catch (erro) {
      expect((erro as Error).message).toContain("VALIDAPAY_CLIENT_SECRET");
      expect((erro as Error).message).toContain("VALIDAPAY_SCOPE");
      // Menciona o que falta, nunca o que existe.
      expect((erro as Error).message).not.toContain("id-de-teste");
    }
  });

  it("string vazia conta como ausente", async () => {
    mockarEnv({ VALIDAPAY_CLIENT_ID: "   " });
    const { loadValidaPayConfig, isValidaPayConfigured } =
      await import("@/lib/validapay/config");

    expect(isValidaPayConfigured()).toBe(false);
    expect(() => loadValidaPayConfig()).toThrow(/VALIDAPAY_CLIENT_ID/);
  });
});

describe("obtenção do token", () => {
  it("envia form-urlencoded com client_credentials, não JSON", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValue(respostaDeToken({ access_token: "t", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchFalso);

    const { getAccessToken } = await import("@/lib/validapay/token");
    await getAccessToken();

    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(url).toBe("https://oauth2-sandbox.validapay.com.br/auth/token");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.body).toBeInstanceOf(URLSearchParams);

    const corpo = init.body as URLSearchParams;
    expect(corpo.get("grant_type")).toBe("client_credentials");
    expect(corpo.get("scope")).toBe(CREDENCIAIS_FALSAS.VALIDAPAY_SCOPE);
  });

  it("reutiliza o token em chamadas seguintes", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValue(respostaDeToken({ access_token: "t", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchFalso);

    const { getAccessToken } = await import("@/lib/validapay/token");
    await getAccessToken();
    await getAccessToken();
    await getAccessToken();

    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("chamadas simultâneas disparam UM pedido só", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValue(respostaDeToken({ access_token: "t", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchFalso);

    const { getAccessToken } = await import("@/lib/validapay/token");
    await Promise.all(Array.from({ length: 10 }, () => getAccessToken()));

    // Sem cache da promessa, dez requisições numa instância fria pediriam
    // dez tokens.
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("renova antes de expirar, respeitando a margem", async () => {
    mockarEnv();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));

    const fetchFalso = fetchQueRepete({ access_token: "t", expires_in: 3600 });
    vi.stubGlobal("fetch", fetchFalso);

    const { getAccessToken } = await import("@/lib/validapay/token");
    await getAccessToken();

    // 3540s: exatamente na margem de 60s. Ainda não renovou.
    vi.setSystemTime(new Date("2026-08-07T12:58:59Z"));
    await getAccessToken();
    expect(fetchFalso).toHaveBeenCalledTimes(1);

    // Dentro da margem: renova ANTES de o token vencer de fato.
    vi.setSystemTime(new Date("2026-08-07T12:59:30Z"));
    await getAccessToken();
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("token curto não nasce vencido — a margem nunca passa da validade", async () => {
    mockarEnv();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));

    const fetchFalso = fetchQueRepete({ access_token: "t", expires_in: 30 });
    vi.stubGlobal("fetch", fetchFalso);

    const { getAccessToken } = await import("@/lib/validapay/token");
    await getAccessToken();

    // Com margem fixa de 60s, um token de 30s seria descartado no ato e cada
    // chamada pediria outro — laço de renovação.
    vi.setSystemTime(new Date("2026-08-07T12:00:10Z"));
    await getAccessToken();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("credencial recusada (401) não é repetida", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValue(respostaDeToken({ error: "invalid" }, 401));
    vi.stubGlobal("fetch", fetchFalso);

    const { getAccessToken } = await import("@/lib/validapay/token");
    const { ValidaPayAuthError } = await import("@/lib/validapay/errors");

    await expect(getAccessToken()).rejects.toBeInstanceOf(ValidaPayAuthError);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("falha de rede é repetida uma vez — pedir token é idempotente", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(respostaDeToken({ access_token: "t", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchFalso);

    const { getAccessToken } = await import("@/lib/validapay/token");
    await expect(getAccessToken()).resolves.toBe("t");
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("timeout vira erro tipado, não erro genérico", async () => {
    mockarEnv();
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));

    const { getAccessToken } = await import("@/lib/validapay/token");
    const { ValidaPayTimeoutError } = await import("@/lib/validapay/errors");

    await expect(getAccessToken()).rejects.toBeInstanceOf(ValidaPayTimeoutError);
  });

  it("resposta sem access_token é recusada", async () => {
    mockarEnv();
    vi.stubGlobal("fetch", fetchQueRepete({ expires_in: 3600 }));

    const { getAccessToken } = await import("@/lib/validapay/token");
    const { ValidaPayAuthError } = await import("@/lib/validapay/errors");

    await expect(getAccessToken()).rejects.toBeInstanceOf(ValidaPayAuthError);
  });

  it("resposta sem expires_in utilizável é recusada", async () => {
    mockarEnv();
    vi.stubGlobal("fetch", fetchQueRepete({ access_token: "t", expires_in: 0 }));

    const { getAccessToken } = await import("@/lib/validapay/token");
    const { ValidaPayAuthError } = await import("@/lib/validapay/errors");

    // expires_in ausente ou zero deixaria o token sem validade calculável.
    await expect(getAccessToken()).rejects.toBeInstanceOf(ValidaPayAuthError);
  });

  it("corpo malformado NÃO é repetido — repetir não conserta parsing", async () => {
    mockarEnv();
    const fetchFalso = fetchQueRepete({ sem: "token" });
    vi.stubGlobal("fetch", fetchFalso);

    const { getAccessToken } = await import("@/lib/validapay/token");
    await expect(getAccessToken()).rejects.toThrow();

    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});

describe("requisição autenticada", () => {
  it("manda o Bearer e o caminho na base correta", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaDeToken({ access_token: "abc", expires_in: 3600 }))
      .mockResolvedValueOnce(respostaDeToken({ ok: true }));
    vi.stubGlobal("fetch", fetchFalso);

    const { validaPayRequest } = await import("@/lib/validapay/client");
    await validaPayRequest({ path: "/v1/charges/xyz" });

    const [url, init] = fetchFalso.mock.calls[1]!;
    expect(url).toBe("https://sandbox.validapay.com.br/v1/charges/xyz");
    expect(init.headers.Authorization).toBe("Bearer abc");
    expect(init.method).toBe("GET");
  });

  it("401 invalida o token, renova e repete UMA vez", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaDeToken({ access_token: "velho", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(respostaDeToken({ access_token: "novo", expires_in: 3600 }))
      .mockResolvedValueOnce(respostaDeToken({ ok: true }));
    vi.stubGlobal("fetch", fetchFalso);

    const { validaPayRequest } = await import("@/lib/validapay/client");
    await expect(validaPayRequest({ path: "/v1/charges" })).resolves.toEqual({
      ok: true,
    });

    // A repetição usa o token novo, não o revogado.
    expect(fetchFalso.mock.calls[3]![1].headers.Authorization).toBe("Bearer novo");
  });

  it("401 duas vezes seguidas desiste", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaDeToken({ access_token: "a", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(respostaDeToken({ access_token: "b", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response("nao autorizado", { status: 401 }));
    vi.stubGlobal("fetch", fetchFalso);

    const { validaPayRequest } = await import("@/lib/validapay/client");
    const { ValidaPayRequestError } = await import("@/lib/validapay/errors");

    await expect(validaPayRequest({ path: "/v1/charges" })).rejects.toBeInstanceOf(
      ValidaPayRequestError,
    );
  });

  it("NÃO repete 5xx — repetir POST de cobrança pode cobrar duas vezes", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaDeToken({ access_token: "a", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response("erro interno", { status: 500 }));
    vi.stubGlobal("fetch", fetchFalso);

    const { validaPayRequest } = await import("@/lib/validapay/client");
    const { ValidaPayRequestError } = await import("@/lib/validapay/errors");

    await expect(
      validaPayRequest({ path: "/v1/charges", method: "POST", body: { valor: 1 } }),
    ).rejects.toBeInstanceOf(ValidaPayRequestError);

    // Token + uma tentativa. Nenhuma repetição.
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("corpo vira JSON e só aparece quando existe", async () => {
    mockarEnv();
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaDeToken({ access_token: "a", expires_in: 3600 }))
      .mockResolvedValueOnce(respostaDeToken({ ok: true }))
      .mockResolvedValueOnce(respostaDeToken({ ok: true }));
    vi.stubGlobal("fetch", fetchFalso);

    const { validaPayRequest } = await import("@/lib/validapay/client");

    await validaPayRequest({ path: "/v1/x", method: "POST", body: { a: 1 } });
    expect(fetchFalso.mock.calls[1]![1].body).toBe('{"a":1}');
    expect(fetchFalso.mock.calls[1]![1].headers["Content-Type"]).toBe("application/json");

    await validaPayRequest({ path: "/v1/y" });
    expect(fetchFalso.mock.calls[2]![1].body).toBeUndefined();
  });
});

describe("segredos não vazam", () => {
  it("o erro de resposta não carrega o corpo do pedido de token", async () => {
    mockarEnv();
    // A ValidaPay ecoa parte do enviado — e o enviado inclui o client_secret.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          respostaDeToken({ error: "invalid_client", sent: CREDENCIAIS_FALSAS }, 400),
        ),
    );

    const { getAccessToken } = await import("@/lib/validapay/token");

    try {
      await getAccessToken();
      expect.unreachable("deveria ter lançado");
    } catch (erro) {
      const serializado = JSON.stringify({
        message: (erro as Error).message,
        contexto: (erro as { context?: unknown }).context,
      });
      expect(serializado).not.toContain(CREDENCIAIS_FALSAS.VALIDAPAY_CLIENT_SECRET);
      expect(serializado).not.toContain(CREDENCIAIS_FALSAS.VALIDAPAY_CLIENT_ID);
    }
  });

  it("nenhuma variável da integração é NEXT_PUBLIC_", () => {
    const fonte = readFileSync(join(process.cwd(), "lib", "env.ts"), "utf8");

    expect(fonte).not.toMatch(/NEXT_PUBLIC_VALIDAPAY/);
    expect(fonte).toContain("VALIDAPAY_CLIENT_SECRET: z.string().optional()");
  });

  it("as URLs não são configuráveis por ambiente", () => {
    const fonte = readFileSync(join(process.cwd(), "lib", "env.ts"), "utf8");

    // Host em texto livre no ambiente permitiria credencial de produção
    // apontada para sandbox — e o erro só apareceria na primeira cobrança.
    expect(fonte).not.toContain("VALIDAPAY_API_URL");
    expect(fonte).not.toContain("VALIDAPAY_BASE_URL");
    expect(fonte).not.toContain("VALIDAPAY_OAUTH_URL");
  });

  it("o logger redige as chaves usadas por esta integração", async () => {
    const fonte = readFileSync(join(process.cwd(), "lib", "logger.ts"), "utf8");

    for (const chave of ["secret", "token", "authorization"]) {
      expect(fonte).toContain(`"${chave}"`);
    }
  });

  it("nenhum módulo da integração escreve em disco ou em cache externo", () => {
    for (const arquivo of ["token.ts", "client.ts", "config.ts"]) {
      const fonte = readFileSync(join(process.cwd(), "lib", "validapay", arquivo), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      for (const proibido of ["node:fs", "writeFile", "@/lib/redis", "localStorage"]) {
        expect(fonte).not.toContain(proibido);
      }
    }
  });
});

describe("a F1 não implementa negócio", () => {
  it("a superfície pública é só transporte", async () => {
    mockarEnv();
    const modulo = await import("@/lib/validapay");

    expect(Object.keys(modulo).sort()).toEqual(
      [
        "ValidaPayAuthError",
        "ValidaPayConfigError",
        "ValidaPayRequestError",
        "ValidaPayTimeoutError",
        "getAccessToken",
        "invalidateAccessToken",
        "isValidaPayConfigured",
        "validaPayRequest",
      ].sort(),
    );
  });

  it("nenhum módulo conhece cobrança, assinatura ou webhook", () => {
    for (const arquivo of ["token.ts", "client.ts", "config.ts", "index.ts"]) {
      const fonte = readFileSync(join(process.cwd(), "lib", "validapay", arquivo), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      for (const proibido of [
        "createCharge",
        "checkout-sessions",
        "subscriptions",
        "webhook",
      ]) {
        expect(fonte).not.toContain(proibido);
      }
    }
  });
});
