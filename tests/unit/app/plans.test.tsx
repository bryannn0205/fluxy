import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PlansPricing } from "@/app/(marketing)/plans/_components/PlansPricing";
import { PlansFaq } from "@/app/(marketing)/plans/_components/PlansFaq";
import { MarketingHeader } from "@/app/(marketing)/_components/MarketingHeader";
import { annualSavings } from "@/types/plans";
import type { PublicPlan } from "@/types/plans";

// Esta suíte exercita a variante de /plans do cabeçalho: sem âncoras de seção
// e sem "Começar agora", que ali apontaria para a própria página.
vi.mock("next/navigation", () => ({ usePathname: () => "/plans" }));

const CAMINHO_PAGINA = join(process.cwd(), "app", "(marketing)", "plans", "page.tsx");
const CAMINHO_PRECOS = join(
  process.cwd(),
  "app",
  "(marketing)",
  "plans",
  "_components",
  "PlansPricing.tsx",
);

function codigo(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const STANDARD: PublicPlan = {
  slug: "standard",
  name: "Fluxy Standard",
  priceMonthly: "29.00",
  priceYearly: "290.00",
  modules: ["orders", "customers", "products", "production", "stock"],
  maxUsers: 5,
  maxOrdersPerMonth: 500,
  maxProducts: 500,
  maxCustomers: 2000,
  availableForCheckout: true,
};

const PRO: PublicPlan = {
  slug: "pro",
  name: "Fluxy Pro",
  priceMonthly: "89.00",
  priceYearly: "890.00",
  modules: ["orders", "customers", "products", "production", "stock"],
  maxUsers: 20,
  maxOrdersPerMonth: 3000,
  maxProducts: 3000,
  maxCustomers: 10_000,
  availableForCheckout: true,
};

const PLANOS = [STANDARD, PRO];

describe("catálogo e ordem", () => {
  it("mostra Standard e Pro, nesta ordem", () => {
    const { container } = render(<PlansPricing plans={PLANOS} />);
    const nomes = [...container.querySelectorAll("h2")].map((h) => h.textContent);

    expect(nomes).toEqual(["Fluxy Standard", "Fluxy Pro"]);
  });

  it("mostra limites e módulos vindos das props", () => {
    render(<PlansPricing plans={PLANOS} />);

    expect(screen.getByText("5 usuários")).toBeInTheDocument();
    expect(screen.getByText("3.000 pedidos por mês")).toBeInTheDocument();
    expect(screen.getAllByText("Pedidos").length).toBe(2);
    expect(screen.getAllByText("Estoque").length).toBe(2);
  });

  it("reflete preço diferente sem tocar no componente", () => {
    render(<PlansPricing plans={[{ ...STANDARD, priceMonthly: "41.00" }]} />);

    expect(screen.getByText("R$ 41")).toBeInTheDocument();
    expect(screen.queryByText("R$ 29")).not.toBeInTheDocument();
  });
});

describe("hierarquia de títulos", () => {
  it("não pula níveis: os cards são h2, e Limites/Módulos h3", () => {
    const { container } = render(<PlansPricing plans={PLANOS} />);
    const niveis = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) =>
      Number(h.tagName[1]),
    );

    // O h1 é da página; aqui dentro o primeiro título precisa ser h2 e
    // nenhum salto pode passar de um nível por vez.
    expect(niveis[0]).toBe(2);
    for (let i = 1; i < niveis.length; i += 1) {
      expect(niveis[i]! - niveis[i - 1]!).toBeLessThanOrEqual(1);
    }
  });
});

