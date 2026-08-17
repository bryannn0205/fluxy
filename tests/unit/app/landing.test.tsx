import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// O cabeçalho mostra as âncoras de seção só na landing — em /plans elas não
// existiriam. Sem provedor de rota, `usePathname` devolve null e o componente
// renderizaria a variante enxuta; este arquivo testa a variante da landing.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { Hero } from "@/app/(marketing)/_components/Hero";
import { Features } from "@/app/(marketing)/_components/Features";
import { HowItWorks } from "@/app/(marketing)/_components/HowItWorks";
import { PlansSection } from "@/app/(marketing)/_components/PlansSection";
import { Faq } from "@/app/(marketing)/_components/Faq";
import { MarketingHeader } from "@/app/(marketing)/_components/MarketingHeader";
import { MarketingFooter } from "@/app/(marketing)/_components/MarketingFooter";
import { MARKETING_NAV_LINKS } from "@/app/(marketing)/_components/navigation";
import type { PublicPlan } from "@/types/plans";

const CAMINHO_PAGINA = join(process.cwd(), "app", "(marketing)", "page.tsx");
const CAMINHO_SECAO_PLANOS = join(
  process.cwd(),
  "app",
  "(marketing)",
  "_components",
  "PlansSection.tsx",
);

function semComentarios(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const PLANOS: PublicPlan[] = [
  {
    slug: "standard",
    name: "Fluxy Standard",
    priceMonthly: "29.00",
    priceYearly: "290.00",
    modules: ["orders", "customers"],
    maxUsers: 5,
    maxOrdersPerMonth: 500,
    maxProducts: 500,
    maxCustomers: 2000,
    availableForCheckout: true,
  },
  {
    slug: "pro",
    name: "Fluxy Pro",
    priceMonthly: "89.00",
    priceYearly: "890.00",
    modules: ["orders", "customers"],
    maxUsers: 20,
    maxOrdersPerMonth: 3000,
    maxProducts: 3000,
    maxCustomers: 10_000,
    availableForCheckout: true,
  },
];

describe("Hero", () => {
  it("tem exatamente um h1", () => {
    const { container } = render(<Hero />);

    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("o CTA principal leva a /plans", () => {
    render(<Hero />);

    expect(screen.getByRole("link", { name: /começar grátis/i })).toHaveAttribute(
      "href",
      "/plans",
    );
  });

  it("o CTA secundário leva à âncora de como funciona", () => {
    render(<Hero />);

    expect(screen.getByRole("link", { name: /conhecer o fluxy/i })).toHaveAttribute(
      "href",
      "#como-funciona",
    );
  });

  it("não promete o que o produto não faz", () => {
    const { container } = render(<Hero />);
    const texto = container.textContent ?? "";

    for (const promessa of [
      "sem cartão",
      "cancele quando quiser",
      "garantia",
      "reembolso",
    ]) {
      expect(texto.toLowerCase()).not.toContain(promessa);
    }
  });
});

describe("MarketingHeader", () => {
  it("mostra a marca", () => {
    render(<MarketingHeader />);

    expect(screen.getAllByText("Fluxy").length).toBeGreaterThan(0);
  });

  it("Entrar aponta para /login e Começar grátis para /plans", () => {
    render(<MarketingHeader />);

    for (const link of screen.getAllByRole("link", { name: "Entrar" })) {
      expect(link).toHaveAttribute("href", "/login");
    }

    const comecar = screen.getAllByRole("link", { name: "Começar grátis" });
    expect(comecar.length).toBeGreaterThan(0);
    for (const link of comecar) {
      expect(link).toHaveAttribute("href", "/plans");
    }
  });

  it("com o menu fechado, só as âncoras do desktop são expostas", async () => {
    const { container } = render(<MarketingHeader />);

    for (const { href, label } of MARKETING_NAV_LINKS) {
      // Uma só: o menu de celular carrega as mesmas âncoras, mas está com o
      // atributo `hidden`, e link de menu fechado NÃO deve chegar ao leitor
      // de tela. As buscas por papel respeitam a árvore de acessibilidade.
      const expostas = screen.getAllByRole("link", { name: label });
      expect(expostas).toHaveLength(1);
      expect(expostas[0]).toHaveAttribute("href", href);

      // Já no DOM, porém: aria-controls precisa de um alvo que exista.
      const todas = container.querySelectorAll(`a[href="${href}"]`);
      expect(todas).toHaveLength(2);
    }
  });

  it("abrir o menu expõe as mesmas âncoras e atualiza aria-expanded", async () => {
    const usuario = userEvent.setup();
    render(<MarketingHeader />);

    await usuario.click(screen.getByRole("button", { name: /abrir menu/i }));

    expect(screen.getByRole("button", { name: /fechar menu/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    for (const { href, label } of MARKETING_NAV_LINKS) {
      const links = screen.getAllByRole("link", { name: label });
      expect(links).toHaveLength(2);
      for (const link of links) {
        expect(link).toHaveAttribute("href", href);
      }
    }
  });

  it("o botão do menu declara estado e alvo para leitores de tela", () => {
    render(<MarketingHeader />);
    const botao = screen.getByRole("button", { name: /abrir menu/i });

    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(botao).toHaveAttribute("aria-controls");

    const alvo = document.getElementById(botao.getAttribute("aria-controls")!);
    // O alvo precisa EXISTIR no DOM, senão aria-controls aponta para o vazio.
    expect(alvo).not.toBeNull();
  });
});

describe("PlansSection", () => {
  it("mostra nome e preço vindos das props, não do componente", () => {
    render(<PlansSection plans={PLANOS} />);

    expect(screen.getByText("Fluxy Standard")).toBeInTheDocument();
    expect(screen.getByText("R$ 29")).toBeInTheDocument();
    expect(screen.getByText("Fluxy Pro")).toBeInTheDocument();
    expect(screen.getByText("R$ 89")).toBeInTheDocument();
  });

  it("mostra os limites vindos das props", () => {
    render(<PlansSection plans={PLANOS} />);

    expect(screen.getByText("5 usuários")).toBeInTheDocument();
    expect(screen.getByText("500 pedidos por mês")).toBeInTheDocument();
    expect(screen.getByText("2.000 clientes")).toBeInTheDocument();
    expect(screen.getByText("10.000 clientes")).toBeInTheDocument();
  });

  it("reflete preço diferente sem tocar no componente", () => {
    // Se houvesse preço escrito no componente, este teste mostraria o antigo.
    const outros: PublicPlan[] = [{ ...PLANOS[0]!, priceMonthly: "37.00" }];
    render(<PlansSection plans={outros} />);

    expect(screen.getByText("R$ 37")).toBeInTheDocument();
    expect(screen.queryByText("R$ 29")).not.toBeInTheDocument();
  });

  it("os botões usam os helpers da E3 e não concedem plano", () => {
    render(<PlansSection plans={PLANOS} />);

    expect(
      screen.getByRole("link", { name: /começar com o fluxy standard/i }),
    ).toHaveAttribute("href", "/register?plan=standard&billing=monthly");
    // A landing segue a mesma regra de /plans: plano sem teste grátis não
    // oferece caminho de cadastro, senão as duas telas se contradiriam.
    expect(
      screen.queryByRole("link", { name: /começar com o fluxy pro/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Em breve" })).toBeDisabled();
  });

  it("o link do Standard não carrega status, preço nem planId", () => {
    render(<PlansSection plans={PLANOS} />);
    const href = screen
      .getByRole("link", { name: /começar com o fluxy standard/i })
      .getAttribute("href")!;
    const parametros = new URLSearchParams(href.split("?")[1]);

    expect([...parametros.keys()].sort()).toEqual(["billing", "plan"]);
    expect(href).not.toContain("subscriptionStatus");
    expect(href).not.toContain("planId");
    expect(href).not.toContain("price");
  });

  it("com catálogo vazio, informa indisponibilidade sem quebrar a seção", () => {
    render(<PlansSection plans={[]} />);

    expect(screen.getByRole("status")).toHaveTextContent(/não foi possível carregar/i);
    // A seção continua de pé e o caminho para /plans continua oferecido.
    expect(screen.getByRole("heading", { name: "Planos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver todos os planos/i })).toHaveAttribute(
      "href",
      "/plans",
    );
  });

  it("com catálogo vazio, nenhum preço aparece — não há valor de reserva", () => {
    const { container } = render(<PlansSection plans={[]} />);

    expect(container.textContent).not.toMatch(/R\$\s*\d/);
  });

  it("não expõe dado interno do plano", () => {
    const { container } = render(<PlansSection plans={PLANOS} />);
    const html = container.innerHTML;

    for (const interno of ["createdAt", "updatedAt", "plan_", "cuid"]) {
      expect(html).not.toContain(interno);
    }
  });
});

describe("Features e HowItWorks", () => {
  it("recursos ficam sob a âncora #recursos", () => {
    const { container } = render(<Features />);

    expect(container.querySelector("#recursos")).not.toBeNull();
  });

  it("como funciona usa lista ordenada — a ordem é a informação", () => {
    const { container } = render(<HowItWorks />);

    expect(container.querySelector("#como-funciona")).not.toBeNull();
    expect(container.querySelectorAll("ol > li")).toHaveLength(3);
  });

  it("cada recurso tem título e descrição", () => {
    render(<Features />);

    for (const titulo of [
      "Pedidos organizados",
      "Clientes centralizados",
      "Controle de estoque",
      "Produção visual",
      "Gestão de equipe",
      "Histórico da operação",
    ]) {
      expect(screen.getByRole("heading", { name: titulo })).toBeInTheDocument();
    }
  });
});

describe("Faq", () => {
  it("cada pergunta é um disclosure nativo, que abre sem JavaScript", () => {
    const { container } = render(<Faq />);

    const perguntas = container.querySelectorAll("details > summary");
    expect(perguntas.length).toBe(6);
  });

  it("não promete cobrança que ainda não existe", () => {
    const { container } = render(<Faq />);
    const texto = (container.textContent ?? "").toLowerCase();

    for (const promessa of [
      "sem cartão",
      "cancele quando quiser",
      "garantia",
      "reembolso",
    ]) {
      expect(texto).not.toContain(promessa);
    }
  });
});

describe("MarketingFooter", () => {
  it("não tem link quebrado para Termos e Privacidade", () => {
    const { container } = render(<MarketingFooter />);

    // Aparecem como texto até a fase jurídica: nenhum href vazio, "#" ou falso.
    for (const link of container.querySelectorAll("a")) {
      const href = link.getAttribute("href");
      expect(href).toBeTruthy();
      expect(href).not.toBe("#");
      expect(link.textContent).not.toMatch(/^(Termos|Privacidade)$/);
    }

    expect(screen.getByText(/Termos/)).toBeInTheDocument();
    expect(screen.getByText(/Privacidade/)).toBeInTheDocument();
  });

  it("oferece Planos, Entrar e Suporte", () => {
    render(<MarketingFooter />);

    expect(screen.getByRole("link", { name: "Planos" })).toHaveAttribute(
      "href",
      "/plans",
    );
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Suporte" }).getAttribute("href")).toMatch(
      /^mailto:/,
    );
  });
});

describe("hierarquia de títulos", () => {
  it("as seções abaixo do hero começam em h2, sem pular nível", () => {
    const { container } = render(
      <div>
        <Features />
        <HowItWorks />
        <PlansSection plans={PLANOS} />
        <Faq />
      </div>,
    );

    // Nenhum h1 fora do hero, e nenhum h3 sem h2 antes dele na mesma seção.
    expect(container.querySelectorAll("h1")).toHaveLength(0);
    for (const secao of container.querySelectorAll("section")) {
      const titulos = [...secao.querySelectorAll("h2, h3")];
      expect(titulos[0]?.tagName).toBe("H2");
    }
  });
});

describe("a landing é pública e não escreve nada", () => {
  it("a página não importa sessão, autenticação nem service autenticado", () => {
    const fonte = semComentarios(CAMINHO_PAGINA);

    for (const proibido of [
      "@/lib/auth",
      "@/lib/session",
      "@/lib/db",
      "next-auth",
      "requireCompany",
      "orderService",
      "customerService",
      "teamService",
      "financeService",
      "companyRepository",
    ]) {
      expect(fonte).not.toContain(proibido);
    }
  });

  it("o único service consumido é o catálogo público", () => {
    const fonte = semComentarios(CAMINHO_PAGINA);

    expect(fonte).toContain("planCatalogService.listPublicPlans");
    expect(fonte.match(/Service\./g) ?? []).toHaveLength(1);
  });

  it("a página declara dependência da requisição, para não congelar preço", () => {
    const fonte = semComentarios(CAMINHO_PAGINA);

    // Sem isto o Next prerenderiza no build e serve o preço de então.
    expect(fonte).toContain("await connection()");
    // Uma estratégia só: connection() OU force-dynamic, nunca as duas.
    expect(fonte).not.toContain('dynamic = "force-dynamic"');
  });

  it("nenhum preço ou limite está escrito na seção de planos", () => {
    const fonte = semComentarios(CAMINHO_SECAO_PLANOS);

    for (const valor of ["29", "89", "290", "890", "2000", "3000", "10000", "R$"]) {
      expect(fonte).not.toContain(valor);
    }
  });
});
