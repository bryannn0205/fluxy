import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PLAN_SLUG,
  planHasTrial,
  PLAN_SLUGS_WITH_TRIAL,
  PUBLIC_PLAN_NAMES,
  PUBLIC_PLAN_SLUGS,
  RECOMMENDED_PLAN_SLUG,
} from "@/lib/constants";
import { PLANS } from "@/prisma/seed-plans";
import { parsePlanIntent } from "@/lib/plan-intent";
import type { PublicPlan } from "@/types/plans";
import { PlansPricing } from "@/app/(marketing)/plans/_components/PlansPricing";

vi.mock("next/navigation", () => ({ usePathname: () => "/plans" }));

/**
 * O terceiro plano é a primeira vez que "não é o Standard" deixa de significar
 * "é o Pro". Estes testes existem para travar as duas coisas que essa mudança
 * pode quebrar em silêncio: um plano caindo no `else` do outro, e o teste
 * grátis aparecendo onde não existe.
 */

const CATALOGO: PublicPlan[] = PLANS.map((plano) => ({
  slug: plano.slug,
  name: plano.name,
  priceMonthly: plano.priceMonthly.toFixed(2),
  priceYearly: plano.priceYearly.toFixed(2),
  modules: ["orders", "customers", "products", "production", "stock"],
  maxUsers: plano.maxUsers,
  maxOrdersPerMonth: plano.maxOrdersPerMonth,
  maxProducts: plano.maxProducts,
  maxCustomers: plano.maxCustomers,
  // Espelha o banco: só o Plus ainda não tem preço no provedor.
  availableForCheckout: plano.slug !== "plus",
}));

function planoDoCatalogo(slug: string) {
  const encontrado = PLANS.find((plano) => plano.slug === slug);
  if (!encontrado) throw new Error(`plano ausente no catálogo: ${slug}`);
  return encontrado;
}

/** Cartão da tela, localizado pelo título — não pela posição na grade. */
function cartao(nome: string): HTMLElement {
  const titulo = screen.getByRole("heading", { name: nome });
  const item = titulo.closest("li");
  if (!item) throw new Error(`cartão não encontrado para ${nome}`);
  return item;
}

describe("catálogo — três planos", () => {
  it("declara exatamente standard, plus e pro, nesta ordem", () => {
    expect([...PUBLIC_PLAN_SLUGS]).toEqual(["standard", "plus", "pro"]);
    expect(PLANS.map((plano) => plano.slug)).toEqual(["standard", "plus", "pro"]);
  });

  it("cobra 29, 49 e 89 por mês", () => {
    expect(planoDoCatalogo("standard").priceMonthly).toBe(29);
    expect(planoDoCatalogo("plus").priceMonthly).toBe(49);
    expect(planoDoCatalogo("pro").priceMonthly).toBe(89);
  });

  it("aplica a mesma política anual aos três: dez mensalidades", () => {
    for (const plano of PLANS) {
      expect(plano.priceYearly).toBe(plano.priceMonthly * 10);
    }
  });

  it("mantém os limites do Standard", () => {
    expect(planoDoCatalogo("standard")).toMatchObject({
      maxUsers: 5,
      maxOrdersPerMonth: 500,
      maxProducts: 500,
      maxCustomers: 2000,
    });
  });

  it("dá ao Plus os limites intermediários", () => {
    expect(planoDoCatalogo("plus")).toMatchObject({
      maxUsers: 10,
      maxOrdersPerMonth: 1500,
      maxProducts: 1500,
      maxCustomers: 5000,
    });
  });

  it("mantém os limites do Pro", () => {
    expect(planoDoCatalogo("pro")).toMatchObject({
      maxUsers: 20,
      maxOrdersPerMonth: 3000,
      maxProducts: 3000,
      maxCustomers: 10_000,
    });
  });

  it("os limites crescem de Standard para Plus e de Plus para Pro", () => {
    const [standard, plus, pro] = PLANS;
    for (const campo of [
      "maxUsers",
      "maxOrdersPerMonth",
      "maxProducts",
      "maxCustomers",
    ] as const) {
      expect(plus![campo]).toBeGreaterThan(standard![campo]);
      expect(pro![campo]).toBeGreaterThan(plus![campo]);
    }
  });

  it("o Plus é um slug próprio, não um apelido de Standard ou Pro", () => {
    // Guarda contra o defeito clássico: `plano === "standard" ? A : B`, que
    // silenciosamente entrega o comportamento do Pro ao Plus.
    expect(planoDoCatalogo("plus").slug).not.toBe(DEFAULT_PLAN_SLUG);
    expect(planoDoCatalogo("plus").slug).not.toBe("pro");
    expect(PUBLIC_PLAN_NAMES.plus).toBe("Fluxy Plus");
    expect(parsePlanIntent({ plan: "plus", billing: "monthly" })).toEqual({
      plan: "plus",
      billing: "monthly",
    });
  });
});

