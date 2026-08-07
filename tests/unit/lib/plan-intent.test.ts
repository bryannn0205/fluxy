import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildLoginUrl,
  buildRegisterUrl,
  parsePlanIntent,
  type PlanIntent,
  type PlanIntentInput,
} from "@/lib/plan-intent";

/**
 * Código do módulo, sem comentários.
 *
 * Os testes estruturais abaixo procuram termos proibidos no fonte, e a
 * documentação do próprio módulo cita esses termos justamente para explicar
 * que eles não existem. Sem remover comentários, a explicação correta faria
 * o teste acusar o que ela nega.
 */
function codigoDoModulo(): string {
  return readFileSync(join(process.cwd(), "lib", "plan-intent.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("parsePlanIntent — combinações válidas", () => {
  it("aceita standard + monthly", () => {
    expect(parsePlanIntent({ plan: "standard", billing: "monthly" })).toEqual({
      plan: "standard",
      billing: "monthly",
    });
  });

  it("aceita standard + yearly", () => {
    expect(parsePlanIntent({ plan: "standard", billing: "yearly" })).toEqual({
      plan: "standard",
      billing: "yearly",
    });
  });

  it("aceita pro + monthly", () => {
    expect(parsePlanIntent({ plan: "pro", billing: "monthly" })).toEqual({
      plan: "pro",
      billing: "monthly",
    });
  });

  it("aceita pro + yearly", () => {
    expect(parsePlanIntent({ plan: "pro", billing: "yearly" })).toEqual({
      plan: "pro",
      billing: "yearly",
    });
  });
});

describe("parsePlanIntent — rejeições", () => {
  it("recusa plano desconhecido", () => {
    expect(parsePlanIntent({ plan: "enterprise", billing: "monthly" })).toBeNull();
    expect(parsePlanIntent({ plan: "free", billing: "monthly" })).toBeNull();
  });

  it("recusa periodicidade desconhecida em vez de adivinhar", () => {
    // Distinto de ausente: um valor escrito e inexistente indica link quebrado
    // ou adulteração, e adivinhar aí seria pior que desistir da intenção.
    expect(parsePlanIntent({ plan: "pro", billing: "weekly" })).toBeNull();
    expect(parsePlanIntent({ plan: "pro", billing: "anual" })).toBeNull();
  });

  it("recusa plano ausente, mesmo com periodicidade válida", () => {
    expect(parsePlanIntent({ billing: "yearly" })).toBeNull();
    expect(parsePlanIntent({})).toBeNull();
    expect(parsePlanIntent({ plan: undefined, billing: "monthly" })).toBeNull();
  });

  it("recusa string vazia nos dois campos", () => {
    expect(parsePlanIntent({ plan: "", billing: "monthly" })).toBeNull();
    expect(parsePlanIntent({ plan: "standard", billing: "" })).toBeNull();
  });

  it("recusa caixa diferente, sem normalizar em silêncio", () => {
    // Decisão documentada: comparação exata. Nossos próprios links sempre
    // emitem minúsculas, então caixa diferente significa URL que não saiu
    // daqui. Quem digita à mão apenas fica sem plano pré-selecionado — uma
    // degradação suave, não um erro.
    expect(parsePlanIntent({ plan: "STANDARD", billing: "monthly" })).toBeNull();
    expect(parsePlanIntent({ plan: "Pro", billing: "monthly" })).toBeNull();
    expect(parsePlanIntent({ plan: "pro", billing: "MONTHLY" })).toBeNull();
  });

  it("recusa espaços em volta, sem aparar em silêncio", () => {
    expect(parsePlanIntent({ plan: " standard", billing: "monthly" })).toBeNull();
    expect(parsePlanIntent({ plan: "pro ", billing: "monthly" })).toBeNull();
    expect(parsePlanIntent({ plan: " pro ", billing: "monthly" })).toBeNull();
    expect(parsePlanIntent({ plan: "pro", billing: " yearly" })).toBeNull();
  });

  it("recusa array, sem cair no truque de pegar o primeiro", () => {
    // ?plan=standard&plan=pro entrega um array. Aceitar o primeiro (ou o
    // último) elemento é exatamente como a poluição de parâmetro passa.
    expect(parsePlanIntent({ plan: ["standard", "pro"], billing: "monthly" })).toBeNull();
    expect(parsePlanIntent({ plan: ["pro"], billing: "monthly" })).toBeNull();
    expect(parsePlanIntent({ plan: "pro", billing: ["monthly", "yearly"] })).toBeNull();
  });

  it("recusa tipos que não são string", () => {
    expect(parsePlanIntent({ plan: 1, billing: "monthly" })).toBeNull();
    expect(parsePlanIntent({ plan: true, billing: "monthly" })).toBeNull();
    expect(parsePlanIntent({ plan: null, billing: "monthly" })).toBeNull();
    expect(
      parsePlanIntent({ plan: { toString: () => "pro" }, billing: "monthly" }),
    ).toBeNull();
  });
});

describe("parsePlanIntent — periodicidade ausente", () => {
  it("assume monthly quando o plano é válido e a cobrança não veio", () => {
    expect(parsePlanIntent({ plan: "pro" })).toEqual({
      plan: "pro",
      billing: "monthly",
    });
    expect(parsePlanIntent({ plan: "standard", billing: undefined })).toEqual({
      plan: "standard",
      billing: "monthly",
    });
  });

  it("nunca assume yearly, que é o compromisso maior", () => {
    expect(parsePlanIntent({ plan: "pro" })?.billing).not.toBe("yearly");
  });
});

describe("parsePlanIntent — campos não permitidos", () => {
  // Um searchParams real do Next, com tudo que um atacante tentaria enfiar.
  const searchParamsHostil: PlanIntentInput & Record<string, unknown> = {
    plan: "pro",
    billing: "yearly",
    planId: "plan_cmsi36c1000012ktvz65ilzjk",
    price: "0.00",
    priceMonthly: "1.00",
    subscriptionStatus: "ACTIVE",
    companyId: "cmsi36c1000012ktvz65ilzjk",
    trialEndsAt: "2099-01-01",
    role: "OWNER",
    next: "https://site-malicioso.example",
    redirectTo: "/dashboard",
  };

  it("descarta planId, price e subscriptionStatus arbitrários", () => {
    const intent = parsePlanIntent(searchParamsHostil);

    expect(intent).toEqual({ plan: "pro", billing: "yearly" });
    expect(intent).not.toHaveProperty("planId");
    expect(intent).not.toHaveProperty("price");
    expect(intent).not.toHaveProperty("subscriptionStatus");
  });

  it("devolve exatamente duas chaves, quaisquer que sejam as extras", () => {
    const intent = parsePlanIntent(searchParamsHostil);

    expect(Object.keys(intent!).sort()).toEqual(["billing", "plan"]);
  });

  it("não deixa parâmetro extra chegar às URLs geradas", () => {
    const intent = parsePlanIntent(searchParamsHostil);

    expect(buildRegisterUrl(intent)).toBe("/register?plan=pro&billing=yearly");
    expect(buildLoginUrl(intent)).toBe("/login?plan=pro&billing=yearly");
  });
});

describe("parsePlanIntent — pureza", () => {
  it("não altera o objeto recebido", () => {
    const entrada: PlanIntentInput = { plan: "pro", billing: "yearly" };
    const copia = structuredClone(entrada);

    parsePlanIntent(entrada);

    expect(entrada).toEqual(copia);
  });

  it("suporta entrada congelada — prova que não escreve nela", () => {
    const congelada = Object.freeze({ plan: "standard", billing: "yearly" });

    expect(() => parsePlanIntent(congelada)).not.toThrow();
    expect(parsePlanIntent(congelada)).toEqual({
      plan: "standard",
      billing: "yearly",
    });
  });

  it("é determinística", () => {
    const entrada = { plan: "pro", billing: "monthly" };
    const resultados = Array.from({ length: 5 }, () => parsePlanIntent(entrada));

    for (const resultado of resultados) {
      expect(resultado).toEqual(resultados[0]);
    }
  });

  it("devolve objeto serializável", () => {
    const intent = parsePlanIntent({ plan: "pro", billing: "yearly" });

    expect(JSON.parse(JSON.stringify(intent))).toEqual(intent);
  });

  it("é síncrona — não haveria como consultar banco sem ser assíncrona", () => {
    expect(parsePlanIntent({ plan: "pro" })).not.toBeInstanceOf(Promise);
  });

  it("o módulo não importa banco, service, repositório nem contexto de request", () => {
    // Teste de arquitetura: a garantia de que a intenção não concede plano é
    // ESTRUTURAL, não uma checagem em runtime que se possa esquecer. Se este
    // teste falhar, alguém deu a esta camada um caminho até o estado da
    // aplicação — e é isso que precisa ser revertido, não o teste.
    const fonte = codigoDoModulo();

    for (const proibido of [
      "@/lib/db",
      "@/services",
      "@/repositories",
      "@/lib/auth",
      "@/lib/session",
      "next/headers",
      "next/navigation",
      "prisma",
    ]) {
      expect(fonte).not.toContain(`from "${proibido}`);
    }
  });
});

describe("parsePlanIntent — Pro não concede nada", () => {
  it("descreve a intenção sem tocar em assinatura", () => {
    const intent = parsePlanIntent({ plan: "pro", billing: "yearly" });

    // O retorno é descritivo e nada mais: não há planId, status nem limite.
    expect(intent).toEqual({ plan: "pro", billing: "yearly" });
    expect(intent).not.toHaveProperty("planId");
    expect(intent).not.toHaveProperty("maxUsers");
    expect(intent).not.toHaveProperty("subscriptionStatus");
  });

  it("trata pro e standard pelo mesmo caminho, sem privilégio", () => {
    const pro = parsePlanIntent({ plan: "pro", billing: "monthly" });
    const standard = parsePlanIntent({ plan: "standard", billing: "monthly" });

    expect(Object.keys(pro!)).toEqual(Object.keys(standard!));
    expect(buildRegisterUrl(pro).replace("pro", "X")).toBe(
      buildRegisterUrl(standard).replace("standard", "X"),
    );
  });
});

describe("helpers de URL", () => {
  it("monta a URL de cadastro", () => {
    expect(buildRegisterUrl({ plan: "standard", billing: "monthly" })).toBe(
      "/register?plan=standard&billing=monthly",
    );
  });

  it("monta a URL de login", () => {
    expect(buildLoginUrl({ plan: "pro", billing: "yearly" })).toBe(
      "/login?plan=pro&billing=yearly",
    );
  });

  it("sem intenção, devolve a rota limpa", () => {
    expect(buildRegisterUrl(null)).toBe("/register");
    expect(buildLoginUrl(null)).toBe("/login");
  });

  it("gera apenas caminhos internos — nunca host externo", () => {
    const urls = [
      buildRegisterUrl({ plan: "pro", billing: "yearly" }),
      buildLoginUrl({ plan: "standard", billing: "monthly" }),
      buildRegisterUrl(null),
    ];

    for (const url of urls) {
      expect(url.startsWith("/")).toBe(true);
      // "//host" é caminho relativo a protocolo — sairia do site.
      expect(url.startsWith("//")).toBe(false);
      expect(url).not.toMatch(/^[a-z]+:/i);
      expect(url).not.toContain("://");
    }
  });

  it("não aceita destino externo porque não existe parâmetro de redirect", () => {
    const fonte = codigoDoModulo();

    // Open redirect é evitado por ausência de superfície, não por filtro.
    for (const parametro of ["redirectTo", "callbackUrl", "next=", "returnUrl"]) {
      expect(fonte).not.toContain(parametro);
    }
  });

  it("codifica caracteres especiais se um valor não validado chegar", () => {
    // Forjado: o tipo impede isso, e o teste existe para o dia em que alguém
    // contornar o tipo. A URL precisa sair escapada, não crua.
    const forjado = {
      plan: 'pro"><script>alert(1)</script>',
      billing: "monthly",
    } as unknown as PlanIntent;

    const url = buildRegisterUrl(forjado);

    expect(url).not.toContain("<script>");
    expect(url).not.toContain('"');
    expect(url).toContain("%3Cscript%3E");
  });

  it("codifica espaço e e-comercial sem quebrar a query", () => {
    const forjado = {
      plan: "pro&subscriptionStatus=ACTIVE",
      billing: "monthly",
    } as unknown as PlanIntent;

    const url = buildRegisterUrl(forjado);
    const parametros = new URLSearchParams(url.split("?")[1]);

    // O "&" injetado não vira um parâmetro novo: continua dentro do valor.
    expect([...parametros.keys()].sort()).toEqual(["billing", "plan"]);
    expect(parametros.get("subscriptionStatus")).toBeNull();
  });
});

describe("ida e volta", () => {
  it("o que o helper gera, o parser aceita de volta", () => {
    const original: PlanIntent = { plan: "pro", billing: "yearly" };
    const url = buildRegisterUrl(original);
    const parametros = new URLSearchParams(url.split("?")[1]);

    // Simula a revalidação obrigatória na próxima fronteira de servidor:
    // a página seguinte não confia no que a anterior validou.
    expect(
      parsePlanIntent({
        plan: parametros.get("plan"),
        billing: parametros.get("billing"),
      }),
    ).toEqual(original);
  });
});
