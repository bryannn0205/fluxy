import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Company, SubscriptionStatus } from "@/lib/generated/prisma/client";
import type { ChargeSnapshot, ValidaPayChargesGateway } from "@/lib/validapay/charges";
import type {
  SubscriptionSnapshot,
  ValidaPaySubscriptionsGateway,
} from "@/lib/validapay/subscriptions";
import type {
  CompanyRepository,
  TransitionSubscriptionStatusInput,
} from "@/repositories/interfaces/CompanyRepository";
import { SubscriptionLifecycleService } from "@/services/SubscriptionLifecycleService";

import { buildCompany } from "../../helpers/company";

/**
 * Ciclo de vida da assinatura depois do primeiro pagamento.
 *
 * A regra que estes testes protegem acima de todas: **cancelar não corta acesso
 * pago.** A ValidaPay cancela ao fim do período, e foi medido em sandbox que
 * `status` continua `"ACTIVE"` enquanto isso. Cortar na solicitação retiraria
 * serviço que o cliente pagou.
 *
 * O segundo perigo é o inverso: manter `ACTIVE` para sempre. Daí os testes de
 * data efetiva alcançada e de reconciliação suprindo webhook perdido.
 */

const ID_ASSINATURA = "sub_1786965610230_n6sleitaz";
const AGORA = new Date("2026-08-20T10:00:00Z");
/** Da assinatura real: `cancellation.effectiveAt`. */
const EFETIVO_EM = new Date("2026-09-17T11:20:14.991Z");

function empresa(overrides: Partial<Company> = {}): Company {
  return buildCompany({
    id: "company_a",
    validapaySubscriptionId: ID_ASSINATURA,
    subscriptionStatus: "ACTIVE",
    planId: "plan_plus",
    ...overrides,
  });
}

function assinatura(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    subscriptionId: ID_ASSINATURA,
    status: "ACTIVE",
    cancelamentoAgendado: false,
    cancelamentoEfetivoEm: null,
    cancelamentoImediato: false,
    cicloAtualPago: true,
    metadata: {},
    ...overrides,
  };
}

function cobranca(overrides: Partial<ChargeSnapshot> = {}): ChargeSnapshot {
  return {
    chargeId: "cha_ciclo_2",
    status: "PENDING",
    paid: false,
    subscriptionId: ID_ASSINATURA,
    paymentId: null,
    paidAt: null,
    pix: null,
    ...overrides,
  };
}

/** Repositório com o mesmo contrato condicional do Prisma. */
function repositorio(inicial: Company = empresa()) {
  let linha = { ...inicial };
  const transicoes: TransitionSubscriptionStatusInput[] = [];

  const repo: CompanyRepository = {
    findById: async (id) => (id === linha.id ? linha : null),
    findByEmail: async () => null,
    createWithOwner: async () => linha,
    update: async () => linha,
    incrementOrderNumber: async () => 1,
    findPlanByCompany: async () => null,
    findByValidapaySubscriptionId: async (subscriptionId) =>
      linha.validapaySubscriptionId === subscriptionId ? linha : null,
    // Condicional ao estado de partida, como o UPDATE ... WHERE do Prisma: é o
    // que dá idempotência sem guardar "já processei".
    transitionSubscriptionStatus: async (input) => {
      transicoes.push(input);
      if (
        input.companyId !== linha.id ||
        !input.from.includes(linha.subscriptionStatus)
      ) {
        return false;
      }
      linha = { ...linha, subscriptionStatus: input.to };
      return true;
    },
    listForLifecycleReview: async () =>
      linha.validapaySubscriptionId !== null &&
      (["ACTIVE", "PAST_DUE"] as SubscriptionStatus[]).includes(linha.subscriptionStatus)
        ? [linha]
        : [],
  };

  return { repo, transicoes, atual: () => linha };
}

function assinaturas(snapshot: SubscriptionSnapshot = assinatura()) {
  return {
    getSubscription: vi.fn(async () => snapshot),
  } satisfies ValidaPaySubscriptionsGateway & {
    getSubscription: ReturnType<typeof vi.fn>;
  };
}

function cobrancas(snapshot: ChargeSnapshot = cobranca()) {
  return {
    createPixCharge: vi.fn(),
    getCharge: vi.fn(async () => snapshot),
  } as unknown as ValidaPayChargesGateway & { getCharge: ReturnType<typeof vi.fn> };
}

