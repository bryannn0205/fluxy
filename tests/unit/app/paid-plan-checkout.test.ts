import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  Prisma,
  type Plan,
  type SubscriptionCheckout,
} from "@/lib/generated/prisma/client";
import { DEFAULT_PLAN_SLUG, planHasTrial } from "@/lib/constants";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { resolverCtaDoPlano } from "@/lib/plan-cta";
import type { ChargeSnapshot, ValidaPayChargesGateway } from "@/lib/validapay/charges";
import type { CompanyRepository } from "@/repositories/interfaces/CompanyRepository";
import type { PlanRepository } from "@/repositories/interfaces/PlanRepository";
import type {
  ActivateIfPendingInput,
  SubscriptionCheckoutRepository,
} from "@/repositories/interfaces/SubscriptionCheckoutRepository";
import { iniciarCheckoutSchema } from "@/schemas/subscription-checkout.schema";
import { SubscriptionCheckoutService } from "@/services/SubscriptionCheckoutService";
import type { PublicPlan } from "@/types/plans";

import { buildCompany } from "../../helpers/company";

/**
 * Contratação real de plano pago.
 *
 * O que estes testes travam não é "o checkout funciona" — é o conjunto de
 * coisas que, se cederem, cobram errado ou liberam plano sem pagamento:
 *
 *   1. o preço remoto usado é o do plano E da periodicidade pedidos;
 *   2. o navegador não decide preço, empresa nem plano;
 *   3. **nada além de uma cobrança confirmada como paga ativa alguma coisa** —
 *      nem página de retorno, nem parâmetro de URL, nem corpo de webhook;
 *   4. a mesma confirmação chegando duas vezes ativa uma vez;
 *   5. uma empresa não alcança a tentativa de outra.
 */

const PRECOS = {
  plusMensal: "price_plus_mensal_sintetico",
  plusAnual: "price_plus_anual_sintetico",
  proMensal: "price_pro_mensal_sintetico",
  proAnual: "price_pro_anual_sintetico",
} as const;

