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

    const selos = screen.getAllByText("Mais escolhido");
    expect(selos).toHaveLength(1);
    expect(RECOMMENDED_PLAN_SLUG).toBe("plus");
    expect(cartao("Fluxy Plus")).toContainElement(selos[0]!);
  });

  it("cada cartão leva ao cadastro com o próprio slug", () => {
    render(<PlansPricing plans={CATALOGO} />);

    for (const [slug, nome] of Object.entries(PUBLIC_PLAN_NAMES)) {
      expect(
        screen.getByRole("link", { name: new RegExp(`começar com o ${nome}`, "i") }),
      ).toHaveAttribute("href", `/register?plan=${slug}&billing=monthly`);
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