describe("alternador mensal/anual", () => {
  it("começa em mensal", () => {
    render(<PlansPricing plans={PLANOS} />);

    expect(screen.getByRole("radio", { name: "Mensal" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Anual" })).not.toBeChecked();
    expect(screen.getByText("R$ 29")).toBeInTheDocument();
    expect(screen.getByText("R$ 89")).toBeInTheDocument();
    expect(screen.getAllByText("/mês")).toHaveLength(2);
  });

  it("anual troca os preços exibidos", async () => {
    const usuario = userEvent.setup();
    render(<PlansPricing plans={PLANOS} />);

    await usuario.click(screen.getByRole("radio", { name: "Anual" }));

    expect(screen.getByText("R$ 290")).toBeInTheDocument();
    expect(screen.getByText("R$ 890")).toBeInTheDocument();
    expect(screen.queryByText("R$ 29")).not.toBeInTheDocument();
    expect(screen.getAllByText("/ano")).toHaveLength(2);
  });

  it("volta corretamente para mensal", async () => {
    const usuario = userEvent.setup();
    render(<PlansPricing plans={PLANOS} />);

    await usuario.click(screen.getByRole("radio", { name: "Anual" }));
    await usuario.click(screen.getByRole("radio", { name: "Mensal" }));

    expect(screen.getByText("R$ 29")).toBeInTheDocument();
    expect(screen.queryByText("R$ 290")).not.toBeInTheDocument();
  });

  it("é um grupo de rádios rotulado, navegável por teclado", () => {
    const { container } = render(<PlansPricing plans={PLANOS} />);

    // fieldset + legend dá o nome do grupo sem ARIA; rádios nativos já
    // respondem às setas do teclado.
    expect(container.querySelector("fieldset > legend")?.textContent).toBe(
      "Periodicidade da cobrança",
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveAccessibleName();
    }
  });

  it("o alternador não é um formulário que envia nada", () => {
    const { container } = render(<PlansPricing plans={PLANOS} />);

    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('button[type="submit"]')).toBeNull();
  });
});

describe("URLs de seleção", () => {
  // Só o Standard tem caminho público: é o único com teste grátis. O Pro
  // passou a exibir estado de indisponibilidade em vez de um botão que levava
  // ao cadastro e entregava Standard.
  const casos = [
    ["Fluxy Standard", "monthly", "/register?plan=standard&billing=monthly"],
  ] as const;

  for (const [nome, , esperado] of casos) {
    it(`${nome} mensal aponta para ${esperado}`, () => {
      render(<PlansPricing plans={PLANOS} />);

      expect(
        screen.getByRole("link", { name: new RegExp(`começar com o ${nome}`, "i") }),
      ).toHaveAttribute("href", esperado);
    });
  }

  it("anual muda o billing do link do Standard", async () => {
    const usuario = userEvent.setup();
    render(<PlansPricing plans={PLANOS} />);

    await usuario.click(screen.getByRole("radio", { name: "Anual" }));

    expect(
      screen.getByRole("link", { name: /começar com o fluxy standard/i }),
    ).toHaveAttribute("href", "/register?plan=standard&billing=yearly");
    // O Pro não tem link em periodicidade nenhuma.
    expect(
      screen.queryByRole("link", { name: /começar com o fluxy pro/i }),
    ).not.toBeInTheDocument();
  });

  it("nenhuma URL carrega planId, preço ou status", async () => {
    const usuario = userEvent.setup();
    const { container } = render(<PlansPricing plans={PLANOS} />);
    await usuario.click(screen.getByRole("radio", { name: "Anual" }));

    for (const link of container.querySelectorAll("a[href*='?']")) {
      const href = link.getAttribute("href")!;
      const parametros = new URLSearchParams(href.split("?")[1]);

      expect([...parametros.keys()].sort()).toEqual(["billing", "plan"]);
      for (const proibido of ["planId", "price", "subscriptionStatus", "companyId"]) {
        expect(href).not.toContain(proibido);
      }
    }
  });

  it("nenhum link externo — todos os destinos são internos", () => {
    const { container } = render(<PlansPricing plans={PLANOS} />);

    for (const link of container.querySelectorAll("a")) {
      const href = link.getAttribute("href")!;
      expect(href.startsWith("/")).toBe(true);
      expect(href.startsWith("//")).toBe(false);
      expect(href).not.toMatch(/^[a-z]+:/i);
    }
  });
});

describe("quem já tem conta", () => {
  it("o link de entrar preserva a periodicidade escolhida", async () => {
    const usuario = userEvent.setup();
    render(<PlansPricing plans={PLANOS} />);

    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login?plan=standard&billing=monthly",
    );

    await usuario.click(screen.getByRole("radio", { name: "Anual" }));

    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login?plan=standard&billing=yearly",
    );
  });

  it("sem catálogo utilizável, o login não ganha intenção inventada", () => {
    // Sem o plano padrão no catálogo, parsePlanIntent devolve null e o helper
    // entrega /login limpo — nada é fabricado.
    render(<PlansPricing plans={[PRO]} />);

    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});

describe("economia anual", () => {
  it("calcula em centavos inteiros, sem percentual inventado", () => {
    expect(annualSavings(STANDARD)).toBe("58.00"); // 29,00 × 12 − 290,00
    expect(annualSavings(PRO)).toBe("178.00"); // 89,00 × 12 − 890,00
  });

  it("devolve null quando o anual não poupa nada", () => {
    expect(annualSavings({ ...STANDARD, priceYearly: "348.00" })).toBeNull();
    expect(annualSavings({ ...STANDARD, priceYearly: "400.00" })).toBeNull();
  });

  it("lida com centavos sem erro de ponto flutuante", () => {
    // 0,10 × 12 = 1,20 exato; em float, 0.1*12 = 1.2000000000000002.
    expect(
      annualSavings({ ...STANDARD, priceMonthly: "0.10", priceYearly: "1.00" }),
    ).toBe("0.20");
  });

  it("só aparece na tela quando anual está selecionado", async () => {
    const usuario = userEvent.setup();
    render(<PlansPricing plans={PLANOS} />);

    expect(screen.queryByText(/economize/i)).not.toBeInTheDocument();

    await usuario.click(screen.getByRole("radio", { name: "Anual" }));

    expect(screen.getByText("Economize R$ 58 por ano")).toBeInTheDocument();
    expect(screen.getByText("Economize R$ 178 por ano")).toBeInTheDocument();
  });
});

describe("catálogo vazio ou parcial", () => {
  it("vazio informa indisponibilidade sem quebrar", () => {
    render(<PlansPricing plans={[]} />);

    expect(screen.getByRole("status")).toHaveTextContent(/não foi possível carregar/i);
  });

  it("vazio não mostra preço algum — não há valor de reserva", () => {
    const { container } = render(<PlansPricing plans={[]} />);

    expect(container.textContent).not.toMatch(/R\$\s*\d/);
  });

  it("parcial mostra só o que existe, sem card falso", () => {
    const { container } = render(<PlansPricing plans={[STANDARD]} />);

    expect(container.querySelectorAll("h2")).toHaveLength(1);
    expect(screen.getByText("Fluxy Standard")).toBeInTheDocument();
    expect(screen.queryByText("Fluxy Pro")).not.toBeInTheDocument();
  });
});

describe("não vaza dado interno", () => {
  it("nenhum id ou timestamp aparece no HTML", () => {
    const { container } = render(<PlansPricing plans={PLANOS} />);

    for (const interno of ["createdAt", "updatedAt", "plan_", "companyId"]) {
      expect(container.innerHTML).not.toContain(interno);
    }
  });

  it("não expõe estado de assinatura", () => {
    const { container } = render(<PlansPricing plans={PLANOS} />);

    for (const termo of ["subscriptionStatus", "TRIALING", "planId", "trialEndsAt"]) {
      expect(container.innerHTML).not.toContain(termo);
    }
  });
});

describe("cabeçalho na variante /plans", () => {
  it("não repete as âncoras da landing nem 'Começar grátis'", () => {
    const { container } = render(<MarketingHeader />);

    expect(container.querySelectorAll('a[href^="#"]')).toHaveLength(0);
    expect(
      screen.queryByRole("link", { name: "Começar grátis" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /menu/i })).not.toBeInTheDocument();
  });

  it("mantém a marca, o caminho de volta e o Entrar", () => {
    render(<MarketingHeader />);

    expect(screen.getByRole("link", { name: /página inicial/i })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});

describe("PlansFaq", () => {
  it("usa disclosures nativos e não promete o que não existe", () => {
    const { container } = render(<PlansFaq />);

    expect(container.querySelectorAll("details > summary")).toHaveLength(4);

    const texto = (container.textContent ?? "").toLowerCase();
    for (const promessa of [
      "sem cartão",
      "cancele quando quiser",
      "garantia",
      "reembolso",
      "ativação automática",
    ]) {
      expect(texto).not.toContain(promessa);
    }
  });
});

describe("a página é pública e não escreve nada", () => {
  it("não importa sessão, autenticação nem service autenticado", () => {
    const fonte = codigo(CAMINHO_PAGINA);

    for (const proibido of [
      "@/lib/auth",
      "@/lib/session",
      "@/lib/db",
      "next-auth",
      "requireCompany",
      "companyRepository",
      "orderService",
      "teamService",
    ]) {
      expect(fonte).not.toContain(proibido);
    }
  });

  it("o único service consumido é o catálogo público", () => {
    const fonte = codigo(CAMINHO_PAGINA);

    expect(fonte).toContain("planCatalogService.listPublicPlans");
    expect(fonte.match(/Service\./g) ?? []).toHaveLength(1);
  });

  it("declara dependência da requisição e não combina estratégias", () => {
    const fonte = codigo(CAMINHO_PAGINA);

    expect(fonte).toContain("await connection()");
    expect(fonte).not.toContain('dynamic = "force-dynamic"');
    expect(fonte).not.toContain("revalidate");
  });

  it("nenhum preço, limite ou módulo está escrito no componente", () => {
    const fonte = codigo(CAMINHO_PRECOS);

    for (const valor of ["29", "89", "290", "890", "2000", "3000", "10000", "R$"]) {
      expect(fonte).not.toContain(valor);
    }
  });

  it("as URLs saem dos helpers da E3, não de concatenação", () => {
    const fonte = codigo(CAMINHO_PRECOS);

    expect(fonte).toContain("buildRegisterUrl");
    expect(fonte).toContain("buildLoginUrl");
    // Nada de montar query à mão.
    expect(fonte).not.toContain("?plan=");
    expect(fonte).not.toContain("&billing=");
  });

  it("a metadata declara título, descrição e canonical corretos", () => {
    const fonte = codigo(CAMINHO_PAGINA);

    expect(fonte).toContain('"Planos — Fluxy"');
    expect(fonte).toContain('canonical: "/plans"');
    expect(fonte).toContain('siteName: "Fluxy"');
    expect(fonte).toContain('locale: "pt_BR"');
    // Sem og:image fictícia.
    expect(fonte).not.toContain("images:");
  });
});
