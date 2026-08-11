import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  Prisma,
  type Plan,
  type SubscriptionCheckout,
} from "@/lib/generated/prisma/client";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import type { ValidaPayChargesGateway } from "@/lib/validapay/charges";
import { ValidaPayRequestError, ValidaPayTimeoutError } from "@/lib/validapay/errors";
import type { CompanyRepository } from "@/repositories/interfaces/CompanyRepository";
import type { PlanRepository } from "@/repositories/interfaces/PlanRepository";
import type {
  ActivateIfPendingInput,
  FindOrCreatePendingInput,
  SubscriptionCheckoutRepository,
} from "@/repositories/interfaces/SubscriptionCheckoutRepository";
import { SubscriptionCheckoutService } from "@/services/SubscriptionCheckoutService";

import { buildCompany } from "../../helpers/company";

const PLANO: Plan = {
  id: "plan_pro",
  slug: "pro",
  name: "Fluxy Pro",
  priceMonthly: new Prisma.Decimal("89"),
  priceYearly: new Prisma.Decimal("890"),
  modules: [],
  maxUsers: null,
  maxOrdersPerMonth: null,
  maxProducts: null,
  maxCustomers: null,
  validapayPriceMonthlyId: "price_mensal",
  validapayPriceYearlyId: "price_anual",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const EMPRESA = buildCompany({ id: "company_1", cnpj: "12.345.678/0001-99" });

function checkout(overrides: Partial<SubscriptionCheckout> = {}): SubscriptionCheckout {
  return {
    id: "chk_1",
    companyId: EMPRESA.id,
    intendedPlanId: PLANO.id,
    billingInterval: "MONTHLY",
    provider: "VALIDAPAY",
    externalSessionId: null,
    externalChargeId: null,
    status: "PENDING",
    createdAt: new Date("2026-08-10T18:00:00Z"),
    updatedAt: new Date("2026-08-10T18:00:00Z"),
    completedAt: null,
    ...overrides,
  };
}

/** Repositório em memória, com o mesmo contrato condicional do Prisma. */
function repositorioFalso(inicial: SubscriptionCheckout = checkout()) {
  let linha = { ...inicial };
  const chamadas = { activate: 0, attach: 0, markFailed: 0, findOrCreate: 0 };

  const repo: SubscriptionCheckoutRepository = {
    async findOrCreatePending(input: FindOrCreatePendingInput) {
      chamadas.findOrCreate++;
      // Honra o intervalo pedido, como o repositório real: o service relê a
      // periodicidade da LINHA, não do input, porque a recuperação após
      // timeout não tem input nenhum.
      linha = { ...linha, billingInterval: input.billingInterval };
      return { checkout: linha, reused: true };
    },
    async findById(id) {
      return id === linha.id ? linha : null;
    },
    async findByIdForCompany(id, companyId) {
      return id === linha.id && companyId === linha.companyId ? linha : null;
    },
    async findByChargeId(chargeId) {
      return linha.externalChargeId === chargeId ? linha : null;
    },
    async listPendingWithCharge() {
      return linha.status === "PENDING" && linha.externalChargeId !== null ? [linha] : [];
    },
    async attachChargeId(id, chargeId) {
      chamadas.attach++;
      // Condicional, como o UPDATE ... WHERE externalChargeId IS NULL.
      if (id === linha.id && linha.externalChargeId === null) {
        linha = { ...linha, externalChargeId: chargeId };
      }
      return linha;
    },
    async markFailed(id) {
      chamadas.markFailed++;
      if (id === linha.id && linha.status === "PENDING") {
        linha = { ...linha, status: "FAILED" };
      }
    },
    async activateIfPending(input: ActivateIfPendingInput) {
      chamadas.activate++;
      // Claim atômico: só a primeira execução encontra PENDING.
      if (input.subscriptionCheckoutId !== linha.id || linha.status !== "PENDING") {
        return false;
      }
      linha = { ...linha, status: "COMPLETED", completedAt: new Date() };
      return true;
    },
  };

  return { repo, chamadas, atual: () => linha };
}

const planos: PlanRepository = {
  findById: async (id) => (id === PLANO.id ? PLANO : null),
  findBySlug: async (slug) => (slug === PLANO.slug ? PLANO : null),
  listPublic: async () => [PLANO],
};

function empresas(company = EMPRESA): CompanyRepository {
  return {
    findById: async (id) => (id === company.id ? company : null),
    findByEmail: async () => null,
    createWithOwner: async () => company,
    update: async () => company,
    incrementOrderNumber: async () => 1,
    findPlanByCompany: async () => PLANO,
  };
}

function gateway(overrides: Partial<ValidaPayChargesGateway> = {}) {
  const base: ValidaPayChargesGateway = {
    createPixCharge: vi.fn(async () => ({
      chargeId: "cha_1",
      customerId: "cus_1",
      duplicated: false,
    })),
    getCharge: vi.fn(async () => ({
      chargeId: "cha_1",
      status: "PENDING",
      paid: false,
      subscriptionId: null,
      paymentId: null,
      paidAt: null,
    })),
  };
  return { ...base, ...overrides };
}

let ambiente: ReturnType<typeof repositorioFalso>;

beforeEach(() => {
  ambiente = repositorioFalso();
});

describe("iniciarCheckout", () => {
  it("cria a cobrança sem ativar plano nem mudar status da empresa", async () => {
    const charges = gateway();
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    const resultado = await service.iniciarCheckout(
      { planId: PLANO.id, billingInterval: "MONTHLY" },
      EMPRESA,
    );

    expect(resultado.chargeId).toBe("cha_1");
    expect(resultado.status).toBe("PENDING");
    // A ativação é do caminho de confirmação, nunca da criação.
    expect(ambiente.chamadas.activate).toBe(0);
  });

  it("o externalId deriva do id da tentativa — nunca de relógio ou aleatório", async () => {
    const charges = gateway();
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    await service.iniciarCheckout(
      { planId: PLANO.id, billingInterval: "MONTHLY" },
      EMPRESA,
    );

    expect(charges.createPixCharge).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "fluxy-checkout-chk_1" }),
    );
  });

  it("usa o priceId do intervalo pedido", async () => {
    const charges = gateway();
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    await service.iniciarCheckout(
      { planId: PLANO.id, billingInterval: "YEARLY" },
      EMPRESA,
    );

    expect(charges.createPixCharge).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: "price_anual" }),
    );
  });

  it("papel sem subscription:manage é barrado antes de qualquer chamada externa", async () => {
    const charges = gateway();
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    await expect(
      service.iniciarCheckout(
        { planId: PLANO.id, billingInterval: "MONTHLY" },
        { ...EMPRESA, role: "ADMIN" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(charges.createPixCharge).not.toHaveBeenCalled();
  });

  it("plano sem preço na ValidaPay falha ANTES de criar a tentativa", async () => {
    const semPreco: PlanRepository = {
      ...planos,
      findById: async () => ({ ...PLANO, validapayPriceMonthlyId: null }),
    };
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      semPreco,
      empresas(),
      gateway(),
    );

    await expect(
      service.iniciarCheckout({ planId: PLANO.id, billingInterval: "MONTHLY" }, EMPRESA),
    ).rejects.toBeInstanceOf(ValidationError);

    // Sem preço remoto a linha ficaria órfã por erro de cadastro.
    expect(ambiente.chamadas.findOrCreate).toBe(0);
  });

  it("empresa sem CNPJ é recusada — a ValidaPay exige documento do comprador", async () => {
    const semCnpj = buildCompany({ id: "company_1", cnpj: null });
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(semCnpj),
      gateway(),
    );

    await expect(
      service.iniciarCheckout({ planId: PLANO.id, billingInterval: "MONTHLY" }, semCnpj),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("garantirChargeCriado", () => {
  it("é idempotente: com chargeId gravado não chama a ValidaPay de novo", async () => {
    ambiente = repositorioFalso(checkout({ externalChargeId: "cha_existente" }));
    const charges = gateway();
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    const resultado = await service.garantirChargeCriado("chk_1");

    expect(resultado.chargeId).toBe("cha_existente");
    expect(charges.createPixCharge).not.toHaveBeenCalled();
  });

  it("timeout mantém PENDING, sem chargeId e sem marcar FAILED", async () => {
    const charges = gateway({
      createPixCharge: vi.fn(async () => {
        throw new ValidaPayTimeoutError("POST /v1/charges", 10_000);
      }),
    });
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    await expect(service.garantirChargeCriado("chk_1")).rejects.toBeInstanceOf(
      ValidaPayTimeoutError,
    );

    // Timeout do cliente NÃO prova falha do servidor: marcar FAILED fecharia
    // uma tentativa que ainda pode ser recuperada pelo mesmo externalId.
    expect(ambiente.atual().status).toBe("PENDING");
    expect(ambiente.atual().externalChargeId).toBeNull();
    expect(ambiente.chamadas.markFailed).toBe(0);
  });

  it("recuperação após timeout reusa o MESMO externalId e grava o chargeId do 409", async () => {
    const charges = gateway({
      createPixCharge: vi
        .fn()
        .mockRejectedValueOnce(new ValidaPayTimeoutError("POST /v1/charges", 10_000))
        .mockResolvedValueOnce({
          chargeId: "cha_original",
          customerId: null,
          duplicated: true,
        }),
    });
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    await expect(service.garantirChargeCriado("chk_1")).rejects.toBeInstanceOf(
      ValidaPayTimeoutError,
    );
    const resultado = await service.garantirChargeCriado("chk_1");

    expect(resultado.chargeId).toBe("cha_original");

    const externalIds = (
      charges.createPixCharge as unknown as {
        mock: { calls: [{ externalId: string }][] };
      }
    ).mock.calls.map(([arg]) => arg.externalId);
    expect(new Set(externalIds).size).toBe(1);
  });

  it("erro 4xx marca FAILED — repetir o mesmo pedido não conserta dado recusado", async () => {
    const charges = gateway({
      createPixCharge: vi.fn(async () => {
        throw new ValidaPayRequestError(404, "/v1/charges", '{"code":"PRICE_NOT_FOUND"}');
      }),
    });
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    await expect(service.garantirChargeCriado("chk_1")).rejects.toBeInstanceOf(
      ValidaPayRequestError,
    );
    expect(ambiente.atual().status).toBe("FAILED");
  });

  it("erro 5xx NÃO marca FAILED — é transitório e ainda recuperável", async () => {
    const charges = gateway({
      createPixCharge: vi.fn(async () => {
        throw new ValidaPayRequestError(500, "/v1/charges", "erro interno");
      }),
    });
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    await expect(service.garantirChargeCriado("chk_1")).rejects.toBeInstanceOf(
      ValidaPayRequestError,
    );
    expect(ambiente.atual().status).toBe("PENDING");
    expect(ambiente.chamadas.markFailed).toBe(0);
  });

  it("N chamadas concorrentes convergem para UM chargeId", async () => {
    // A ValidaPay deduplica pelo externalId: uma ganha o 200, as demais levam
    // 409 com o mesmo identificador. O desenho não impede N POSTs — impede um
    // segundo externalId e um segundo chargeId gravado.
    let primeira = true;
    const charges = gateway({
      createPixCharge: vi.fn(async () => {
        if (primeira) {
          primeira = false;
          return { chargeId: "cha_unico", customerId: "cus_1", duplicated: false };
        }
        return { chargeId: "cha_unico", customerId: null, duplicated: true };
      }),
    });
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    const resultados = await Promise.all(
      Array.from({ length: 8 }, () => service.garantirChargeCriado("chk_1")),
    );

    expect(new Set(resultados.map((r) => r.chargeId))).toEqual(new Set(["cha_unico"]));
    expect(ambiente.atual().externalChargeId).toBe("cha_unico");
  });
});

describe("confirmarSeChargePago", () => {
  const pago = {
    chargeId: "cha_1",
    status: "PAID",
    paid: true,
    subscriptionId: "sub_1",
    paymentId: "E123",
    paidAt: new Date("2026-08-10T18:34:06.981Z"),
  };

  it("consulta o charge como fonte autoritativa e ativa quando PAID", async () => {
    ambiente = repositorioFalso(checkout({ externalChargeId: "cha_1" }));
    const charges = gateway({ getCharge: vi.fn(async () => pago) });
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    await expect(service.confirmarSeChargePago("chk_1")).resolves.toBe(true);
    expect(charges.getCharge).toHaveBeenCalledWith("cha_1");
    expect(ambiente.atual().status).toBe("COMPLETED");
  });

  it("PROCESSING não ativa — a resposta do simulador não é pagamento", async () => {
    ambiente = repositorioFalso(checkout({ externalChargeId: "cha_1" }));
    const charges = gateway({
      getCharge: vi.fn(async () => ({ ...pago, status: "PROCESSING", paid: false })),
    });
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    await expect(service.confirmarSeChargePago("chk_1")).resolves.toBe(false);
    expect(ambiente.atual().status).toBe("PENDING");
  });

  it("execuções simultâneas resultam em UMA ativação efetiva", async () => {
    ambiente = repositorioFalso(checkout({ externalChargeId: "cha_1" }));
    const charges = gateway({ getCharge: vi.fn(async () => pago) });
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    // Webhook e reconciliação chegando juntos sobre o mesmo charge pago.
    const resultados = await Promise.all([
      service.confirmarSeChargePago("chk_1"),
      service.confirmarSeChargePago("chk_1"),
      service.confirmarSeChargePago("chk_1"),
    ]);

    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it("tentativa já COMPLETED não consulta nem reativa", async () => {
    ambiente = repositorioFalso(
      checkout({ externalChargeId: "cha_1", status: "COMPLETED" }),
    );
    const charges = gateway({ getCharge: vi.fn(async () => pago) });
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    await expect(service.confirmarSeChargePago("chk_1")).resolves.toBe(false);
    expect(charges.getCharge).not.toHaveBeenCalled();
  });

  it("sem chargeId não há o que confirmar", async () => {
    const charges = gateway({ getCharge: vi.fn(async () => pago) });
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      charges,
    );

    await expect(service.confirmarSeChargePago("chk_1")).resolves.toBe(false);
    expect(charges.getCharge).not.toHaveBeenCalled();
  });

  it("repassa o subscriptionId da cobrança para a ativação", async () => {
    ambiente = repositorioFalso(checkout({ externalChargeId: "cha_1" }));
    const espiao = vi.spyOn(ambiente.repo, "activateIfPending");
    const service = new SubscriptionCheckoutService(
      ambiente.repo,
      planos,
      empresas(),
      gateway({ getCharge: vi.fn(async () => pago) }),
    );

    await service.confirmarSeChargePago("chk_1");

    expect(espiao).toHaveBeenCalledWith(
      expect.objectContaining({ validapaySubscriptionId: "sub_1" }),
    );
  });
});