function servico(
  ambiente: ReturnType<typeof repositorio>,
  gwAssinaturas: ValidaPaySubscriptionsGateway,
  gwCobrancas: ValidaPayChargesGateway = cobrancas(),
) {
  return new SubscriptionLifecycleService(
    ambiente.repo,
    gwAssinaturas,
    gwCobrancas,
    () => AGORA,
  );
}

let ambiente: ReturnType<typeof repositorio>;

beforeEach(() => {
  ambiente = repositorio();
});

describe("cancelamento agendado não corta acesso pago", () => {
  const agendada = assinatura({
    cancelamentoAgendado: true,
    cancelamentoEfetivoEm: EFETIVO_EM,
  });

  it("antes da data efetiva a empresa continua ACTIVE", async () => {
    const resultado = await servico(ambiente, assinaturas(agendada)).revisarEmpresa(
      empresa(),
    );

    expect(resultado).toBe("CANCELAMENTO_AGENDADO");
    expect(ambiente.atual().subscriptionStatus).toBe("ACTIVE");
  });

  it("nada é gravado antes da data efetiva", async () => {
    await servico(ambiente, assinaturas(agendada)).revisarEmpresa(empresa());

    expect(ambiente.transicoes).toHaveLength(0);
  });

  it("não recria trial e não altera planId", async () => {
    const antes = ambiente.atual();

    await servico(ambiente, assinaturas(agendada)).revisarEmpresa(empresa());

    const depois = ambiente.atual();
    expect(depois.planId).toBe(antes.planId);
    expect(depois.trialEndsAt).toEqual(antes.trialEndsAt);
  });

  it("cancelamento sem data efetiva também não corta acesso", async () => {
    const semData = assinatura({
      cancelamentoAgendado: true,
      cancelamentoEfetivoEm: null,
    });

    const resultado = await servico(ambiente, assinaturas(semData)).revisarEmpresa(
      empresa(),
    );

    expect(resultado).toBe("CANCELAMENTO_AGENDADO");
    expect(ambiente.atual().subscriptionStatus).toBe("ACTIVE");
  });
});

describe("data efetiva alcançada", () => {
  const vencida = assinatura({
    cancelamentoAgendado: true,
    // Um dia antes de AGORA.
    cancelamentoEfetivoEm: new Date("2026-08-19T10:00:00Z"),
  });

  it("passa a CANCELED preservando plano e trial", async () => {
    const antes = ambiente.atual();

    const resultado = await servico(ambiente, assinaturas(vencida)).revisarEmpresa(
      empresa(),
    );

    expect(resultado).toBe("CANCELADA");
    const depois = ambiente.atual();
    expect(depois.subscriptionStatus).toBe("CANCELED");
    expect(depois.planId).toBe(antes.planId);
    expect(depois.trialEndsAt).toEqual(antes.trialEndsAt);
  });

  it("cancelamento imediato não espera data", async () => {
    const imediata = assinatura({
      cancelamentoAgendado: true,
      cancelamentoImediato: true,
      cancelamentoEfetivoEm: EFETIVO_EM,
    });

    const resultado = await servico(ambiente, assinaturas(imediata)).revisarEmpresa(
      empresa(),
    );

    expect(resultado).toBe("CANCELADA");
    expect(ambiente.atual().subscriptionStatus).toBe("CANCELED");
  });

  it("a segunda execução é no-op", async () => {
    const service = servico(ambiente, assinaturas(vencida));

    const primeira = await service.revisarEmpresa(ambiente.atual());
    const segunda = await service.revisarEmpresa(ambiente.atual());

    expect(primeira).toBe("CANCELADA");
    expect(segunda).toBe("SEM_MUDANCA");
    expect(ambiente.atual().subscriptionStatus).toBe("CANCELED");
  });

  it("empresa em PAST_DUE também é cancelada na data", async () => {
    const local = repositorio(empresa({ subscriptionStatus: "PAST_DUE" }));

    const resultado = await servico(local, assinaturas(vencida)).revisarEmpresa(
      local.atual(),
    );

    expect(resultado).toBe("CANCELADA");
    expect(local.atual().subscriptionStatus).toBe("CANCELED");
  });
});

