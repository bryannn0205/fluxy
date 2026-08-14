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

const PIX = { emv: "emv-sintetico-de-teste", qrCodeImage: null };

const iniciarCheckout = vi.fn();
const consultarParaExibicao = vi.fn();
const garantirChargeCriado = vi.fn();
const exigirTentativaDaEmpresa = vi.fn();

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
      consultarParaExibicao,
      garantirChargeCriado,
      exigirTentativaDaEmpresa,
    },
    subscriptionReconciliationService: { reconcilePending: vi.fn() },
  }));
}

async function carregarActions() {
  return import("@/app/dashboard/settings/billing/actions");
}

beforeEach(() => {
  vi.resetModules();
  for (const espiao of [
    iniciarCheckout,
    consultarParaExibicao,
    garantirChargeCriado,
    exigirTentativaDaEmpresa,
  ]) {
    espiao.mockReset();
  }
  exigirTentativaDaEmpresa.mockResolvedValue(undefined);
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

  it("OWNER inicia e recebe o Pix para exibição", async () => {
    montarAmbiente({ companyId: "company_1", role: "OWNER" });
    iniciarCheckout.mockResolvedValue({
      checkoutId: "chk_1",
      chargeId: "cha_1",
      status: "PENDING",
      pix: PIX,
    });
    const { iniciarCheckoutAction } = await carregarActions();

    const resultado = await iniciarCheckoutAction({
      planId: "plan_pro",
      billingInterval: "MONTHLY",
    });

    expect(resultado.data?.status).toBe("PENDING");
    expect(resultado.data?.pix).toEqual(PIX);
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
      chargeId: "cha_1",
      status: "PENDING",
      pix: PIX,
    });
    const { iniciarCheckoutAction } = await carregarActions();

    // O cliente tenta injetar outra empresa — o campo é ignorado.
    await iniciarCheckoutAction({
      planId: "plan_pro",
      billingInterval: "MONTHLY",
      companyId: "company_alheia",
    });

    const [input, company] = iniciarCheckout.mock.calls[0]!;
    expect(company.companyId).toBe("company_da_sessao");
    expect(input).toEqual({ planId: "plan_pro", billingInterval: "MONTHLY" });
  });
});

describe("verificarStatusCheckoutAction", () => {
  it("sem sessão é bloqueado", async () => {
    montarAmbiente(null);
    const { verificarStatusCheckoutAction } = await carregarActions();

    await expect(verificarStatusCheckoutAction("chk_1")).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(consultarParaExibicao).not.toHaveBeenCalled();
  });

  it("consulta escopada pela empresa da sessão", async () => {
    montarAmbiente({ companyId: "company_1", role: "OWNER" });
    consultarParaExibicao.mockResolvedValue({
      checkoutId: "chk_1",
      chargeId: "cha_1",
      status: "PENDING",
      pix: PIX,
    });
    const { verificarStatusCheckoutAction } = await carregarActions();

    const resultado = await verificarStatusCheckoutAction("chk_1");

    expect(consultarParaExibicao).toHaveBeenCalledWith("chk_1", "company_1");
    expect(resultado.data?.status).toBe("PENDING");
  });

  it("PAID confirmado devolve COMPLETED", async () => {
    montarAmbiente({ companyId: "company_1", role: "OWNER" });
    consultarParaExibicao.mockResolvedValue({
      checkoutId: "chk_1",
      chargeId: "cha_1",
      status: "COMPLETED",
      pix: null,
    });
    const { verificarStatusCheckoutAction } = await carregarActions();

    const resultado = await verificarStatusCheckoutAction("chk_1");

    expect(resultado.data?.status).toBe("COMPLETED");
    // Cobrança paga não precisa mais de código para pagar.
    expect(resultado.data?.pix).toBeNull();
  });

  it("checkout de OUTRA empresa não é encontrado", async () => {
    montarAmbiente({ companyId: "company_1", role: "OWNER" });
    const { NotFoundError } = await errosDoRegistroAtual();
    consultarParaExibicao.mockRejectedValue(
      new NotFoundError("Tentativa de contratação"),
    );
    const { verificarStatusCheckoutAction } = await carregarActions();

    const resultado = await verificarStatusCheckoutAction("chk_da_empresa_b");

    expect(resultado.data).toBeUndefined();
    expect(resultado.error).toBeDefined();
    // O escopo foi aplicado na consulta, com a empresa da sessão.
    expect(consultarParaExibicao).toHaveBeenCalledWith("chk_da_empresa_b", "company_1");
  });

  it("id inválido é recusado sem chamar o service", async () => {
    montarAmbiente({ companyId: "company_1", role: "OWNER" });
    const { verificarStatusCheckoutAction } = await carregarActions();

    for (const invalido of ["", null, 42, undefined]) {
      const resultado = await verificarStatusCheckoutAction(invalido);
      expect(resultado.error).toBeDefined();
    }
    expect(consultarParaExibicao).not.toHaveBeenCalled();
  });
});

