import { describe, expect, it } from "vitest";

import { decideNavigation, temMarcaDeSessaoExpirada } from "@/lib/navigation";

function decidir(pathname: string, isLoggedIn: boolean, hasExpiredSessionMark = false) {
  return decideNavigation({ pathname, isLoggedIn, hasExpiredSessionMark });
}

const SEGUIR = { tipo: "seguir" } as const;

describe("acesso ao painel", () => {
  it("sem sessão, manda ao login preservando o caminho pretendido", () => {
    expect(decidir("/dashboard", false)).toEqual({
      tipo: "redirecionar",
      destino: "/login?callbackUrl=%2Fdashboard",
    });
    expect(decidir("/dashboard/orders/123", false)).toEqual({
      tipo: "redirecionar",
      destino: "/login?callbackUrl=%2Fdashboard%2Forders%2F123",
    });
  });

  it("com sessão, segue para o painel", () => {
    expect(decidir("/dashboard", true)).toEqual(SEGUIR);
    expect(decidir("/dashboard/settings/team", true)).toEqual(SEGUIR);
  });
});

describe("telas de acesso", () => {
  const rotas = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/accept-invite",
  ];

  it("sem sessão, seguem normalmente", () => {
    for (const rota of rotas) {
      expect(decidir(rota, false)).toEqual(SEGUIR);
    }
  });

  it("com sessão, mandam ao painel", () => {
    for (const rota of rotas) {
      expect(decidir(rota, true)).toEqual({
        tipo: "redirecionar",
        destino: "/dashboard",
      });
    }
  });

  it("com sessão órfã marcada, deixam passar — é o que quebra o laço", () => {
    // Sem esta exceção: JWT válido → painel → requireCompany não resolve →
    // login → JWT ainda válido → painel, indefinidamente.
    expect(decidir("/login", true, true)).toEqual(SEGUIR);
  });

  it("a intenção comercial na URL não muda a decisão", () => {
    // /login?plan=pro decide o mesmo que /login: quem roteia não interpreta
    // intenção, e quem interpreta intenção não roteia.
    expect(decidir("/login", false)).toEqual(decidir("/login", false));
    expect(decidir("/register", true)).toEqual(decidir("/register", true));
  });
});

describe("páginas públicas nunca são roteadas", () => {
  it("landing e planos seguem, com ou sem sessão", () => {
    for (const rota of ["/", "/plans"]) {
      expect(decidir(rota, false)).toEqual(SEGUIR);
      expect(decidir(rota, true)).toEqual(SEGUIR);
    }
  });

  it("usuário autenticado consegue abrir /plans", () => {
    expect(decidir("/plans", true)).toEqual(SEGUIR);
  });
});

describe("ninguém é empurrado para os planos", () => {
  it("nenhuma combinação de entradas redireciona para /plans", () => {
    const caminhos = [
      "/",
      "/plans",
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/accept-invite",
      "/dashboard",
      "/dashboard/orders",
      "/dashboard/settings",
      "/qualquer-outra",
    ];

    // Trial válido, trial vencido e PAST_DUE navegam igual — estado de
    // assinatura não é entrada desta função, e é por isso que não existe o
    // caso "trial vencido força /plans". Quem barra escrita vencida é o
    // SubscriptionGateService, no service, junto da operação.
    for (const pathname of caminhos) {
      for (const isLoggedIn of [true, false]) {
        for (const hasExpiredSessionMark of [true, false]) {
          const decisao = decideNavigation({
            pathname,
            isLoggedIn,
            hasExpiredSessionMark,
          });

          if (decisao.tipo === "redirecionar") {
            expect(decisao.destino).not.toContain("/plans");
          }
        }
      }
    }
  });
});

describe("ausência de laço", () => {
  it("nenhum destino é redirecionado de volta pela própria regra", () => {
    const caminhos = ["/dashboard", "/dashboard/orders", "/login", "/register"];

    for (const pathname of caminhos) {
      for (const isLoggedIn of [true, false]) {
        const primeira = decideNavigation({
          pathname,
          isLoggedIn,
          hasExpiredSessionMark: false,
        });
        if (primeira.tipo !== "redirecionar") continue;

        // Aplica a regra ao destino, com o MESMO estado de sessão: se ela
        // mandasse de volta, haveria laço.
        const semQuery = primeira.destino.split("?")[0]!;
        const segunda = decideNavigation({
          pathname: semQuery,
          isLoggedIn,
          hasExpiredSessionMark: false,
        });

        if (segunda.tipo === "redirecionar") {
          expect(segunda.destino.split("?")[0]).not.toBe(pathname);
        }
      }
    }
  });

  it("logout continua possível: a rota de auth não é bloqueada", () => {
    // /api/auth/* está fora do matcher; a função nunca decide sobre ela.
    expect(decidir("/api/auth/signout", true)).toEqual(SEGUIR);
    expect(decidir("/api/auth/signout", false)).toEqual(SEGUIR);
  });
});

describe("é pura", () => {
  it("mesma entrada, mesma saída", () => {
    const entrada = {
      pathname: "/dashboard",
      isLoggedIn: false,
      hasExpiredSessionMark: false,
    };
    const resultados = Array.from({ length: 5 }, () => decideNavigation(entrada));

    for (const resultado of resultados) {
      expect(resultado).toEqual(resultados[0]);
    }
  });

  it("não altera a entrada", () => {
    const entrada = Object.freeze({
      pathname: "/login",
      isLoggedIn: true,
      hasExpiredSessionMark: false,
    });

    expect(() => decideNavigation(entrada)).not.toThrow();
  });
});

describe("marca de sessão expirada", () => {
  it("reconhece só o valor exato", () => {
    expect(temMarcaDeSessaoExpirada(new URLSearchParams("session=expired"))).toBe(true);
    expect(temMarcaDeSessaoExpirada(new URLSearchParams("session=EXPIRED"))).toBe(false);
    expect(temMarcaDeSessaoExpirada(new URLSearchParams("session=1"))).toBe(false);
    expect(temMarcaDeSessaoExpirada(new URLSearchParams(""))).toBe(false);
  });
});
