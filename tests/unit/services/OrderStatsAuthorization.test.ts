import { describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/generated/prisma/client";
import { OrderService } from "@/services/OrderService";
import { toDashboardStats } from "@/types/orders";

/**
 * O painel entregava faturamento a qualquer papel.
 *
 * A página não lia `role`, e `getStats` recebia só o `companyId` — então
 * OPERATOR e VIEWER viam "Faturamento do mês" com o valor real da empresa.
 * Esconder o cartão no React não resolveria: o número continuaria vindo do
 * servidor, ao alcance de quem chamasse o service direto.
 *
 * Estes testes exercitam o SERVICE, e não o componente. Um teste que só
 * verifica se o card aparece na tela passaria com o dado vazando por baixo.
 */

const ESTATISTICAS_BRUTAS = {
  monthRevenue: 48_250.75,
  monthOrderCount: 37,
  // Valor próprio, sem dígitos em comum com o do mês: os testes de vazamento
  // procuram cada número como substring, e um prefixo compartilhado faria um
  // deles passar pelo motivo errado.
  todayRevenue: 3_182.49,
  todayOrderCount: 5,
  pendingCount: 6,
  processingCount: 11,
  readyCount: 4,
  overdueCount: 2,
};

function montarService() {
  const getStats = vi.fn().mockResolvedValue({ ...ESTATISTICAS_BRUTAS });
  const repository = { getStats } as unknown as ConstructorParameters<
    typeof OrderService
  >[0];

  // As demais dependências não participam de `getStats`; entram como duplos
  // vazios só para satisfazer o construtor.
  const service = new OrderService(
    repository,
    {} as ConstructorParameters<typeof OrderService>[1],
    {} as ConstructorParameters<typeof OrderService>[2],
    {} as ConstructorParameters<typeof OrderService>[3],
    {} as ConstructorParameters<typeof OrderService>[4],
    {} as ConstructorParameters<typeof OrderService>[5],
    {} as ConstructorParameters<typeof OrderService>[6],
  );

  return { service, getStats };
}

const SEM_FATURAMENTO: Role[] = ["MANAGER", "OPERATOR", "VIEWER"];
const COM_FATURAMENTO: Role[] = ["OWNER", "ADMIN", "FINANCE"];

describe("getStats — faturamento por papel", () => {
  it.each(SEM_FATURAMENTO)("%s não recebe monthRevenue", async (role) => {
    const { service } = montarService();

    const stats = await service.getStats("company_1", role);

    expect(stats.monthRevenue).toBeNull();
  });

  // O faturamento do dia é o mesmo dado numa janela menor, e o board de
  // Produção o exibe. Se ele escapasse da redação, esconder o cartão na
  // Produção não impediria nada: o número já estaria no payload do RSC.
  it.each(SEM_FATURAMENTO)("%s não recebe todayRevenue", async (role) => {
    const { service } = montarService();

    const stats = await service.getStats("company_1", role);

    expect(stats.todayRevenue).toBeNull();
  });

  it.each(SEM_FATURAMENTO)(
    "%s não recebe o valor nem escondido no objeto serializado",
    async (role) => {
      const { service } = montarService();

      const stats = await service.getStats("company_1", role);

      // Serializa como a resposta que chega ao navegador chegaria: se o número
      // sobrevivesse em qualquer chave, ele apareceria aqui.
      expect(JSON.stringify(stats)).not.toContain("48250");
      expect(JSON.stringify(stats)).not.toContain("48250.75");
      expect(JSON.stringify(stats)).not.toContain("3182");
      expect(JSON.stringify(stats)).not.toContain("3182.49");
    },
  );

  it.each(COM_FATURAMENTO)("%s recebe monthRevenue", async (role) => {
    const { service } = montarService();

    const stats = await service.getStats("company_1", role);

    expect(stats.monthRevenue).toBe(ESTATISTICAS_BRUTAS.monthRevenue);
  });

  it.each(COM_FATURAMENTO)("%s recebe todayRevenue", async (role) => {
    const { service } = montarService();

    const stats = await service.getStats("company_1", role);

    expect(stats.todayRevenue).toBe(ESTATISTICAS_BRUTAS.todayRevenue);
  });

  it.each([...SEM_FATURAMENTO, ...COM_FATURAMENTO])(
    "%s continua recebendo as contagens operacionais",
    async (role) => {
      const { service } = montarService();

      const stats = await service.getStats("company_1", role);

      // Redigir o dinheiro não pode tirar do operador o painel de trabalho.
      expect(stats.monthOrderCount).toBe(ESTATISTICAS_BRUTAS.monthOrderCount);
      // Contar pedidos do dia não é ler dinheiro: o operador precisa saber
      // quanto entrou de trabalho hoje mesmo sem ver faturamento.
      expect(stats.todayOrderCount).toBe(ESTATISTICAS_BRUTAS.todayOrderCount);
      expect(stats.pendingCount).toBe(ESTATISTICAS_BRUTAS.pendingCount);
      expect(stats.processingCount).toBe(ESTATISTICAS_BRUTAS.processingCount);
      expect(stats.readyCount).toBe(ESTATISTICAS_BRUTAS.readyCount);
      expect(stats.overdueCount).toBe(ESTATISTICAS_BRUTAS.overdueCount);
    },
  );

  it("o companyId chega ao repositório exatamente como veio da sessão", async () => {
    const { service, getStats } = montarService();

    await service.getStats("company_da_sessao", "OWNER");

    // O papel decide o que é redigido; ele nunca substitui o filtro por
    // empresa. OWNER de uma empresa não passa a ler outra.
    expect(getStats).toHaveBeenCalledWith("company_da_sessao");
  });
});

describe("toDashboardStats — a redação em si", () => {
  it("descarta a chave, em vez de zerar o valor", () => {
    const redigido = toDashboardStats({ ...ESTATISTICAS_BRUTAS }, false);

    // Zerar produziria um faturamento falso de R$ 0,00, indistinguível de uma
    // empresa que não vendeu.
    expect(redigido.monthRevenue).toBeNull();
    expect(redigido.monthRevenue).not.toBe(0);
    expect(redigido.todayRevenue).toBeNull();
    expect(redigido.todayRevenue).not.toBe(0);
  });

  it("não altera as contagens", () => {
    const redigido = toDashboardStats({ ...ESTATISTICAS_BRUTAS }, false);

    expect(redigido.overdueCount).toBe(2);
    expect(redigido.processingCount).toBe(11);
    expect(redigido.todayOrderCount).toBe(5);
  });
});