describe("recuperarCheckoutAction", () => {
  it("sem sessão é bloqueado", async () => {
    montarAmbiente(null);
    const { recuperarCheckoutAction } = await carregarActions();

    await expect(recuperarCheckoutAction("chk_1")).rejects.toBeInstanceOf(RedirectError);
    expect(garantirChargeCriado).not.toHaveBeenCalled();
  });

  it("reaproveita a MESMA tentativa — nunca cria outra", async () => {
    montarAmbiente({ companyId: "company_1", role: "OWNER" });
    garantirChargeCriado.mockResolvedValue({
      checkoutId: "chk_1",
      chargeId: "cha_1",
      status: "PENDING",
      pix: PIX,
    });
    const { recuperarCheckoutAction } = await carregarActions();

    const resultado = await recuperarCheckoutAction("chk_1");

    // O mesmo id entra e sai: mesmo externalId determinístico, mesmo chargeId.
    expect(garantirChargeCriado).toHaveBeenCalledWith("chk_1");
    expect(resultado.data?.checkoutId).toBe("chk_1");
    // Recuperar JAMAIS passa por iniciarCheckout, que abriria outra tentativa.
    expect(iniciarCheckout).not.toHaveBeenCalled();
  });

  it("valida o escopo ANTES de qualquer chamada externa", async () => {
    montarAmbiente({ companyId: "company_1", role: "OWNER" });
    const { NotFoundError } = await errosDoRegistroAtual();
    exigirTentativaDaEmpresa.mockRejectedValue(
      new NotFoundError("Tentativa de contratação"),
    );
    const { recuperarCheckoutAction } = await carregarActions();

    const resultado = await recuperarCheckoutAction("chk_da_empresa_b");

    expect(resultado.error).toBeDefined();
    expect(exigirTentativaDaEmpresa).toHaveBeenCalledWith(
      "chk_da_empresa_b",
      "company_1",
    );
    // Nenhuma requisição à ValidaPay por causa de um id alheio.
    expect(garantirChargeCriado).not.toHaveBeenCalled();
  });

  it.each<Role>(["ADMIN", "FINANCE", "VIEWER"])("%s não pode recuperar", async (role) => {
    montarAmbiente({ companyId: "company_1", role });
    const { recuperarCheckoutAction } = await carregarActions();

    const resultado = await recuperarCheckoutAction("chk_1");

    expect(resultado.error).toBeDefined();
    expect(exigirTentativaDaEmpresa).not.toHaveBeenCalled();
    expect(garantirChargeCriado).not.toHaveBeenCalled();
  });
});

describe("defesa estrutural", () => {
  it("nenhuma action aceita companyId do cliente", () => {
    const fonte = readFileSync(CAMINHO_ACTIONS, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    // Toda empresa usada vem de requireCompany(); nada lê companyId da entrada.
    expect(fonte).not.toMatch(/input\.companyId|\.companyId\s*\?\?/);
    expect(fonte.match(/requireCompany\(\)/g)?.length).toBe(4);
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