function plano(overrides: Partial<Plan> & Pick<Plan, "id" | "slug">): Plan {
  return {
    name: `Fluxy ${overrides.slug}`,
    priceMonthly: new Prisma.Decimal("49"),
    priceYearly: new Prisma.Decimal("490"),
    modules: [],
    maxUsers: null,
    maxOrdersPerMonth: null,
    maxProducts: null,
    maxCustomers: null,
    validapayPriceMonthlyId: null,
    validapayPriceYearlyId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const PLUS = plano({
  id: "plan_plus",
  slug: "plus",
  name: "Fluxy Plus",
  validapayPriceMonthlyId: PRECOS.plusMensal,
  validapayPriceYearlyId: PRECOS.plusAnual,
});

const PRO = plano({
  id: "plan_pro",
  slug: "pro",
  name: "Fluxy Pro",
  priceMonthly: new Prisma.Decimal("89"),
  priceYearly: new Prisma.Decimal("890"),
  validapayPriceMonthlyId: PRECOS.proMensal,
  validapayPriceYearlyId: PRECOS.proAnual,
});

/** Sem preço remoto — o estado em que o Plus nasceu. */
const SEM_PRECO = plano({ id: "plan_sem_preco", slug: "standard" });

const STANDARD = plano({
  id: "plan_standard",
  slug: DEFAULT_PLAN_SLUG,
  name: "Fluxy Standard",
  priceMonthly: new Prisma.Decimal("29"),
  priceYearly: new Prisma.Decimal("290"),
});

const EMPRESA = buildCompany({ id: "company_a", cnpj: "12.345.678/0001-99" });
const OUTRA_EMPRESA = "company_b";

function tentativa(overrides: Partial<SubscriptionCheckout> = {}): SubscriptionCheckout {
  return {
    id: "chk_1",
    companyId: EMPRESA.id,
    intendedPlanId: PLUS.id,
    billingInterval: "MONTHLY",
    provider: "VALIDAPAY",
    externalSessionId: null,
    externalChargeId: null,
    status: "PENDING",
    createdAt: new Date("2026-08-17T10:00:00Z"),
    updatedAt: new Date("2026-08-17T10:00:00Z"),
    completedAt: null,
    ...overrides,
  };
}

function repositorio(inicial: SubscriptionCheckout = tentativa()) {
  let linha = { ...inicial };
  const ativacoes: ActivateIfPendingInput[] = [];
  const chamadas = { markFailed: 0 };

  const repo: SubscriptionCheckoutRepository = {
    async findOrCreatePending(input) {
      linha = { ...linha, billingInterval: input.billingInterval };
      return { checkout: linha, reused: false };
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
      return [];
    },
    async attachChargeId(id, chargeId) {
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
    // Claim atômico: só a execução que encontrar PENDING altera algo.
    async activateIfPending(input) {
      if (input.subscriptionCheckoutId !== linha.id || linha.status !== "PENDING") {
        return false;
      }
      ativacoes.push(input);
      linha = { ...linha, status: "COMPLETED", completedAt: new Date() };
      return true;
    },
  };

  return { repo, ativacoes, chamadas, atual: () => linha };
}

function catalogo(...lista: Plan[]): PlanRepository {
  return {
    findById: async (id) => lista.find((p) => p.id === id) ?? null,
    findBySlug: async (slug) => lista.find((p) => p.slug === slug) ?? null,
    listPublic: async () => lista,
  };
}

function empresas(): CompanyRepository {
  return {
    findById: async (id) => (id === EMPRESA.id ? EMPRESA : null),
    findByEmail: async () => null,
    createWithOwner: async () => EMPRESA,
    update: async () => EMPRESA,
    incrementOrderNumber: async () => 1,
    findPlanByCompany: async () => PLUS,
    // Ciclo de vida pós-pagamento não participa destes testes: eles cobrem a
    // contratação. Ver paid-plan-lifecycle.test.ts.
    findByValidapaySubscriptionId: async () => null,
    transitionSubscriptionStatus: async () => false,
    listForLifecycleReview: async () => [],
    listForLifecycleReviewAcrossTenants: async () => [],
  };
}

function cobranca(overrides: Partial<ChargeSnapshot> = {}): ChargeSnapshot {
  return {
    chargeId: "cha_1",
    status: "PENDING",
    paid: false,
    subscriptionId: null,
    paymentId: null,
    paidAt: null,
    pix: null,
    ...overrides,
  };
}

function gateway(snapshot: ChargeSnapshot = cobranca()) {
  const recebidos: string[] = [];

  const gw: ValidaPayChargesGateway = {
    createPixCharge: vi.fn(async (input) => {
      recebidos.push(input.priceId);
      return { chargeId: "cha_1", customerId: null, duplicated: false, pix: null };
    }),
    getCharge: vi.fn(async () => snapshot),
  };

  return { gw, recebidos };
}

function servico(
  ambiente: ReturnType<typeof repositorio>,
  planos: PlanRepository,
  charges: ValidaPayChargesGateway,
) {
  return new SubscriptionCheckoutService(ambiente.repo, planos, empresas(), charges);
}

let ambiente: ReturnType<typeof repositorio>;

beforeEach(() => {
  ambiente = repositorio();
});

describe("o preço cobrado é o do plano e da periodicidade pedidos", () => {
  const casos = [
    {
      nome: "Plus mensal",
      plano: PLUS,
      intervalo: "MONTHLY",
      esperado: PRECOS.plusMensal,
    },
    { nome: "Plus anual", plano: PLUS, intervalo: "YEARLY", esperado: PRECOS.plusAnual },
    { nome: "Pro mensal", plano: PRO, intervalo: "MONTHLY", esperado: PRECOS.proMensal },
    { nome: "Pro anual", plano: PRO, intervalo: "YEARLY", esperado: PRECOS.proAnual },
  ] as const;

  for (const caso of casos) {
    it(`${caso.nome} usa o priceId de ${caso.nome.toLowerCase()}`, async () => {
      const local = repositorio(
        tentativa({ intendedPlanId: caso.plano.id, billingInterval: caso.intervalo }),
      );
      const { gw, recebidos } = gateway();

      await servico(local, catalogo(caso.plano), gw).iniciarCheckout(
        { planId: caso.plano.id, billingInterval: caso.intervalo },
        EMPRESA,
      );

      // Um só, e exatamente o da combinação — nunca o do outro plano nem o da
      // outra periodicidade, que é o erro que cobra o valor errado.
      expect(recebidos).toEqual([caso.esperado]);
      for (const outro of Object.values(PRECOS)) {
        if (outro !== caso.esperado) expect(recebidos).not.toContain(outro);
      }
    });
  }

  it("plano sem preço remoto é recusado antes de qualquer chamada externa", async () => {
    const { gw } = gateway();

    await expect(
      servico(ambiente, catalogo(SEM_PRECO), gw).iniciarCheckout(
        { planId: SEM_PRECO.id, billingInterval: "MONTHLY" },
        EMPRESA,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(gw.createPixCharge).not.toHaveBeenCalled();
  });

  it("plano inexistente é recusado", async () => {
    const { gw } = gateway();

    await expect(
      servico(ambiente, catalogo(PLUS), gw).iniciarCheckout(
        { planId: "plan_que_nao_existe", billingInterval: "MONTHLY" },
        EMPRESA,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(gw.createPixCharge).not.toHaveBeenCalled();
  });
});

describe("o navegador não decide preço, empresa nem plano", () => {
  it("o schema aceita apenas planId e billingInterval", () => {
    const analisado = iniciarCheckoutSchema.parse({
      planId: PLUS.id,
      billingInterval: "MONTHLY",
      // Tudo abaixo é o que um cliente hostil tentaria enfiar.
      companyId: OUTRA_EMPRESA,
      price: "0.00",
      amount: 0,
      priceId: "price_forjado",
      subscriptionStatus: "ACTIVE",
      role: "OWNER",
    });

    expect(Object.keys(analisado).sort()).toEqual(["billingInterval", "planId"]);
  });

  it("periodicidade fora do enum é recusada", () => {
    expect(
      iniciarCheckoutSchema.safeParse({ planId: PLUS.id, billingInterval: "WEEKLY" })
        .success,
    ).toBe(false);
  });

  it("a action tira a empresa da sessão e nunca da entrada", () => {
    const fonte = semComentarios(
      join(process.cwd(), "app", "dashboard", "settings", "billing", "actions.ts"),
    );

    expect(fonte).toContain("requireCompany()");
    // Nenhuma leitura de empresa vinda do argumento.
    expect(fonte).not.toContain("input.companyId");
    expect(fonte).not.toContain("companyId: input");
    // E nada de preço ou status chegando de fora.
    expect(fonte).not.toContain("input.price");
    expect(fonte).not.toContain("subscriptionStatus");
  });

  it("o preço vem do banco: o service nunca lê valor do input", () => {
    const fonte = semComentarios(
      join(process.cwd(), "services", "SubscriptionCheckoutService.ts"),
    );

    expect(fonte).toContain("plano.validapayPriceMonthlyId");
    expect(fonte).toContain("plano.validapayPriceYearlyId");
    expect(fonte).not.toContain("input.priceId");
    expect(fonte).not.toContain("input.valor");
    expect(fonte).not.toContain("input.amount");
  });
});

describe("nada além de cobrança paga ativa plano", () => {
  const naoPagas = [
    { nome: "pendente", snapshot: cobranca({ status: "PENDING" }) },
    { nome: "em processamento", snapshot: cobranca({ status: "PROCESSING" }) },
    { nome: "recusada", snapshot: cobranca({ status: "DECLINED" }) },
    { nome: "expirada", snapshot: cobranca({ status: "EXPIRED" }) },
    { nome: "status desconhecido", snapshot: cobranca({ status: "QUALQUER_COISA" }) },
  ];

  for (const caso of naoPagas) {
    it(`cobrança ${caso.nome} não ativa`, async () => {
      const local = repositorio(tentativa({ externalChargeId: "cha_1" }));
      const { gw } = gateway(caso.snapshot);

      const ativou = await servico(local, catalogo(PLUS), gw).confirmarSeChargePago(
        "chk_1",
      );

      expect(ativou).toBe(false);
      expect(local.ativacoes).toHaveLength(0);
      expect(local.atual().status).toBe("PENDING");
    });
  }

  it("`paid` verdadeiro é a ÚNICA porta: o service testa isso e nada mais", () => {
    const fonte = semComentarios(
      join(process.cwd(), "services", "SubscriptionCheckoutService.ts"),
    );

    expect(fonte).toContain("if (!cobranca.paid) return false;");
    // Nenhum atalho por parâmetro de URL ou página de retorno.
    for (const proibido of ["searchParams", "success", "?paid", "returnUrl"]) {
      expect(fonte).not.toContain(proibido);
    }
  });

  it("só o service ativa — nenhuma rota ou action chama o claim direto", () => {
    const chamadores = [
      join(process.cwd(), "app", "api", "webhooks", "validapay", "route.ts"),
      join(process.cwd(), "app", "dashboard", "settings", "billing", "actions.ts"),
      join(process.cwd(), "app", "contratar", "route.ts"),
    ];

    for (const caminho of chamadores) {
      const fonte = semComentarios(caminho);
      expect(fonte).not.toContain("activateIfPending");
      expect(fonte).not.toContain("subscriptionStatus");
      expect(fonte).not.toContain("planId:");
    }
  });
});

describe("ativação: correta, uma vez, e do plano certo", () => {
  it("cobrança paga ativa exatamente o plano pretendido", async () => {
    const local = repositorio(
      tentativa({ externalChargeId: "cha_1", intendedPlanId: PLUS.id }),
    );
    const { gw } = gateway(
      cobranca({ status: "PAID", paid: true, subscriptionId: "sub_1" }),
    );

    const ativou = await servico(local, catalogo(PLUS), gw).confirmarSeChargePago(
      "chk_1",
    );

    expect(ativou).toBe(true);
    expect(local.ativacoes).toHaveLength(1);
    expect(local.ativacoes[0]).toMatchObject({
      companyId: EMPRESA.id,
      intendedPlanId: PLUS.id,
      validapaySubscriptionId: "sub_1",
    });
  });

  it("a mesma confirmação chegando duas vezes ativa uma vez", async () => {
    const local = repositorio(tentativa({ externalChargeId: "cha_1" }));
    const { gw } = gateway(cobranca({ status: "PAID", paid: true }));
    const service = servico(local, catalogo(PLUS), gw);

    const primeira = await service.confirmarSeChargePago("chk_1");
    const segunda = await service.confirmarSeChargePago("chk_1");

    expect(primeira).toBe(true);
    expect(segunda).toBe(false);
    expect(local.ativacoes).toHaveLength(1);
  });

  it("Plus ativa Plus — nunca Standard nem Pro", async () => {
    const local = repositorio(
      tentativa({ externalChargeId: "cha_1", intendedPlanId: PLUS.id }),
    );
    const { gw } = gateway(cobranca({ status: "PAID", paid: true }));

    await servico(local, catalogo(STANDARD, PLUS, PRO), gw).confirmarSeChargePago(
      "chk_1",
    );

    expect(local.ativacoes[0]!.intendedPlanId).toBe(PLUS.id);
    expect(local.ativacoes[0]!.intendedPlanId).not.toBe(STANDARD.id);
    expect(local.ativacoes[0]!.intendedPlanId).not.toBe(PRO.id);
  });

  it("Pro ativa Pro — nunca Standard nem Plus", async () => {
    const local = repositorio(
      tentativa({ externalChargeId: "cha_1", intendedPlanId: PRO.id }),
    );
    const { gw } = gateway(cobranca({ status: "PAID", paid: true }));

    await servico(local, catalogo(STANDARD, PLUS, PRO), gw).confirmarSeChargePago(
      "chk_1",
    );

    expect(local.ativacoes[0]!.intendedPlanId).toBe(PRO.id);
    expect(local.ativacoes[0]!.intendedPlanId).not.toBe(STANDARD.id);
    expect(local.ativacoes[0]!.intendedPlanId).not.toBe(PLUS.id);
  });

  it("o plano ativado é o da LINHA, não o que a cobrança devolveu", async () => {
    // Um provedor comprometido, ou um payload trocado, não escolhe plano: o
    // `intendedPlanId` foi gravado por nós antes de existir cobrança.
    const local = repositorio(
      tentativa({ externalChargeId: "cha_1", intendedPlanId: PLUS.id }),
    );
    const { gw } = gateway(
      cobranca({ status: "PAID", paid: true, subscriptionId: "sub_de_outro_plano" }),
    );

    await servico(local, catalogo(STANDARD, PLUS, PRO), gw).confirmarSeChargePago(
      "chk_1",
    );

    expect(local.ativacoes[0]!.intendedPlanId).toBe(PLUS.id);
  });
});

describe("falha confirmada encerra a tentativa, sem tocar na empresa", () => {
  it("cobrança não paga encerra a tentativa como FAILED", async () => {
    const local = repositorio(tentativa({ externalChargeId: "cha_1" }));
    const { gw } = gateway(cobranca({ status: "DECLINED" }));

    const ativou = await servico(local, catalogo(PLUS), gw).encerrarSeNaoPago("chk_1");

    expect(ativou).toBe(false);
    expect(local.atual().status).toBe("FAILED");
    expect(local.ativacoes).toHaveLength(0);
  });

  it("evento de falha sobre cobrança PAGA ativa em vez de encerrar", async () => {
    // A consulta manda, não o evento: fechar como falha aqui descartaria um
    // pagamento real por causa de uma entrega fora de ordem.
    const local = repositorio(tentativa({ externalChargeId: "cha_1" }));
    const { gw } = gateway(cobranca({ status: "PAID", paid: true }));

    const ativou = await servico(local, catalogo(PLUS), gw).encerrarSeNaoPago("chk_1");

    expect(ativou).toBe(true);
    expect(local.atual().status).toBe("COMPLETED");
    expect(local.chamadas.markFailed).toBe(0);
  });
});

describe("uma empresa não alcança a tentativa de outra", () => {
  it("consultar tentativa de outra empresa é NotFound, sem chamada externa", async () => {
    const local = repositorio(tentativa({ externalChargeId: "cha_1" }));
    const { gw } = gateway(cobranca({ status: "PAID", paid: true }));

    await expect(
      servico(local, catalogo(PLUS), gw).consultarParaExibicao("chk_1", OUTRA_EMPRESA),
    ).rejects.toBeInstanceOf(NotFoundError);

    // A empresa dona segue intacta: nada foi ativado por conta da tentativa.
    expect(gw.getCharge).not.toHaveBeenCalled();
    expect(local.ativacoes).toHaveLength(0);
    expect(local.atual().status).toBe("PENDING");
  });

  it("exigir tentativa de outra empresa é NotFound", async () => {
    const { gw } = gateway();

    await expect(
      servico(ambiente, catalogo(PLUS), gw).exigirTentativaDaEmpresa(
        "chk_1",
        OUTRA_EMPRESA,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("CTA da vitrine — uma regra para as duas telas", () => {
  function publico(
    overrides: Partial<PublicPlan> & Pick<PublicPlan, "slug">,
  ): PublicPlan {
    return {
      name: `Fluxy ${overrides.slug}`,
      priceMonthly: "49.00",
      priceYearly: "490.00",
      modules: [],
      maxUsers: null,
      maxOrdersPerMonth: null,
      maxProducts: null,
      maxCustomers: null,
      availableForCheckout: true,
      ...overrides,
    };
  }

  it("Standard leva ao cadastro gratuito", () => {
    const cta = resolverCtaDoPlano({
      plano: publico({ slug: DEFAULT_PLAN_SLUG, name: "Fluxy Standard" }),
      cobranca: "monthly",
    });

    expect(cta).toEqual({
      tipo: "trial",
      href: "/register?plan=standard&billing=monthly",
      rotulo: "Começar com o Fluxy Standard",
    });
  });

  it("plano pago com preço remoto leva à contratação, não ao cadastro", () => {
    for (const slug of ["plus", "pro"] as const) {
      const cta = resolverCtaDoPlano({
        plano: publico({ slug, availableForCheckout: true }),
        cobranca: "yearly",
      });

      expect(cta.tipo).toBe("assinar");
      if (cta.tipo !== "assinar") throw new Error("tipo inesperado");
      expect(cta.href).toBe(`/contratar?plan=${slug}&billing=yearly`);
      expect(cta.href).not.toContain("/register");
    }
  });

  it("plano pago sem preço remoto fica indisponível", () => {
    for (const slug of ["plus", "pro"] as const) {
      const cta = resolverCtaDoPlano({
        plano: publico({ slug, availableForCheckout: false }),
        cobranca: "monthly",
      });

      expect(cta.tipo).toBe("indisponivel");
      if (cta.tipo !== "indisponivel") throw new Error("tipo inesperado");
      expect(cta.rotulo).toBe("Em breve");
    }
  });

  it("nenhum plano pago produz URL de cadastro, em nenhuma periodicidade", () => {
    for (const slug of ["plus", "pro"] as const) {
      for (const cobranca of ["monthly", "yearly"] as const) {
        for (const disponivel of [true, false]) {
          const cta = resolverCtaDoPlano({
            plano: publico({ slug, availableForCheckout: disponivel }),
            cobranca,
          });

          if (cta.tipo !== "indisponivel") {
            expect(cta.href).not.toContain("/register");
          }
        }
      }
    }
  });

  it("o teste grátis segue sendo só do Standard", () => {
    expect(planHasTrial(DEFAULT_PLAN_SLUG)).toBe(true);
    expect(planHasTrial("plus")).toBe(false);
    expect(planHasTrial("pro")).toBe(false);
  });

  it("as duas telas usam a mesma função, sem regra própria", () => {
    const telas = [
      join(
        process.cwd(),
        "app",
        "(marketing)",
        "plans",
        "_components",
        "PlansPricing.tsx",
      ),
      join(process.cwd(), "app", "(marketing)", "_components", "PlansSection.tsx"),
    ];

    for (const caminho of telas) {
      const fonte = semComentarios(caminho);
      expect(fonte).toContain("resolverCtaDoPlano");
      // Sem lista de slugs escrita à mão, que foi o defeito original.
      expect(fonte).not.toContain('=== "plus"');
      expect(fonte).not.toContain('=== "pro"');
      expect(fonte).not.toContain("availableForCheckout");
    }
  });
});

describe("a rota pública de contratação só encaminha", () => {
  const CAMINHO = join(process.cwd(), "app", "contratar", "route.ts");

  it("revalida a intenção e não confia na query", () => {
    const fonte = semComentarios(CAMINHO);

    expect(fonte).toContain("parsePlanIntent(");
    // Os dois destinos saem de helpers sobre constantes de rota.
    expect(fonte).toContain("buildLoginUrl(intencao)");
    expect(fonte).toContain("buildCheckoutUrl(intencao)");
  });

  it("não aceita destino vindo de fora", () => {
    const fonte = semComentarios(CAMINHO);

    // As formas em que um destino externo chegaria: parâmetro de query ou
    // leitura direta. `next` solto não serve como proibição — casaria com o
    // import de `next/server`.
    for (const proibido of [
      "callbackUrl",
      "redirectTo",
      "returnUrl",
      "next=",
      'get("next")',
      'get("redirect")',
    ]) {
      expect(fonte).not.toContain(proibido);
    }
  });

  it("não escreve nada: sem service, sem prisma, sem ativação", () => {
    const fonte = semComentarios(CAMINHO);

    for (const proibido of ["prisma", "Service", "activate", "update", "create"]) {
      expect(fonte).not.toContain(proibido);
    }
  });
});

function semComentarios(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}