describe("renovação falhada leva a PAST_DUE, nunca a CANCELED", () => {
  it("falha comprovada na cobrança marca PAST_DUE", async () => {
    const resultado = await servico(
      ambiente,
      assinaturas(),
      cobrancas(cobranca({ status: "DECLINED" })),
    ).registrarFalhaDeCiclo(ID_ASSINATURA, "cha_ciclo_2");

    expect(resultado).toBe("INADIMPLENTE");
    expect(ambiente.atual().subscriptionStatus).toBe("PAST_DUE");
  });

  it("nunca vai direto para CANCELED", async () => {
    await servico(
      ambiente,
      assinaturas(),
      cobrancas(cobranca({ status: "DECLINED" })),
    ).registrarFalhaDeCiclo(ID_ASSINATURA, "cha_ciclo_2");

    expect(ambiente.transicoes.every((t) => t.to !== "CANCELED")).toBe(true);
  });

  it("falha duplicada é idempotente", async () => {
    const service = servico(
      ambiente,
      assinaturas(),
      cobrancas(cobranca({ status: "DECLINED" })),
    );

    const primeira = await service.registrarFalhaDeCiclo(ID_ASSINATURA, "cha_ciclo_2");
    const segunda = await service.registrarFalhaDeCiclo(ID_ASSINATURA, "cha_ciclo_2");

    expect(primeira).toBe("INADIMPLENTE");
    expect(segunda).toBe("SEM_MUDANCA");
    expect(ambiente.atual().subscriptionStatus).toBe("PAST_DUE");
  });

  it("evento de falha sobre cobrança PAGA não penaliza a empresa", async () => {
    // A fonte manda: entrega fora de ordem não pode marcar inadimplência.
    const resultado = await servico(
      ambiente,
      assinaturas(),
      cobrancas(cobranca({ status: "PAID", paid: true })),
    ).registrarFalhaDeCiclo(ID_ASSINATURA, "cha_ciclo_2");

    expect(resultado).toBe("SEM_MUDANCA");
    expect(ambiente.atual().subscriptionStatus).toBe("ACTIVE");
  });

  it("empresa já CANCELED não regride para PAST_DUE", async () => {
    const local = repositorio(empresa({ subscriptionStatus: "CANCELED" }));

    const resultado = await servico(
      local,
      assinaturas(),
      cobrancas(cobranca({ status: "DECLINED" })),
    ).registrarFalhaDeCiclo(ID_ASSINATURA, "cha_ciclo_2");

    expect(resultado).toBe("SEM_MUDANCA");
    expect(local.atual().subscriptionStatus).toBe("CANCELED");
  });
});

describe("recuperação de PAST_DUE", () => {
  it("ciclo corrente pago devolve ACTIVE", async () => {
    const local = repositorio(empresa({ subscriptionStatus: "PAST_DUE" }));

    const resultado = await servico(
      local,
      assinaturas(assinatura({ cicloAtualPago: true })),
    ).revisarEmpresa(local.atual());

    expect(resultado).toBe("REATIVADA");
    expect(local.atual().subscriptionStatus).toBe("ACTIVE");
  });

  it("ciclo não confirmado como pago mantém PAST_DUE", async () => {
    const local = repositorio(empresa({ subscriptionStatus: "PAST_DUE" }));

    const resultado = await servico(
      local,
      assinaturas(assinatura({ cicloAtualPago: false })),
    ).revisarEmpresa(local.atual());

    expect(resultado).toBe("SEM_MUDANCA");
    expect(local.atual().subscriptionStatus).toBe("PAST_DUE");
  });

  it("recuperação duplicada é idempotente", async () => {
    const local = repositorio(empresa({ subscriptionStatus: "PAST_DUE" }));
    const service = servico(local, assinaturas(assinatura({ cicloAtualPago: true })));

    await service.revisarEmpresa(local.atual());
    const segunda = await service.revisarEmpresa(local.atual());

    expect(segunda).toBe("SEM_MUDANCA");
    expect(local.atual().subscriptionStatus).toBe("ACTIVE");
  });

  it("empresa CANCELED não volta a ACTIVE por ciclo pago", async () => {
    const local = repositorio(empresa({ subscriptionStatus: "CANCELED" }));

    const resultado = await servico(
      local,
      assinaturas(assinatura({ cicloAtualPago: true })),
    ).revisarEmpresa(local.atual());

    expect(resultado).toBe("SEM_MUDANCA");
    expect(local.atual().subscriptionStatus).toBe("CANCELED");
  });
});

