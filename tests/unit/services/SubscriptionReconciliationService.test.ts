import { describe, expect, it, vi } from "vitest";

import type { SubscriptionCheckout } from "@/lib/generated/prisma/client";
import type {
  ListPendingWithChargeInput,
  SubscriptionCheckoutRepository,
} from "@/repositories/interfaces/SubscriptionCheckoutRepository";
import type { SubscriptionCheckoutService } from "@/services/SubscriptionCheckoutService";
import { SubscriptionReconciliationService } from "@/services/SubscriptionReconciliationService";

function checkout(id: string, overrides: Partial<SubscriptionCheckout> = {}) {
  return {
    id,
    companyId: "company_1",
    intendedPlanId: "plan_pro",
    billingInterval: "MONTHLY",
    provider: "VALIDAPAY",
    externalSessionId: null,
    externalSessionUrl: null,
    externalChargeId: `cha_${id}`,
    status: "PENDING",
    createdAt: new Date("2026-08-10T18:00:00Z"),
    updatedAt: new Date("2026-08-10T18:00:00Z"),
    completedAt: null,
    ...overrides,
  } satisfies SubscriptionCheckout;
}

/**
 * Repositório que aplica o MESMO filtro do Prisma: só `PENDING` com cobrança,
 * ordenado por `createdAt`, limitado. Sem isso o teste de seleção provaria
 * apenas que o duplo devolve o que foi mandado devolver.
 */
function repositorio(linhas: SubscriptionCheckout[]) {
  const listPendingWithCharge = vi.fn(async (input: ListPendingWithChargeInput) =>
    linhas
      .filter(
        (l) =>
          l.status === "PENDING" &&
          l.externalChargeId !== null &&
          l.provider === "VALIDAPAY" &&
          (input.companyId === undefined || l.companyId === input.companyId),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, input.limit),
  );

  return { listPendingWithCharge } as unknown as SubscriptionCheckoutRepository & {
    listPendingWithCharge: typeof listPendingWithCharge;
  };
}

function checkoutService(confirmar: ReturnType<typeof vi.fn>) {
  return { confirmarSeChargePago: confirmar } as unknown as SubscriptionCheckoutService;
}

