import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProductionLoading from "@/app/dashboard/production/loading";
import { KANBAN_COLUMNS } from "@/lib/constants";

/**
 * O esqueleto tem uma obrigação só: ter a forma da tela que vai chegar.
 *
 * Ele já ficou para trás uma vez — mostrava dois indicadores estreitos e
 * nenhuma barra de filtros depois que a Produção passou a ter quatro
 * indicadores e filtros —, e o resultado era o conteúdo pulando exatamente no
 * momento que o esqueleto existe para suavizar. Estes testes prendem a forma:
 * mudar a composição da página sem mexer aqui passa a quebrar o teste.
 */
describe("ProductionLoading", () => {
  it("anuncia o carregamento para leitor de tela", () => {
    render(<ProductionLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando produção");
  });

  it("reserva um bloco por coluna do kanban", () => {
    const { container } = render(<ProductionLoading />);

    const colunas = container.querySelectorAll("div.rounded-2xl.border");
    expect(colunas).toHaveLength(KANBAN_COLUMNS.length);
  });

  it("reserva os quatro indicadores, e não os dois de antes", () => {
    const { container } = render(<ProductionLoading />);

    // A altura vem de medição da tela pronta; se o StatCard mudar de tamanho,
    // este número precisa mudar junto.
    const indicadores = container.querySelectorAll("[class*='9.8rem']");
    expect(indicadores).toHaveLength(4);
  });

  it("reserva a barra de filtros: uma busca e dois seletores", () => {
    const { container } = render(<ProductionLoading />);

    // Ancora na própria linha de filtros: o Skeleton aplica `rounded-md` em
    // tudo, e o título do cabeçalho tem a mesma altura dos controles.
    const linhaDeFiltros = container.querySelector("div[class*='sm:flex-row']");
    expect(linhaDeFiltros).not.toBeNull();
    expect(linhaDeFiltros!.querySelectorAll("div[class*='h-8']")).toHaveLength(3);
  });

  it("não limita a largura dos indicadores", () => {
    const { container } = render(<ProductionLoading />);

    // `max-w-2xl` era o teto de quando eram dois cartões. Com quatro, ele
    // deixaria o esqueleto ocupando metade da largura do conteúdo real.
    expect(container.innerHTML).not.toContain("max-w-2xl");
  });

  it("mantém a rolagem horizontal do kanban no celular", () => {
    const { container } = render(<ProductionLoading />);

    expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
  });
});
