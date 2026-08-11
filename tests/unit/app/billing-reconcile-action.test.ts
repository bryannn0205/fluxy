import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/generated/prisma/client";

const CAMINHO_ACTION = join(
  process.cwd(),
  "app",
  "dashboard",
  "settings",
  "billing",
  "actions.ts",
);

const reconcilePending = vi.fn(async () => ({
  examined: 2,
  completed: 1,
  stillPending: 1,
  failed: 0,
}));

/** Sessão ausente: `requireCompany` redireciona, e o redirect LANÇA no Next. */
class RedirectError extends Error {
  constructor() {
    super("NEXT_REDIRECT");
  }
}

function mockarSessao(sessao: { companyId: string; role: Role } | null) {
  vi.doMock("@/lib/session", () => ({
    requireCompany: async () => {
      if (!sessao) throw new RedirectError();
      return { companyId: sessao.companyId, userId: "user_1", role: sessao.role };
    },
  }));
  vi.doMock("@/services", () => ({
    subscriptionReconciliationService: { reconcilePending },
  }));
}

beforeEach(() => {
  vi.resetModules();
  reconcilePending.mockClear();
});

afterEach(() => {
  vi.doUnmock("@/lib/session");
  vi.doUnmock("@/services");
});

describe("autenticação", () => {
  it("sem sessão é bloqueado antes de qualquer trabalho", async () => {
    mockarSessao(null);
    const { reconciliarContratacoesAction } =
      await import("@/app/dashboard/settings/billing/actions");

    await expect(reconciliarContratacoesAction()).rejects.toBeInstanceOf(RedirectError);
    expect(reconcilePending).not.toHaveBeenCalled();
  });
});

describe("permissão", () => {
  it.each<Role>(["ADMIN", "MANAGER", "OPERATOR", "FINANCE", "VIEWER"])(
    "%s não pode disparar reconciliação",
    async (role) => {
      mockarSessao({ companyId: "company_1", role });
      const { reconciliarContratacoesAction } =
        await import("@/app/dashboard/settings/billing/actions");

      const resultado = await reconciliarContratacoesAction();

      // Ação contratual é do dono — nem ADMIN assina pelo OWNER.
      expect(resultado.error).toBeDefined();
      expect(resultado.data).toBeUndefined();
      expect(reconcilePending).not.toHaveBeenCalled();
    },
  );

  it("OWNER executa e recebe o resumo", async () => {
    mockarSessao({ companyId: "company_1", role: "OWNER" });
    const { reconciliarContratacoesAction } =
      await import("@/app/dashboard/settings/billing/actions");

    const resultado = await reconciliarContratacoesAction();

    expect(resultado.error).toBeUndefined();
    expect(resultado.data).toEqual({
      examined: 2,
      completed: 1,
      stillPending: 1,
      failed: 0,
    });
  });
});

describe("escopo de tenant", () => {
  it("usa o companyId da SESSÃO", async () => {
    mockarSessao({ companyId: "company_da_sessao", role: "OWNER" });
    const { reconciliarContratacoesAction } =
      await import("@/app/dashboard/settings/billing/actions");

    await reconciliarContratacoesAction();

    expect(reconcilePending).toHaveBeenCalledWith({ companyId: "company_da_sessao" });
  });

  it("a action não aceita parâmetro algum", () => {
    const fonte = readFileSync(CAMINHO_ACTION, "utf8");

    // Um identificador de entrada seria mais uma superfície para apontar para
    // fora do próprio tenant. O companyId só pode vir da sessão.
    expect(fonte).toMatch(/reconciliarContratacoesAction\(\)/);
    expect(fonte).toContain("await requireCompany()");
  });

  it("não reimplementa confirmação nem consulta cobrança", () => {
    const fonte = readFileSync(CAMINHO_ACTION, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    for (const proibido of [
      "confirmarSeChargePago",
      "getCharge",
      "activateIfPending",
      "planId",
    ]) {
      expect(fonte).not.toContain(proibido);
    }
  });
});
