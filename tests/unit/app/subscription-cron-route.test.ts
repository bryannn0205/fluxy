import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Rota da revisão agendada.
 *
 * Duas coisas a travar. Primeiro, **ninguém entra sem o segredo** — a rota pode
 * cancelar assinaturas, e ela é a única superfície do ciclo de vida alcançável
 * por HTTP sem sessão. Segundo, **ela não conhece regra de plano**: se a decisão
 * de estado vazasse para cá, existiriam duas definições de "assinatura
 * cancelada".
 */

const CAMINHO_ROTA = join(
  process.cwd(),
  "app",
  "api",
  "cron",
  "subscriptions",
  "route.ts",
);

const SEGREDO = "segredo-sintetico-de-teste-1234";

const revisarAssinaturasDaPlataforma = vi.fn(async () => ({
  reviewed: 3,
  canceled: 1,
  reactivated: 1,
  cancelScheduled: 1,
  failed: 0,
}));

function montar(cronSecret: string | undefined) {
  vi.doMock("@/lib/env", () => ({
    env: { NODE_ENV: "test", CRON_SECRET: cronSecret },
  }));
  vi.doMock("@/services", () => ({
    subscriptionLifecycleService: { revisarAssinaturasDaPlataforma },
  }));
  vi.doMock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  }));
}

async function chamar(header: string | null) {
  const { GET } = await import("@/app/api/cron/subscriptions/route");
  const url = "https://exemplo.test/api/cron/subscriptions";

  // Requisições distintas, e não `headers: undefined`: com
  // `exactOptionalPropertyTypes`, passar a chave com `undefined` não é o mesmo
  // que omiti-la — e o caso "sem header" tem de ser a ausência de verdade.
  return header === null
    ? GET(new Request(url))
    : GET(new Request(url, { headers: { authorization: header } }));
}

beforeEach(() => {
  vi.resetModules();
  revisarAssinaturasDaPlataforma.mockClear();
});

afterEach(() => {
  for (const modulo of ["@/lib/env", "@/services", "@/lib/logger"]) {
    vi.doUnmock(modulo);
  }
});

describe("autorização", () => {
  it("aceita o header oficial da Vercel e devolve o resumo", async () => {
    montar(SEGREDO);

    const resposta = await chamar(`Bearer ${SEGREDO}`);

    expect(resposta.status).toBe(200);
    await expect(resposta.json()).resolves.toEqual({
      reviewed: 3,
      canceled: 1,
      reactivated: 1,
      cancelScheduled: 1,
      failed: 0,
    });
    expect(revisarAssinaturasDaPlataforma).toHaveBeenCalledOnce();
  });

  it.each([
    ["sem header", null],
    ["header vazio", ""],
    ["segredo errado", "Bearer outro-segredo-qualquer-1234"],
    ["sem o prefixo Bearer", SEGREDO],
    ["prefixo trocado", `Basic ${SEGREDO}`],
    ["caixa diferente no prefixo", `bearer ${SEGREDO}`],
    ["espaço a mais", `Bearer  ${SEGREDO}`],
  ])("recusa %s sem executar nada", async (_rotulo, header) => {
    montar(SEGREDO);

    const resposta = await chamar(header);

    expect(resposta.status).toBe(401);
    expect(revisarAssinaturasDaPlataforma).not.toHaveBeenCalled();
  });

  it("sem CRON_SECRET configurado, recusa TODA chamada", async () => {
    // Falha fechada: a alternativa transformaria uma variável esquecida num
    // endpoint público capaz de cancelar assinaturas.
    montar(undefined);

    for (const header of [null, "", `Bearer ${SEGREDO}`, "Bearer "]) {
      const resposta = await chamar(header);
      expect(resposta.status).toBe(401);
    }

    expect(revisarAssinaturasDaPlataforma).not.toHaveBeenCalled();
  });

  it("a resposta de recusa não revela o motivo", async () => {
    montar(SEGREDO);

    const corpo = (await (await chamar("Bearer errado")).json()) as Record<
      string,
      unknown
    >;

    expect(corpo).toEqual({ error: "Não autorizado" });
    expect(JSON.stringify(corpo)).not.toContain(SEGREDO);
  });
});

describe("falha do serviço", () => {
  it("devolve 500 sem vazar detalhe do erro", async () => {
    montar(SEGREDO);
    revisarAssinaturasDaPlataforma.mockRejectedValueOnce(
      new Error("connect ETIMEDOUT 10.0.0.1:5432"),
    );

    const resposta = await chamar(`Bearer ${SEGREDO}`);
    const corpo = (await resposta.json()) as Record<string, unknown>;

    expect(resposta.status).toBe(500);
    expect(corpo).toEqual({ error: "Falha na revisão" });
    expect(JSON.stringify(corpo)).not.toContain("ETIMEDOUT");
  });
});

describe("a rota não conhece regra de plano", () => {
  function fonte(): string {
    return readFileSync(CAMINHO_ROTA, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  it("delega ao serviço, sem decidir estado", () => {
    expect(fonte()).toContain("revisarAssinaturasDaPlataforma()");
  });

  it("não menciona estado de assinatura nem plano", () => {
    const codigo = fonte();

    for (const proibido of [
      "CANCELED",
      "PAST_DUE",
      "ACTIVE",
      "TRIALING",
      "cancelAtPeriodEnd",
      "effectiveAt",
      "planId",
      "trialEndsAt",
      "subscriptionStatus",
    ]) {
      expect(codigo).not.toContain(proibido);
    }
  });

  it("não fala com prisma nem com a ValidaPay direto", () => {
    const codigo = fonte();

    for (const proibido of [
      "prisma",
      "validaPayRequest",
      "getSubscription",
      "getCharge",
    ]) {
      expect(codigo).not.toContain(proibido);
    }
  });

  it("compara o segredo em tempo constante", () => {
    const codigo = fonte();

    // `===` sairia no primeiro byte diferente e o tempo de resposta revelaria
    // quantos bytes iniciais estão certos.
    expect(codigo).toContain("timingSafeEqual");
    expect(codigo).not.toMatch(/authHeader\s*!==|header\s*===\s*`Bearer/);
  });
});

describe("declaração do agendamento", () => {
  it("vercel.json aponta para esta rota, uma vez por dia", () => {
    const vercel = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons?: { path: string; schedule: string }[] };

    const cron = vercel.crons?.find((c) => c.path === "/api/cron/subscriptions");

    expect(cron).toBeDefined();
    // Diária: assinatura mensal/anual não exige mais, e o plano Hobby da Vercel
    // recusa o deploy de expressões mais frequentes que uma vez por dia.
    expect(cron!.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });
});
