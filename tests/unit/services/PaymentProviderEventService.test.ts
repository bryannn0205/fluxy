import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Company,
  PaymentProviderEvent,
  ProviderEventStatus,
  SubscriptionCheckout,
} from "@/lib/generated/prisma/client";
import type { ValidaPaySubscriptionsGateway } from "@/lib/validapay/subscriptions";
import type { CompanyRepository } from "@/repositories/interfaces/CompanyRepository";
import type {
  PaymentProviderEventRepository,
  RecordEventInput,
} from "@/repositories/interfaces/PaymentProviderEventRepository";
import type { SubscriptionCheckoutRepository } from "@/repositories/interfaces/SubscriptionCheckoutRepository";
import { PaymentProviderEventService } from "@/services/PaymentProviderEventService";
import type { SubscriptionCheckoutService } from "@/services/SubscriptionCheckoutService";
import type {
  ResultadoDeCicloDeVida,
  SubscriptionLifecycleService,
} from "@/services/SubscriptionLifecycleService";

const CHECKOUT: SubscriptionCheckout = {
  id: "chk_1",
  companyId: "company_1",
  intendedPlanId: "plan_pro",
  billingInterval: "MONTHLY",
  provider: "VALIDAPAY",
  externalSessionId: null,
  externalChargeId: "cha_1",
  status: "PENDING",
  createdAt: new Date("2026-08-10T18:00:00Z"),
  updatedAt: new Date("2026-08-10T18:00:00Z"),
  completedAt: null,
};

function evento(overrides: Partial<PaymentProviderEvent> = {}): PaymentProviderEvent {
  return {
    id: "evt_1",
    provider: "VALIDAPAY",
    externalEventId: null,
    eventType: "payment.success",
    companyId: null,
    externalChargeId: "cha_1",
    externalPaymentId: null,
    externalSubscriptionId: null,
    occurredAt: null,
    receivedAt: new Date(),
    processedAt: null,
    status: "PENDING",
    idempotencyKey: "hash",
    payloadHash: "hash",
    ...overrides,
  };
}

/** Repositório de eventos em memória, com dedup por payloadHash como no banco. */
function eventosFalsos(existente: PaymentProviderEvent | null = null) {
  const porHash = new Map<string, PaymentProviderEvent>();
  if (existente) porHash.set(existente.payloadHash!, existente);

  const repo: PaymentProviderEventRepository = {
    async record(input: RecordEventInput) {
      const jaExiste = porHash.get(input.payloadHash);
      if (jaExiste) return { event: jaExiste, created: false };

      const novo = evento({
        id: `evt_${porHash.size + 1}`,
        eventType: input.eventType,
        payloadHash: input.payloadHash,
        idempotencyKey: input.payloadHash,
        externalChargeId: input.externalChargeId,
        externalPaymentId: input.externalPaymentId,
        externalSubscriptionId: input.externalSubscriptionId,
        companyId: input.companyId,
        status: "PENDING",
      });
      porHash.set(input.payloadHash, novo);
      return { event: novo, created: true };
    },
    async markStatus(id, status: ProviderEventStatus) {
      for (const [hash, e] of porHash) {
        if (e.id === id) porHash.set(hash, { ...e, status });
      }
    },
    async attachCompany(id, companyId) {
      for (const [hash, e] of porHash) {
        if (e.id === id) porHash.set(hash, { ...e, companyId });
      }
    },
    async findByPayloadHash(hash) {
      return porHash.get(hash) ?? null;
    },
  };

  return { repo, atual: (hash: string) => porHash.get(hash) };
}

function checkoutsFalsos(linhas: SubscriptionCheckout[] = [CHECKOUT]) {
  const repo = {
    findById: vi.fn(async (id: string) => linhas.find((l) => l.id === id) ?? null),
    findByChargeId: vi.fn(
      async (chargeId: string) =>
        linhas.find((l) => l.externalChargeId === chargeId) ?? null,
    ),
    findByIdForCompany: vi.fn(async () => null),
    findOrCreatePending: vi.fn(),
    attachChargeId: vi.fn(),
    markFailed: vi.fn(),
    activateIfPending: vi.fn(),
  } as unknown as SubscriptionCheckoutRepository & {
    findById: ReturnType<typeof vi.fn>;
    findByChargeId: ReturnType<typeof vi.fn>;
  };

  return repo;
}

