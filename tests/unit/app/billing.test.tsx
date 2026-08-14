import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PlanComparison } from "@/app/dashboard/settings/billing/_components/PlanComparison";
import {
  ROUTES,
  SUBSCRIPTION_STATUS_LABELS,
  type BillingInterval,
} from "@/lib/constants";
import { daysRemainingUntil } from "@/lib/dates";
import { UPGRADE_PATH } from "@/lib/plan-limits";
import { can } from "@/lib/permissions";
import type { PublicPlan } from "@/types/plans";

const CAMINHO_PAGINA = join(
  process.cwd(),
  "app",
  "dashboard",
  "settings",
  "billing",
  "page.tsx",
);
const CAMINHO_COMPARACAO = join(
  process.cwd(),
  "app",
  "dashboard",
  "settings",
  "billing",
  "_components",
  "PlanComparison.tsx",
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
};

const PLANOS = [STANDARD, PRO];

describe("rota e caminho de upgrade", () => {
  it("a página existe no lugar que ROUTES.BILLING aponta", () => {
    expect(ROUTES.BILLING).toBe("/dashboard/settings/billing");
    // Se o arquivo não existisse, readFileSync lançaria.
    expect(codigo(CAMINHO_PAGINA).length).toBeGreaterThan(0);
  });

  it("UPGRADE_PATH agora leva a uma página real, não a Configurações", () => {
    expect(UPGRADE_PATH).toBe(ROUTES.BILLING);
    expect(UPGRADE_PATH).not.toBe(ROUTES.SETTINGS);
  });

  it("quem bate no teto de qualquer recurso chega ao mesmo lugar", () => {
    // PlanLimitReachedError carrega UPGRADE_PATH para todos os recursos —
    // usuários, pedidos, produtos e clientes usam a mesma constante.
    const fonteDoServico = codigo(join(process.cwd(), "services", "PlanLimitService.ts"));
    expect(fonteDoServico).toContain("UPGRADE_PATH");
    // Nenhum caminho de upgrade escrito à mão em paralelo.
    expect(fonteDoServico).not.toContain('"/dashboard/settings"');
  });
});

describe("autorização por papel", () => {
  it("OWNER, ADMIN e FINANCE enxergam assinatura", () => {
    for (const papel of ["OWNER", "ADMIN", "FINANCE"] as const) {
      expect(can(papel, "subscription", "view")).toBe(true);
    }
  });

  it("MANAGER, OPERATOR e VIEWER não enxergam", () => {
    for (const papel of ["MANAGER", "OPERATOR", "VIEWER"] as const) {
      expect(can(papel, "subscription", "view")).toBe(false);
    }
  });

  it("a página usa o guard central, sem lista de papéis própria", () => {
    const fonte = codigo(CAMINHO_PAGINA);

    expect(fonte).toContain('assertPermission(company.role, "subscription", "view")');
    // Nenhuma lista de papéis reescrita na página.
    for (const papel of ["OWNER", "ADMIN", "FINANCE", "MANAGER", "VIEWER"]) {
      expect(fonte).not.toContain(`"${papel}"`);
    }
  });

  it("gerir plano continua sendo só do OWNER", () => {
    expect(can("OWNER", "subscription", "manage")).toBe(true);
    expect(can("ADMIN", "subscription", "manage")).toBe(false);
    expect(can("FINANCE", "subscription", "manage")).toBe(false);
  });
});