describe("correlação e isolamento", () => {
  it("empresa sem validapaySubscriptionId não é tratada", async () => {
    const local = repositorio(empresa({ validapaySubscriptionId: null }));
    const gw = assinaturas();

    const resultado = await servico(local, gw).revisarEmpresa(local.atual());

    expect(resultado).toBe("SEM_ASSINATURA");
    // Nem chega a consultar: não há o que consultar.
    expect(gw.getSubscription).not.toHaveBeenCalled();
    expect(local.transicoes).toHaveLength(0);
  });

  it("assinatura desconhecida não altera empresa nenhuma", async () => {
    const resultado = await servico(ambiente, assinaturas()).revisarPorAssinatura(
      "sub_de_outra_conta",
    );

    expect(resultado).toBe("NAO_CORRELACIONADA");
    expect(ambiente.transicoes).toHaveLength(0);
    expect(ambiente.atual().subscriptionStatus).toBe("ACTIVE");
  });

  it("falha de ciclo de assinatura desconhecida não penaliza ninguém", async () => {
    const resultado = await servico(
      ambiente,
      assinaturas(),
      cobrancas(cobranca({ status: "DECLINED" })),
    ).registrarFalhaDeCiclo("sub_de_outra_conta", "cha_x");

    expect(resultado).toBe("NAO_CORRELACIONADA");
    expect(ambiente.atual().subscriptionStatus).toBe("ACTIVE");
  });

  it("a transição sempre nomeia a empresa correlacionada, nunca outra", async () => {
    const vencida = assinatura({
      cancelamentoAgendado: true,
      cancelamentoEfetivoEm: new Date("2026-08-19T10:00:00Z"),
    });

    await servico(ambiente, assinaturas(vencida)).revisarPorAssinatura(ID_ASSINATURA);

    expect(ambiente.transicoes).toHaveLength(1);
    expect(ambiente.transicoes[0]!.companyId).toBe("company_a");
  });
});

describe("reconciliação supre webhook perdido", () => {
  it("efetiva o cancelamento sem nenhum evento ter chegado", async () => {
    const vencida = assinatura({
      cancelamentoAgendado: true,
      cancelamentoEfetivoEm: new Date("2026-08-19T10:00:00Z"),
    });

    const resumo = await servico(
      ambiente,
      assinaturas(vencida),
    ).revisarAssinaturasDaEmpresa("company_a");

    expect(resumo).toMatchObject({ reviewed: 1, canceled: 1, failed: 0 });
    expect(ambiente.atual().subscriptionStatus).toBe("CANCELED");
  });

  it("conta cancelamento agendado sem alterar estado", async () => {
    const resumo = await servico(
      ambiente,
      assinaturas(
        assinatura({ cancelamentoAgendado: true, cancelamentoEfetivoEm: EFETIVO_EM }),
      ),
    ).revisarAssinaturasDaEmpresa("company_a");

    expect(resumo).toMatchObject({ reviewed: 1, cancelScheduled: 1, canceled: 0 });
    expect(ambiente.atual().subscriptionStatus).toBe("ACTIVE");
  });

  it("recupera PAST_DUE que voltou a pagar", async () => {
    const local = repositorio(empresa({ subscriptionStatus: "PAST_DUE" }));

    const resumo = await servico(
      local,
      assinaturas(assinatura({ cicloAtualPago: true })),
    ).revisarAssinaturasDaEmpresa("company_a");

    expect(resumo).toMatchObject({ reviewed: 1, reactivated: 1 });
    expect(local.atual().subscriptionStatus).toBe("ACTIVE");
  });

  it("empresa em TRIALING não entra na revisão", async () => {
    const local = repositorio(empresa({ subscriptionStatus: "TRIALING" }));

    const resumo = await servico(local, assinaturas()).revisarAssinaturasDaEmpresa(
      "company_a",
    );

    expect(resumo.reviewed).toBe(0);
    expect(local.atual().subscriptionStatus).toBe("TRIALING");
  });

  it("falha de consulta não derruba o lote", async () => {
    const gw = {
      getSubscription: vi.fn(async () => {
        throw new Error("indisponível");
      }),
    } as unknown as ValidaPaySubscriptionsGateway;

    const resumo = await servico(ambiente, gw).revisarAssinaturasDaEmpresa("company_a");

    expect(resumo).toMatchObject({ reviewed: 1, failed: 1, canceled: 0 });
    expect(ambiente.atual().subscriptionStatus).toBe("ACTIVE");
  });
});