describe("trial — só o Standard", () => {
  it("apenas o plano padrão dá direito ao teste grátis", () => {
    expect([...PLAN_SLUGS_WITH_TRIAL]).toEqual([DEFAULT_PLAN_SLUG]);
    expect(planHasTrial("standard")).toBe(true);
    expect(planHasTrial("plus")).toBe(false);
    expect(planHasTrial("pro")).toBe(false);
  });

  it("na tela, só o cartão do Standard promete dias grátis", () => {
    render(<PlansPricing plans={CATALOGO} />);

    expect(within(cartao("Fluxy Standard")).getByText(/dias grátis/i)).toBeVisible();
    expect(within(cartao("Fluxy Plus")).queryByText(/grátis|trial|teste/i)).toBeNull();
    expect(within(cartao("Fluxy Pro")).queryByText(/grátis|trial|teste/i)).toBeNull();
  });

  it("alternar para Anual não faz o teste aparecer no Plus nem no Pro", async () => {
    const usuario = userEvent.setup();
    render(<PlansPricing plans={CATALOGO} />);

    await usuario.click(screen.getByRole("radio", { name: "Anual" }));

    expect(within(cartao("Fluxy Plus")).queryByText(/grátis|trial|teste/i)).toBeNull();
    expect(within(cartao("Fluxy Pro")).queryByText(/grátis|trial|teste/i)).toBeNull();
    expect(within(cartao("Fluxy Standard")).getByText(/dias grátis/i)).toBeVisible();
  });
});

describe("vitrine dos três planos", () => {
  it("renderiza os três cartões", () => {
    render(<PlansPricing plans={CATALOGO} />);

    for (const nome of ["Fluxy Standard", "Fluxy Plus", "Fluxy Pro"]) {
      expect(screen.getByRole("heading", { name: nome })).toBeInTheDocument();
    }
  });

  it("destaca um único plano como recomendado, e é o Plus", () => {
    render(<PlansPricing plans={CATALOGO} />);

    // "Recomendado", e não "Mais escolhido": o produto não mede adesão de
    // clientes, e afirmar popularidade sem dado é estatística inventada.
    const selos = screen.getAllByText("Recomendado");
    expect(selos).toHaveLength(1);
    expect(RECOMMENDED_PLAN_SLUG).toBe("plus");
    expect(cartao("Fluxy Plus")).toContainElement(selos[0]!);
    expect(screen.queryByText("Mais escolhido")).toBeNull();
  });

  it("só o Standard leva ao cadastro; Plus e Pro não têm link", () => {
    render(<PlansPricing plans={CATALOGO} />);

    expect(
      screen.getByRole("link", { name: /começar com o fluxy standard/i }),
    ).toHaveAttribute("href", "/register?plan=standard&billing=monthly");

    for (const nome of ["Fluxy Plus", "Fluxy Pro"]) {
      expect(
        screen.queryByRole("link", { name: new RegExp(`começar com o ${nome}`, "i") }),
      ).toBeNull();
    }
  });

  it("os preços exibidos vêm do catálogo, não do componente", () => {
    render(<PlansPricing plans={CATALOGO} />);

    expect(within(cartao("Fluxy Standard")).getByText("R$ 29")).toBeVisible();
    expect(within(cartao("Fluxy Plus")).getByText("R$ 49")).toBeVisible();
    expect(within(cartao("Fluxy Pro")).getByText("R$ 89")).toBeVisible();
  });

  it("no anual, os três mostram o preço de dez mensalidades", async () => {
    const usuario = userEvent.setup();
    render(<PlansPricing plans={CATALOGO} />);

    await usuario.click(screen.getByRole("radio", { name: "Anual" }));

    expect(within(cartao("Fluxy Standard")).getByText("R$ 290")).toBeVisible();
    expect(within(cartao("Fluxy Plus")).getByText("R$ 490")).toBeVisible();
    expect(within(cartao("Fluxy Pro")).getByText("R$ 890")).toBeVisible();
  });
});

