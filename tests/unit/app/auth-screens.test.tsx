import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlanIntentNotice } from "@/components/common/PlanIntentNotice";
import { FluxyLogo } from "@/components/common/FluxyLogo";
import { parsePlanIntent } from "@/lib/plan-intent";

describe("PlanIntentNotice", () => {
  it("não renderiza nada sem intenção", () => {
    const { container } = render(<PlanIntentNotice intent={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("anuncia o Standard com a periodicidade", () => {
    render(<PlanIntentNotice intent={{ plan: "standard", billing: "monthly" }} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Você está começando com o Fluxy Standard.",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Mensal");
  });

  it("anuncia o Pro e deixa explícito que ele não está ativo", () => {
    render(<PlanIntentNotice intent={{ plan: "pro", billing: "yearly" }} />);

    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("Você escolheu o Fluxy Pro.");
    expect(aviso).toHaveTextContent("Anual");
    // A ressalva não é decorativa: o cadastro cria a empresa no Standard.
    expect(aviso).toHaveTextContent(
      "O plano Pro será ativado somente após a contratação.",
    );
  });

  it("não mostra preço — ele viria da URL, que é do visitante", () => {
    const { container } = render(
      <PlanIntentNotice intent={{ plan: "pro", billing: "yearly" }} />,
    );

    expect(container.textContent).not.toMatch(/R\$|\d+[,.]\d{2}/);
  });

  it("não expõe estado interno de assinatura", () => {
    const { container } = render(
      <PlanIntentNotice intent={{ plan: "pro", billing: "monthly" }} />,
    );

    for (const termo of ["TRIALING", "subscriptionStatus", "planId", "ACTIVE"]) {
      expect(container.innerHTML).not.toContain(termo);
    }
  });

  it("é anunciado como região de status para leitores de tela", () => {
    render(<PlanIntentNotice intent={{ plan: "pro", billing: "monthly" }} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("intenção lida das telas de acesso", () => {
  // Reproduz o que as páginas fazem: searchParams crus do Next entram no
  // parser, e só os quatro pares válidos viram intenção.
  function comoAsPaginasLeem(params: Record<string, string | string[] | undefined>) {
    return parsePlanIntent({ plan: params.plan, billing: params.billing });
  }

  it("aceita os quatro pares válidos", () => {
    expect(comoAsPaginasLeem({ plan: "standard", billing: "monthly" })).toEqual({
      plan: "standard",
      billing: "monthly",
    });
    expect(comoAsPaginasLeem({ plan: "pro", billing: "yearly" })).toEqual({
      plan: "pro",
      billing: "yearly",
    });
  });

  it("billing ausente assume mensal", () => {
    expect(comoAsPaginasLeem({ plan: "pro" })).toEqual({
      plan: "pro",
      billing: "monthly",
    });
  });

  it("descarta plano inválido, billing inválido e arrays", () => {
    expect(comoAsPaginasLeem({ plan: "enterprise", billing: "monthly" })).toBeNull();
    expect(comoAsPaginasLeem({ plan: "pro", billing: "weekly" })).toBeNull();
    expect(comoAsPaginasLeem({ plan: ["standard", "pro"] })).toBeNull();
    expect(comoAsPaginasLeem({})).toBeNull();
  });

  it("ignora planId, price, subscriptionStatus e role vindos da URL", () => {
    const intent = comoAsPaginasLeem({
      plan: "pro",
      billing: "yearly",
      planId: "plan_abc",
      price: "0.00",
      priceMonthly: "1.00",
      priceYearly: "1.00",
      subscriptionStatus: "ACTIVE",
      companyId: "cmp_1",
      role: "OWNER",
    });

    expect(intent).toEqual({ plan: "pro", billing: "yearly" });
    expect(Object.keys(intent!).sort()).toEqual(["billing", "plan"]);
  });

  it("nenhuma informação monetária sobrevive à leitura", () => {
    const intent = comoAsPaginasLeem({
      plan: "standard",
      billing: "monthly",
      price: "1.00",
      priceMonthly: "1.00",
    });

    expect(JSON.stringify(intent)).not.toMatch(/price|R\$|\d+\.\d{2}/);
  });
});

describe("marca", () => {
  it("FluxyLogo tem nome acessível quando é o único conteúdo", () => {
    render(<FluxyLogo markOnly />);

    expect(screen.getByRole("img", { name: "Fluxy" })).toBeInTheDocument();
  });

  it("com o nome ao lado, o desenho é decorativo", () => {
    const { container } = render(<FluxyLogo />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Fluxy")).toBeInTheDocument();
  });
});