function checkoutServiceFalso(retorno: boolean | Error = true) {
  return {
    confirmarSeChargePago: vi.fn(async () => {
      if (retorno instanceof Error) throw retorno;
      return retorno;
    }),
  } as unknown as SubscriptionCheckoutService & {
    confirmarSeChargePago: ReturnType<typeof vi.fn>;
  };
}

function assinaturasFalsas(
  metadata: Record<string, unknown> = {},
): ValidaPaySubscriptionsGateway & { getSubscription: ReturnType<typeof vi.fn> } {
  return {
    getSubscription: vi.fn(async (id: string) => ({
      subscriptionId: id,
      status: "ACTIVE",
      cancelamentoAgendado: false,
      cancelamentoEfetivoEm: null,
      cancelamentoImediato: false,
      cicloAtualPago: true,
      metadata,
    })),
  };
}

/**
 * Ciclo de vida dublê.
 *
 * Por omissão devolve `NAO_CORRELACIONADA`, que é o estado de uma empresa que
 * ainda não tem assinatura ativa — assim os testes de checkout inicial seguem
 * caindo no caminho da tentativa local, que é o comportamento que eles fixam.
 */
function cicloDeVidaFalso(resultado: ResultadoDeCicloDeVida = "NAO_CORRELACIONADA") {
  return {
    revisarEmpresa: vi.fn(async () => resultado),
    revisarPorAssinatura: vi.fn(async () => resultado),
    registrarFalhaDeCiclo: vi.fn(async () => resultado),
  } as unknown as SubscriptionLifecycleService & {
    revisarPorAssinatura: ReturnType<typeof vi.fn>;
    registrarFalhaDeCiclo: ReturnType<typeof vi.fn>;
  };
}

function empresasFalsas(company: Company | null = null) {
  return {
    findByValidapaySubscriptionId: vi.fn(async () => company),
    transitionSubscriptionStatus: vi.fn(async () => true),
    listForLifecycleReview: vi.fn(async () => []),
  } as unknown as CompanyRepository & {
    findByValidapaySubscriptionId: ReturnType<typeof vi.fn>;
  };
}

function corpo(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  return { rawBody, payload };
}

let eventos: ReturnType<typeof eventosFalsos>;

beforeEach(() => {
  eventos = eventosFalsos();
});

describe("evento novo", () => {
  it("persiste e confirma pela fonte autoritativa", async () => {
    const checkouts = checkoutsFalsos();
    const checkoutService = checkoutServiceFalso(true);
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkouts,
      checkoutService,
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    const resultado = await service.processar(
      corpo({ event: "payment.success", chargeId: "cha_1" }),
    );

    expect(resultado.status).toBe("PROCESSED");
    expect(resultado.ativou).toBe(true);
    // O webhook é gatilho: quem decide é o GET /v1/charges dentro do service.
    expect(checkoutService.confirmarSeChargePago).toHaveBeenCalledWith("chk_1");
  });

  it("NUNCA ativa usando o status do payload", async () => {
    const checkouts = checkoutsFalsos();
    // A confirmação autoritativa diz que NÃO está pago.
    const checkoutService = checkoutServiceFalso(false);
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkouts,
      checkoutService,
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    const resultado = await service.processar(
      corpo({
        event: "payment.success",
        chargeId: "cha_1",
        // Payload afirmando pagamento — irrelevante para a decisão.
        status: "PAID",
        currentCycle: { status: "PAID", paidAt: "2026-08-10T18:00:00Z" },
      }),
    );

    expect(resultado.ativou).toBe(false);
    // Registrado como processado: consultamos e a resposta foi "não pago".
    expect(resultado.status).toBe("PROCESSED");
  });

  it("nunca usa companyId vindo do payload", async () => {
    const checkouts = checkoutsFalsos();
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkouts,
      checkoutServiceFalso(),
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );
    const espiao = vi.spyOn(eventos.repo, "record");

    await service.processar(
      corpo({
        event: "payment.success",
        chargeId: "cha_1",
        companyId: "company_de_outra_empresa",
      }),
    );

    // Um corpo forjado apontaria para a empresa que quisesse.
    expect(espiao).toHaveBeenCalledWith(expect.objectContaining({ companyId: null }));
  });
});

