import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/generated/prisma/client";

/**
 * Erros vêm do MESMO registro de módulos que a action usa.
 *
 * Com `vi.resetModules()` entre os testes, uma classe importada no topo do
 * arquivo é outra referência: o `instanceof` de `handleAction` não a
 * reconheceria, o erro cairia no ramo genérico e o teste passaria pelo motivo
 * errado.
 */
async function errosDoRegistroAtual() {
  const [erros, errosValidaPay] = await Promise.all([
    import("@/lib/errors"),
    import("@/lib/validapay/errors"),
  ]);
  return { ...erros, ...errosValidaPay };
}

const CAMINHO_ACTIONS = join(
  process.cwd(),
  "app",
  "dashboard",
  "settings",
  "billing",
  "actions.ts",
);

/** URL devolvida pela ValidaPay. O Fluxy nunca a monta — só a repassa. */
const URL_HOSPEDADA = "https://app.validapay.com.br/pagamento/cs_sintetico";

const iniciarCheckout = vi.fn();

class RedirectError extends Error {
  constructor() {
    super("NEXT_REDIRECT");
  }
}

function montarAmbiente(sessao: { companyId: string; role: Role } | null) {
  vi.doMock("@/lib/session", () => ({
    requireCompany: async () => {
      if (!sessao) throw new RedirectError();
      return { companyId: sessao.companyId, userId: "user_1", role: sessao.role };
    },
  }));
  vi.doMock("@/services", () => ({
    subscriptionCheckoutService: {
      iniciarCheckout,
    },
    subscriptionReconciliationService: { reconcilePending: vi.fn() },
  }));
}

async function carregarActions() {
  return import("@/app/dashboard/settings/billing/actions");
}

beforeEach(() => {
  vi.resetModules();
  iniciarCheckout.mockReset();
});

afterEach(() => {
  vi.doUnmock("@/lib/session");
  vi.doUnmock("@/services");
});

describe("iniciarCheckoutAction", () => {
  it("sem sessão é bloqueado antes de qualquer trabalho", async () => {
    montarAmbiente(null);
    const { iniciarCheckoutAction } = await carregarActions();

    await expect(
      iniciarCheckoutAction({ planId: "plan_pro", billingInterval: "MONTHLY" }),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(iniciarCheckout).not.toHaveBeenCalled();
  });

  it.each<Role>(["ADMIN", "MANAGER", "OPERATOR", "FINANCE", "VIEWER"])(
    "%s não pode contratar",
    async (role) => {
      montarAmbiente({ companyId: "company_1", role });
      const { iniciarCheckoutAction } = await carregarActions();

      const resultado = await iniciarCheckoutAction({
        planId: "plan_pro",
        billingInterval: "MONTHLY",
      });

      expect(resultado.error).toBeDefined();
      expect(iniciarCheckout).not.toHaveBeenCalled();
    },
  );

  it("OWNER inicia e recebe a URL do checkout hospedado", async () => {
    montarAmbiente({ companyId: "company_1", role: "OWNER" });
    iniciarCheckout.mockResolvedValue({
      checkoutId: "chk_1",
      url: URL_HOSPEDADA,
      status: "PENDING",
    });
    const { iniciarCheckoutAction } = await carregarActions();

    const resultado = await iniciarCheckoutAction({
      planId: "plan_pro",
      billingInterval: "MONTHLY",
    });

    expect(resultado.data?.status).toBe("PENDING");
    expect(resultado.data?.url).toBe(URL_HOSPEDADA);
  });

  it("input inválido é recusado pelo schema, sem chamar o service", async () => {
    montarAmbiente({ companyId: "company_1", role: "OWNER" });
    const { iniciarCheckoutAction } = await carregarActions();

    const resultado = await iniciarCheckoutAction({ billingInterval: "SEMANAL" });

    expect(resultado.error).toBeDefined();
    expect(iniciarCheckout).not.toHaveBeenCalled();
  });

  it("plano sem priceId vira mensagem amigável, não erro técnico", async () => {
    montarAmbiente({ companyId: "company_1", role: "OWNER" });

    const { ValidationError } = await errosDoRegistroAtual();
    iniciarCheckout.mockRejectedValue(
      new ValidationError({
        billingInterval: ["Este plano ainda não está disponível para contratação"],
      }),
    );
    const { iniciarCheckoutAction } = await carregarActions();

    const resultado = await iniciarCheckoutAction({
      planId: "plan_pro",
      billingInterval: "MONTHLY",
    });

    expect(resultado.error).toBeDefined();
    // Nada de código de gateway, status HTTP ou nome de endpoint na tela.
    expect(resultado.error).not.toMatch(/validapay|\/v1\/|priceId/i);
    expect(resultado.fields?.billingInterval?.[0]).toContain("não está disponível");
  });

  it("timeout na criação não vira sucesso", async () => {
    montarAmbiente({ companyId: "company_1", role: "OWNER" });
    const { ValidaPayTimeoutError } = await errosDoRegistroAtual();
    iniciarCheckout.mockRejectedValue(
      new ValidaPayTimeoutError("criar cobrança", 10_000),
    );
    const { iniciarCheckoutAction } = await carregarActions();

    const resultado = await iniciarCheckoutAction({
      planId: "plan_pro",
      billingInterval: "MONTHLY",
    });

    expect(resultado.data).toBeUndefined();
    expect(resultado.error).toBeDefined();
  });

  it("a empresa vai para o service a partir da SESSÃO", async () => {
    montarAmbiente({ companyId: "company_da_sessao", role: "OWNER" });
    iniciarCheckout.mockResolvedValue({
      checkoutId: "chk_1",
      url: URL_HOSPEDADA,
      status: "PENDING",
    });
    const { iniciarCheckoutAction } = await carregarActions();

    // O cliente tenta injetar outra empresa — o campo é ignorado.
    await iniciarCheckoutAction({
      planId: "plan_pro",
      billingInterval: "MONTHLY",
      companyId: "company_alheia",
    });

    const [input, company] = iniciarCheckout.mock.calls[0]!;
    // O service passou a receber só o essencial: identificador e papel.
    expect(company).toEqual({ id: "company_da_sessao", role: "OWNER" });
    expect(input).toEqual({ planId: "plan_pro", billingInterval: "MONTHLY" });
  });
});

describe("defesa estrutural", () => {
  it("nenhuma action aceita companyId do cliente", () => {
    const fonte = readFileSync(CAMINHO_ACTIONS, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    // Toda empresa usada vem de requireCompany(); nada lê companyId da entrada.
    expect(fonte).not.toMatch(/input\.companyId|\.companyId\s*\?\?/);
    // Uma chamada por action, seja qual for o número delas: o invariante é
    // "toda action tira a empresa da sessão", não um total fixo.
    const acoes = fonte.match(/export async function/g)?.length ?? 0;
    expect(acoes).toBeGreaterThan(0);
    expect(fonte.match(/requireCompany\(\)/g)?.length).toBe(acoes);
  });

  it("nenhuma action ativa plano por conta própria", () => {
    const fonte = readFileSync(CAMINHO_ACTIONS, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    for (const proibido of ["planId:", "subscriptionStatus", "activateIfPending"]) {
      expect(fonte).not.toContain(proibido);
    }
  });
});