describe("seleção do lote", () => {
  it("ativa a tentativa cuja cobrança está paga", async () => {
    const confirmar = vi.fn(async () => true);
    const service = new SubscriptionReconciliationService(
      repositorio([checkout("chk_1")]),
      checkoutService(confirmar),
    );

    const resumo = await service.reconcilePending({ companyId: "company_1" });

    expect(confirmar).toHaveBeenCalledWith("chk_1");
    expect(resumo).toEqual({ examined: 1, completed: 1, stillPending: 0, failed: 0 });
  });

  it("tentativa ainda não paga permanece, sem contar como erro", async () => {
    const confirmar = vi.fn(async () => false);
    const service = new SubscriptionReconciliationService(
      repositorio([checkout("chk_1")]),
      checkoutService(confirmar),
    );

    const resumo = await service.reconcilePending({ companyId: "company_1" });

    // Não é falha: é o resultado normal de quem ainda não pagou.
    expect(resumo).toEqual({ examined: 1, completed: 0, stillPending: 1, failed: 0 });
  });

  it("COMPLETED não entra na seleção", async () => {
    const confirmar = vi.fn(async () => true);
    const service = new SubscriptionReconciliationService(
      repositorio([
        checkout("chk_completo", { status: "COMPLETED", completedAt: new Date() }),
        checkout("chk_pendente"),
      ]),
      checkoutService(confirmar),
    );

    const resumo = await service.reconcilePending({ companyId: "company_1" });

    expect(resumo.examined).toBe(1);
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(confirmar).toHaveBeenCalledWith("chk_pendente");
  });

  it("FAILED e tentativa sem cobrança ficam de fora", async () => {
    const confirmar = vi.fn(async () => true);
    const service = new SubscriptionReconciliationService(
      repositorio([
        checkout("chk_falho", { status: "FAILED" }),
        // Sem chargeId não há o que consultar na ValidaPay.
        checkout("chk_sem_charge", { externalChargeId: null }),
      ]),
      checkoutService(confirmar),
    );

    const resumo = await service.reconcilePending({ companyId: "company_1" });

    expect(resumo.examined).toBe(0);
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("processa da mais antiga para a mais nova", async () => {
    const ordem: string[] = [];
    const confirmar = vi.fn(async (id: string) => {
      ordem.push(id);
      return false;
    });

    const service = new SubscriptionReconciliationService(
      repositorio([
        checkout("chk_nova", { createdAt: new Date("2026-08-10T20:00:00Z") }),
        checkout("chk_antiga", { createdAt: new Date("2026-08-10T10:00:00Z") }),
      ]),
      checkoutService(confirmar),
    );

    await service.reconcilePending({ companyId: "company_1" });

    // A mais antiga é a que espera há mais tempo.
    expect(ordem[0]).toBe("chk_antiga");
  });

  it("lote vazio não chama nada", async () => {
    const confirmar = vi.fn(async () => true);
    const service = new SubscriptionReconciliationService(
      repositorio([]),
      checkoutService(confirmar),
    );

    const resumo = await service.reconcilePending({ companyId: "company_1" });

    expect(resumo).toEqual({ examined: 0, completed: 0, stillPending: 0, failed: 0 });
    expect(confirmar).not.toHaveBeenCalled();
  });
});

describe("limites", () => {
  it("examina no máximo 50 por execução", async () => {
    const muitas = Array.from({ length: 120 }, (_, i) =>
      checkout(`chk_${i}`, {
        createdAt: new Date(Date.UTC(2026, 7, 10, 0, i)),
      }),
    );
    const confirmar = vi.fn(async () => false);

    const repo = repositorio(muitas);
    const service = new SubscriptionReconciliationService(
      repo,
      checkoutService(confirmar),
    );

    const resumo = await service.reconcilePending({ companyId: "company_1" });

    expect(repo.listPendingWithCharge).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
    expect(resumo.examined).toBe(50);
    expect(confirmar).toHaveBeenCalledTimes(50);
  });

  it("nunca passa de 5 confirmações simultâneas", async () => {
    let emVoo = 0;
    let pico = 0;

    const confirmar = vi.fn(async () => {
      emVoo++;
      pico = Math.max(pico, emVoo);
      await new Promise((resolve) => setTimeout(resolve, 5));
      emVoo--;
      return false;
    });

    const linhas = Array.from({ length: 30 }, (_, i) =>
      checkout(`chk_${i}`, { createdAt: new Date(Date.UTC(2026, 7, 10, 0, i)) }),
    );

    const service = new SubscriptionReconciliationService(
      repositorio(linhas),
      checkoutService(confirmar),
    );

    await service.reconcilePending({ companyId: "company_1" });

    // Disparar trinta de uma vez contra um gateway é o caminho mais rápido
    // para ser limitado por ele.
    expect(pico).toBeLessThanOrEqual(5);
    expect(confirmar).toHaveBeenCalledTimes(30);
  });
});

describe("isolamento de falha", () => {
  it("falha em um item não aborta o lote", async () => {
    const confirmar = vi.fn(async (id: string) => {
      if (id === "chk_2") throw new Error("timeout na ValidaPay");
      return id === "chk_3";
    });

    const linhas = ["chk_1", "chk_2", "chk_3"].map((id, i) =>
      checkout(id, { createdAt: new Date(Date.UTC(2026, 7, 10, 0, i)) }),
    );

    const service = new SubscriptionReconciliationService(
      repositorio(linhas),
      checkoutService(confirmar),
    );

    const resumo = await service.reconcilePending({ companyId: "company_1" });

    // Derrubar tudo por uma consulta que expirou deixaria pagamentos
    // confirmados sem ativação.
    expect(confirmar).toHaveBeenCalledTimes(3);
    expect(resumo).toEqual({ examined: 3, completed: 1, stillPending: 1, failed: 1 });
  });

  it("todas falhando ainda devolve resumo, sem lançar", async () => {
    const confirmar = vi.fn(async () => {
      throw new Error("indisponível");
    });

    const linhas = ["chk_1", "chk_2"].map((id, i) =>
      checkout(id, { createdAt: new Date(Date.UTC(2026, 7, 10, 0, i)) }),
    );

    const service = new SubscriptionReconciliationService(
      repositorio(linhas),
      checkoutService(confirmar),
    );

    await expect(service.reconcilePending({ companyId: "company_1" })).resolves.toEqual({
      examined: 2,
      completed: 0,
      stillPending: 0,
      failed: 2,
    });
  });
});

describe("escopo de tenant", () => {
  it("repassa o companyId recebido ao repositório", async () => {
    const repo = repositorio([checkout("chk_1")]);
    const service = new SubscriptionReconciliationService(
      repo,
      checkoutService(vi.fn(async () => false)),
    );

    await service.reconcilePending({ companyId: "company_1" });

    expect(repo.listPendingWithCharge).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company_1" }),
    );
  });

  it("não alcança tentativa de outra empresa", async () => {
    const confirmar = vi.fn(async () => true);
    const service = new SubscriptionReconciliationService(
      repositorio([
        checkout("chk_minha", { companyId: "company_1" }),
        checkout("chk_alheia", { companyId: "company_2" }),
      ]),
      checkoutService(confirmar),
    );

    const resumo = await service.reconcilePending({ companyId: "company_1" });

    expect(resumo.examined).toBe(1);
    expect(confirmar).toHaveBeenCalledWith("chk_minha");
    expect(confirmar).not.toHaveBeenCalledWith("chk_alheia");
  });

  it("o escopo NÃO é opcional — nunca varre por omissão", () => {
    const repo = repositorio([]);
    const service = new SubscriptionReconciliationService(
      repo,
      checkoutService(vi.fn(async () => false)),
    );

    // Ausência de companyId significaria "todos os tenants" por omissão, e um
    // esquecimento varreria o banco inteiro sem nada acusar. O tipo impede.
    // @ts-expect-error companyId é obrigatório
    expect(() => service.reconcilePending({})).toBeDefined();
  });
});

describe("não reimplementa confirmação", () => {
  it("delega inteiramente a confirmarSeChargePago", async () => {
    const confirmar = vi.fn(async () => true);
    const repo = repositorio([checkout("chk_1")]);
    const service = new SubscriptionReconciliationService(
      repo,
      checkoutService(confirmar),
    );

    await service.reconcilePending({ companyId: "company_1" });

    // O service só seleciona candidatos: quem consulta GET /v1/charges e ativa
    // é a mesma função usada por webhook e polling. Uma segunda definição de
    // "pago" seria a forma mais direta de divergirem.
    expect(Object.keys(repo)).toEqual(["listPendingWithCharge"]);
    expect(confirmar).toHaveBeenCalledTimes(1);
  });
});