describe("evento desconhecido", () => {
  it("é persistido e marcado IGNORED", async () => {
    const checkoutService = checkoutServiceFalso();
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkoutsFalsos(),
      checkoutService,
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    const resultado = await service.processar(
      corpo({ event: "subscription.algo.que.nao.existe", chargeId: "cha_1" }),
    );

    // Registrado para que se saiba que chegou, sem inventar comportamento.
    expect(resultado.status).toBe("IGNORED");
    expect(checkoutService.confirmarSeChargePago).not.toHaveBeenCalled();
  });

  it("evento sem campo `event` não quebra", async () => {
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkoutsFalsos(),
      checkoutServiceFalso(),
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    const resultado = await service.processar(corpo({ chargeId: "cha_1" }));
    expect(resultado.status).toBe("IGNORED");
  });
});

describe("duplicatas por payloadHash", () => {
  async function processarDuasVezes(statusInicial: ProviderEventStatus) {
    const payload = { event: "payment.success", chargeId: "cha_1" };
    const rawBody = JSON.stringify(payload);
    const hash = (await import("node:crypto"))
      .createHash("sha256")
      .update(rawBody)
      .digest("hex");

    eventos = eventosFalsos(
      evento({ payloadHash: hash, idempotencyKey: hash, status: statusInicial }),
    );

    const checkoutService = checkoutServiceFalso(true);
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkoutsFalsos(),
      checkoutService,
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    const resultado = await service.processar({ rawBody, payload });
    return { resultado, checkoutService };
  }

  it("PROCESSED é no-op", async () => {
    const { resultado, checkoutService } = await processarDuasVezes("PROCESSED");

    expect(resultado.status).toBe("PROCESSED");
    expect(checkoutService.confirmarSeChargePago).not.toHaveBeenCalled();
  });

  it("IGNORED é no-op", async () => {
    const { resultado, checkoutService } = await processarDuasVezes("IGNORED");

    expect(resultado.status).toBe("IGNORED");
    expect(checkoutService.confirmarSeChargePago).not.toHaveBeenCalled();
  });

  it("PENDING é reprocessado", async () => {
    const { resultado, checkoutService } = await processarDuasVezes("PENDING");

    // Ficou pela metade na entrega anterior — ganha nova chance.
    expect(checkoutService.confirmarSeChargePago).toHaveBeenCalledTimes(1);
    expect(resultado.status).toBe("PROCESSED");
  });

  it("FAILED NÃO é reprocessado automaticamente", async () => {
    const { resultado, checkoutService } = await processarDuasVezes("FAILED");

    // O mesmo corpo não traria a informação que faltou para correlacionar.
    expect(checkoutService.confirmarSeChargePago).not.toHaveBeenCalled();
    expect(resultado.status).toBe("FAILED");
  });
});