describe("plano atual", () => {
  it("marca como atual o plano recebido do servidor", () => {
    render(<PlanComparison plans={PLANOS} currentPlanSlug="standard" />);

    const selos = screen.getAllByText("Seu plano atual");
    expect(selos).toHaveLength(1);
    expect(selos[0]!.closest("li")).toHaveTextContent("Fluxy Standard");
  });

  it("marca o Pro quando o Pro é o plano efetivo", () => {
    render(<PlanComparison plans={PLANOS} currentPlanSlug="pro" />);

    expect(screen.getByText("Seu plano atual").closest("li")).toHaveTextContent(
      "Fluxy Pro",
    );
  });

  it("sem plano vinculado, nenhum card é marcado", () => {
    render(<PlanComparison plans={PLANOS} currentPlanSlug={null} />);

    expect(screen.queryByText("Seu plano atual")).not.toBeInTheDocument();
  });

  it("não oferece contratar o plano que já está em uso", () => {
    render(<PlanComparison plans={PLANOS} currentPlanSlug="standard" />);

    expect(
      screen.queryByRole("link", { name: /contratar fluxy standard/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("É o plano que sua empresa usa hoje.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /contratar fluxy pro/i }),
    ).toBeInTheDocument();
  });

  it("o plano atual vem de prop do servidor, nunca da URL", () => {
    const fonte = codigo(CAMINHO_COMPARACAO);

    // O componente não lê searchParams nem window.location.
    expect(fonte).not.toContain("useSearchParams");
    expect(fonte).not.toContain("location.search");
    expect(fonte).not.toContain("URLSearchParams");
    expect(fonte).toContain("currentPlanSlug");
  });

  it("a página não lê searchParams — query hostil não tem por onde entrar", () => {
    const fonte = codigo(CAMINHO_PAGINA);

    // A prova é a ausência de qualquer leitura da URL: sem isso, `?plan=pro`,
    // `?companyId=`, `?planId=` e `?subscriptionStatus=ACTIVE` não têm porta.
    for (const leituraDaUrl of [
      "searchParams",
      "URLSearchParams",
      "parsePlanIntent",
      "useSearchParams",
    ]) {
      expect(fonte).not.toContain(leituraDaUrl);
    }

    // E o tenant vem da sessão, não de parâmetro.
    expect(fonte).toContain("await requireCompany()");
    expect(fonte).toContain("company.companyId");
  });

  it("subscriptionStatus é apenas comparado, nunca atribuído", () => {
    const fonte = codigo(CAMINHO_PAGINA);

    // Comparação (`===`) é leitura legítima; atribuição seria escrita.
    expect(fonte).toMatch(/subscriptionStatus ===/);
    expect(fonte).not.toMatch(/subscriptionStatus\s*=[^=]/);
  });
});

describe("o CTA de contratar apenas NAVEGA", () => {
  it("leva à tela de pagamento com plano e periodicidade", () => {
    render(<PlanComparison plans={PLANOS} currentPlanSlug="standard" />);

    // Link, não botão com efeito: a contratação acontece na tela de destino,
    // que relê preço e disponibilidade do banco.
    expect(screen.getByRole("link", { name: /contratar fluxy pro/i })).toHaveAttribute(
      "href",
      "/dashboard/settings/billing/checkout?plan=pro&interval=MONTHLY",
    );
  });

  it("a periodicidade escolhida viaja no link", async () => {
    const usuario = userEvent.setup();
    render(<PlanComparison plans={PLANOS} currentPlanSlug="standard" />);

    await usuario.click(screen.getByRole("radio", { name: /anual/i }));

    expect(screen.getByRole("link", { name: /contratar fluxy pro/i })).toHaveAttribute(
      "href",
      "/dashboard/settings/billing/checkout?plan=pro&interval=YEARLY",
    );
  });

  it("não existe formulário, action ou mutação no componente", () => {
    const fonte = codigo(CAMINHO_COMPARACAO);

    for (const proibido of [
      "use server",
      "action=",
      "<form",
      "Service.",
      "prisma",
      "planId",
      "subscriptionStatus",
      "Payment",
      "fetch(",
    ]) {
      expect(fonte).not.toContain(proibido);
    }
  });

  it("a página não chama nenhum service de escrita ao renderizar", () => {
    const fonte = codigo(CAMINHO_PAGINA);

    // Só leitura: catálogo público e plano corrente.
    expect(fonte).toContain("planCatalogService.listPublicPlans");
    expect(fonte).toContain("planLimitService.getCurrentPlan");
    for (const escrita of ["create", "update", "delete", "upsert", "register("]) {
      expect(fonte).not.toContain(escrita);
    }
  });
});

describe("catálogo", () => {
  it("preços, limites e módulos vêm das props", () => {
    render(<PlanComparison plans={PLANOS} currentPlanSlug="standard" />);

    expect(screen.getByText("R$ 29")).toBeInTheDocument();
    expect(screen.getByText("R$ 89")).toBeInTheDocument();
    expect(screen.getByText("5 usuários")).toBeInTheDocument();
    expect(screen.getByText("10.000 clientes")).toBeInTheDocument();
    expect(screen.getAllByText("Estoque")).toHaveLength(2);
  });

  it("nenhum preço, limite ou módulo escrito no componente", () => {
    const fonte = codigo(CAMINHO_COMPARACAO);

    for (const valor of ["29", "89", "290", "890", "2000", "10000", "R$"]) {
      expect(fonte).not.toContain(valor);
    }
  });

  it("catálogo parcial mostra o que existe", () => {
    const { container } = render(
      <PlanComparison plans={[STANDARD]} currentPlanSlug="standard" />,
    );

    expect(container.querySelectorAll("h3")).toHaveLength(1);
    expect(screen.queryByText("Fluxy Pro")).not.toBeInTheDocument();
  });

  it("catálogo vazio avisa sem inventar preço", () => {
    const { container } = render(
      <PlanComparison plans={[]} currentPlanSlug="standard" />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/não foi possível carregar/i);
    expect(container.textContent).not.toMatch(/R\$\s*\d/);
  });
});

describe("alternador mensal/anual", () => {
  it("troca os preços exibidos e volta", async () => {
    const usuario = userEvent.setup();
    render(<PlanComparison plans={PLANOS} currentPlanSlug="standard" />);

    expect(screen.getByText("R$ 29")).toBeInTheDocument();

    await usuario.click(screen.getByRole("radio", { name: "Anual" }));
    expect(screen.getByText("R$ 290")).toBeInTheDocument();
    expect(screen.getByText("Economize R$ 58 por ano")).toBeInTheDocument();

    await usuario.click(screen.getByRole("radio", { name: "Mensal" }));
    expect(screen.getByText("R$ 29")).toBeInTheDocument();
  });

  it("mudar periodicidade não altera qual plano é o atual", async () => {
    const usuario = userEvent.setup();
    render(<PlanComparison plans={PLANOS} currentPlanSlug="standard" />);

    await usuario.click(screen.getByRole("radio", { name: "Anual" }));

    expect(screen.getByText("Seu plano atual").closest("li")).toHaveTextContent(
      "Fluxy Standard",
    );
  });
});

describe("status da assinatura", () => {
  it("todos os estados do enum têm rótulo em português", () => {
    for (const estado of [
      "TRIALING",
      "ACTIVE",
      "PAST_DUE",
      "CANCELED",
      "EXPIRED",
    ] as const) {
      expect(SUBSCRIPTION_STATUS_LABELS[estado]).toBeTruthy();
      // Nenhum estado sai cru na tela.
      expect(SUBSCRIPTION_STATUS_LABELS[estado]).not.toBe(estado);
    }
  });

  it("PAST_DUE é apresentado com aviso, sem botão de pagar", () => {
    const fonte = codigo(CAMINHO_PAGINA);

    expect(fonte).toContain('company.subscriptionStatus === "PAST_DUE"');
    expect(fonte).toContain("regularização de pagamento será disponibilizada");
    expect(fonte).not.toContain("Pagar agora");
  });

  it("o rótulo é central, sem lógica de tradução espalhada", () => {
    for (const caminho of [
      CAMINHO_PAGINA,
      join(process.cwd(), "app", "dashboard", "settings", "page.tsx"),
    ]) {
      const fonte = codigo(caminho);
      expect(fonte).toContain("SUBSCRIPTION_STATUS_LABELS");
      expect(fonte).not.toContain("SUBSCRIPTION_LABELS:");
    }
  });
});

describe("dias restantes do teste", () => {
  const agora = new Date("2026-08-07T12:00:00Z");

  it("arredonda para cima — 30 horas são 2 dias, não 1", () => {
    expect(daysRemainingUntil(new Date("2026-08-08T18:00:00Z"), agora)).toBe(2);
  });

  it("conta os 14 dias do trial recém-criado", () => {
    expect(daysRemainingUntil(new Date("2026-08-21T12:00:00Z"), agora)).toBe(14);
  });

  it("vencido devolve zero, nunca negativo", () => {
    expect(daysRemainingUntil(new Date("2026-08-01T12:00:00Z"), agora)).toBe(0);
    expect(daysRemainingUntil(agora, agora)).toBe(0);
  });
});

describe("hierarquia e acessibilidade", () => {
  it("os cards são h3 sob o h2 da seção, sem salto", () => {
    const { container } = render(
      <PlanComparison plans={PLANOS} currentPlanSlug="standard" />,
    );
    const niveis = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) =>
      Number(h.tagName[1]),
    );

    expect(niveis[0]).toBe(3);
    for (let i = 1; i < niveis.length; i += 1) {
      expect(niveis[i]! - niveis[i - 1]!).toBeLessThanOrEqual(1);
    }
  });

  it("a página tem um h1 pelo PageHeader", () => {
    expect(codigo(CAMINHO_PAGINA)).toContain("<PageHeader");
  });

  it("o plano atual não é comunicado só por cor", () => {
    render(<PlanComparison plans={PLANOS} currentPlanSlug="standard" />);

    // Selo com texto legível, além da borda destacada.
    expect(screen.getByText("Seu plano atual")).toBeInTheDocument();
  });

  it("nenhum link externo no componente", () => {
    const { container } = render(
      <PlanComparison plans={PLANOS} currentPlanSlug="standard" />,
    );

    for (const link of container.querySelectorAll("a")) {
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("/")).toBe(true);
      expect(href).not.toMatch(/^[a-z]+:/i);
    }
  });
});

describe("tipagem do alternador", () => {
  it("só aceita as periodicidades conhecidas", () => {
    const valores: BillingInterval[] = ["monthly", "yearly"];
    expect(valores).toHaveLength(2);
  });
});