describe("planos pagos não caem em trial Standard", () => {
  it("Plus sem preço remoto fica indisponível; Pro com preço vira contratação", () => {
    render(<PlansPricing plans={CATALOGO} />);

    // O Plus ainda não tem os dois preços no provedor — sem eles não há como
    // cobrar, e um botão que prometesse cobrar mentiria.
    expect(
      within(cartao("Fluxy Plus")).getByRole("button", { name: "Em breve" }),
    ).toBeDisabled();

    // O Pro tem os dois: o botão contrata de verdade e leva ao ponto de entrada
    // público, que decide entre login e checkout — nunca ao cadastro.
    expect(
      within(cartao("Fluxy Pro")).getByRole("link", { name: /assinar fluxy pro/i }),
    ).toHaveAttribute("href", "/contratar?plan=pro&billing=monthly");
  });

  it("nenhum link da vitrine aponta para cadastro com plano pago", () => {
    const { container } = render(<PlansPricing plans={CATALOGO} />);

    // A prova direta do defeito relatado: antes existiam
    // `/register?plan=plus` e `/register?plan=pro`, e ambos terminavam em
    // Standard com 14 dias.
    for (const link of container.querySelectorAll("a[href*='/register']")) {
      const href = link.getAttribute("href")!;
      expect(href).toContain(`plan=${DEFAULT_PLAN_SLUG}`);
      expect(href).not.toContain("plan=plus");
      expect(href).not.toContain("plan=pro");
    }
  });

  it("alternar para Anual não abre caminho de cadastro para Plus nem Pro", async () => {
    const usuario = userEvent.setup();
    const { container } = render(<PlansPricing plans={CATALOGO} />);

    await usuario.click(screen.getByRole("radio", { name: "Anual" }));

    for (const link of container.querySelectorAll("a[href*='/register']")) {
      const href = link.getAttribute("href")!;
      expect(href).not.toContain("plan=plus");
      expect(href).not.toContain("plan=pro");
    }

    // Só o Plus segue indisponível. O Pro carrega a periodicidade escolhida
    // adiante, sem passar pelo cadastro.
    expect(screen.getAllByRole("button", { name: "Em breve" })).toHaveLength(1);
    expect(
      within(cartao("Fluxy Pro")).getByRole("link", { name: /assinar fluxy pro/i }),
    ).toHaveAttribute("href", "/contratar?plan=pro&billing=yearly");
  });

  it("o plano só é contratável quando tem preço no provedor", () => {
    // O Plus nasceu sem preço na ValidaPay; o `false` aqui é o mesmo dado que
    // faz `exigirPrecoRemoto` recusar a cobrança no servidor.
    const porSlug = new Map(CATALOGO.map((plano) => [plano.slug, plano]));
    expect(porSlug.get("plus")!.availableForCheckout).toBe(false);
    expect(porSlug.get("standard")!.availableForCheckout).toBe(true);
    expect(porSlug.get("pro")!.availableForCheckout).toBe(true);
  });

  it("o DTO público não carrega os identificadores de preço", () => {
    for (const plano of CATALOGO) {
      expect(Object.keys(plano)).not.toContain("validapayPriceMonthlyId");
      expect(Object.keys(plano)).not.toContain("validapayPriceYearlyId");
    }
  });
});

describe("compatibilidade com quem já é cliente", () => {
  it("o cadastro continua provisionando apenas o plano padrão", () => {
    // O AuthService cria a empresa com `findBySlug(DEFAULT_PLAN_SLUG)`, sem
    // consultar a intenção. É essa ausência que garante que escolher Plus ou
    // Pro não crie uma assinatura TRIALING nesses planos — e o teste falha se
    // alguém passar a derivar o plano da escolha do visitante.
    const fonte = readFileSync(join(process.cwd(), "services", "AuthService.ts"), "utf8");

    expect(fonte).toContain("findBySlug(DEFAULT_PLAN_SLUG)");
    expect(fonte).not.toMatch(/findBySlug\((?!DEFAULT_PLAN_SLUG)/);
    expect(fonte).not.toContain("intent");
  });

  it("nenhum plano existente foi renomeado", () => {
    expect(PUBLIC_PLAN_NAMES.standard).toBe("Fluxy Standard");
    expect(PUBLIC_PLAN_NAMES.pro).toBe("Fluxy Pro");
  });
});