describe("correlação", () => {
  it("A: por chargeId", async () => {
    const checkouts = checkoutsFalsos();
    const checkoutService = checkoutServiceFalso();
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkouts,
      checkoutService,
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    await service.processar(corpo({ event: "payment.success", chargeId: "cha_1" }));

    expect(checkouts.findByChargeId).toHaveBeenCalledWith("cha_1");
    expect(checkoutService.confirmarSeChargePago).toHaveBeenCalledWith("chk_1");
  });

  it("B: por metadata do corpo quando não há chargeId", async () => {
    const semCharge = { ...CHECKOUT, externalChargeId: null };
    const checkouts = checkoutsFalsos([semCharge]);
    const checkoutService = checkoutServiceFalso();
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkouts,
      checkoutService,
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    await service.processar(
      corpo({
        event: "subscription.activated",
        subscriptionId: "sub_1",
        metadata: { subscriptionCheckoutId: "chk_1" },
      }),
    );

    expect(checkoutService.confirmarSeChargePago).toHaveBeenCalledWith("chk_1");
  });

  it("B: metadata que CONTRADIZ o chargeId do corpo é recusada", async () => {
    // metadata aponta para chk_1, cujo charge é cha_1 — mas o evento diz cha_OUTRO.
    const checkouts = checkoutsFalsos();
    const checkoutService = checkoutServiceFalso();
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkouts,
      checkoutService,
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    const resultado = await service.processar(
      corpo({
        event: "payment.success",
        chargeId: "cha_OUTRO",
        metadata: { subscriptionCheckoutId: "chk_1" },
      }),
    );

    // Aceitar ativaria o plano da empresa errada.
    expect(checkoutService.confirmarSeChargePago).not.toHaveBeenCalled();
    expect(resultado.status).toBe("FAILED");
  });

  it("C: fallback consultando GET /v1/subscriptions/:id", async () => {
    const semCharge = { ...CHECKOUT, externalChargeId: null };
    const checkouts = checkoutsFalsos([semCharge]);
    const checkoutService = checkoutServiceFalso();
    // Corpo SEM metadata; a API é que confirma de quem é a assinatura.
    const assinaturas = assinaturasFalsas({ subscriptionCheckoutId: "chk_1" });
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkouts,
      checkoutService,
      assinaturas,
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    await service.processar(
      corpo({ event: "subscription.activated", subscriptionId: "sub_1" }),
    );

    expect(assinaturas.getSubscription).toHaveBeenCalledWith("sub_1");
    expect(checkoutService.confirmarSeChargePago).toHaveBeenCalledWith("chk_1");
  });

  it("não correlacionável vira FAILED", async () => {
    const checkouts = checkoutsFalsos([]);
    const checkoutService = checkoutServiceFalso();
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkouts,
      checkoutService,
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    const resultado = await service.processar(
      corpo({ event: "payment.success", chargeId: "cha_desconhecido" }),
    );

    expect(resultado.status).toBe("FAILED");
    expect(checkoutService.confirmarSeChargePago).not.toHaveBeenCalled();
  });

  it("vincula a empresa a partir da tentativa local, não do payload", async () => {
    const checkouts = checkoutsFalsos();
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkouts,
      checkoutServiceFalso(),
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );
    const espiao = vi.spyOn(eventos.repo, "attachCompany");

    await service.processar(
      corpo({ event: "payment.success", chargeId: "cha_1", companyId: "forjada" }),
    );

    expect(espiao).toHaveBeenCalledWith(expect.any(String), "company_1");
  });
});

describe("falhas transitórias", () => {
  it("erro na confirmação deixa o evento PENDING para reprocessar", async () => {
    const checkouts = checkoutsFalsos();
    const checkoutService = checkoutServiceFalso(new Error("timeout"));
    const service = new PaymentProviderEventService(
      eventos.repo,
      checkouts,
      checkoutService,
      assinaturasFalsas(),
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    const resultado = await service.processar(
      corpo({ event: "payment.success", chargeId: "cha_1" }),
    );

    // Não vira FAILED: a informação existe, só a chamada falhou.
    expect(resultado.status).toBe("PENDING");
    expect(resultado.ativou).toBe(false);
  });

  it("erro ao consultar a assinatura deixa PENDING, não FAILED", async () => {
    const checkouts = checkoutsFalsos([]);
    const assinaturas = {
      getSubscription: vi.fn(async () => {
        throw new Error("indisponível");
      }),
    } as unknown as ValidaPaySubscriptionsGateway;

    const service = new PaymentProviderEventService(
      eventos.repo,
      checkouts,
      checkoutServiceFalso(),
      assinaturas,
      cicloDeVidaFalso(),
      empresasFalsas(),
    );

    const resultado = await service.processar(
      corpo({ event: "subscription.activated", subscriptionId: "sub_1" }),
    );

    expect(resultado.status).toBe("PENDING");
  });
});
