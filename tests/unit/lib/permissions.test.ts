import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/lib/errors";
import { assertPermission, can, canAssignRole } from "@/lib/permissions";
import { ALL_ROLES } from "../../helpers/company";

// A matriz é a fonte única de "quem pode o quê", então ela merece teste
// próprio: um guard no service só prova que a matriz foi consultada, não que
// a resposta dela está certa. Aqui é onde as decisões de produto viram
// asserção — se alguém afrouxar uma linha da tabela, um destes quebra.
describe("matriz de permissões", () => {
  describe("VIEWER — leitura operacional, nenhum valor", () => {
    it("consulta pedido, produto, cliente, estoque e produção", () => {
      expect(can("VIEWER", "orders", "view")).toBe(true);
      expect(can("VIEWER", "products", "view")).toBe(true);
      expect(can("VIEWER", "customers", "view")).toBe(true);
      expect(can("VIEWER", "stock", "view")).toBe(true);
      expect(can("VIEWER", "production", "view")).toBe(true);
    });

    it("não vê valores financeiros do pedido", () => {
      expect(can("VIEWER", "orders", "viewFinancials")).toBe(false);
    });

    it("não vê custo nem margem", () => {
      expect(can("VIEWER", "products", "viewCosts")).toBe(false);
    });

    it("não acessa relatório de vendas", () => {
      expect(can("VIEWER", "reports", "viewSales")).toBe(false);
    });

    it("não exporta CSV", () => {
      expect(can("VIEWER", "orders", "export")).toBe(false);
    });

    it("não acessa financeiro", () => {
      expect(can("VIEWER", "finance", "view")).toBe(false);
      expect(can("VIEWER", "finance", "registerPayment")).toBe(false);
    });

    it("não escreve nada", () => {
      expect(can("VIEWER", "orders", "create")).toBe(false);
      expect(can("VIEWER", "orders", "update")).toBe(false);
      expect(can("VIEWER", "orders", "updateStatus")).toBe(false);
      expect(can("VIEWER", "orders", "delete")).toBe(false);
      expect(can("VIEWER", "customers", "create")).toBe(false);
      expect(can("VIEWER", "products", "create")).toBe(false);
      expect(can("VIEWER", "stock", "adjust")).toBe(false);
      expect(can("VIEWER", "attachments", "create")).toBe(false);
    });
  });

  describe("OPERATOR — o dia a dia, sem nenhum valor", () => {
    it("não vê valores do pedido", () => {
      // Executar o pedido não exige saber quanto o cliente pagou: itens,
      // quantidade, prazo e observação bastam para produzir e entregar.
      expect(can("OPERATOR", "orders", "viewFinancials")).toBe(false);
    });

    it("não recebe custo nem margem de produto", () => {
      expect(can("OPERATOR", "products", "viewCosts")).toBe(false);
    });

    it("cria e toca pedido, mas não exclui", () => {
      expect(can("OPERATOR", "orders", "create")).toBe(true);
      expect(can("OPERATOR", "orders", "update")).toBe(true);
      expect(can("OPERATOR", "orders", "updateStatus")).toBe(true);
      expect(can("OPERATOR", "orders", "delete")).toBe(false);
    });

    it("não ajusta estoque", () => {
      expect(can("OPERATOR", "stock", "adjust")).toBe(false);
    });

    it("não reprecifica produto", () => {
      expect(can("OPERATOR", "products", "create")).toBe(false);
      expect(can("OPERATOR", "products", "update")).toBe(false);
    });

    it("não vê relatório de vendas nem exporta", () => {
      expect(can("OPERATOR", "reports", "viewSales")).toBe(false);
      expect(can("OPERATOR", "orders", "export")).toBe(false);
    });

    it("não acessa financeiro", () => {
      expect(can("OPERATOR", "finance", "view")).toBe(false);
    });
  });

  describe("MANAGER — operação completa, sem nenhum acesso a dinheiro", () => {
    it("conduz a operação inteira", () => {
      expect(can("MANAGER", "orders", "create")).toBe(true);
      expect(can("MANAGER", "orders", "updateStatus")).toBe(true);
      expect(can("MANAGER", "orders", "delete")).toBe(true);
      expect(can("MANAGER", "production", "updateStage")).toBe(true);
      expect(can("MANAGER", "stock", "adjust")).toBe(true);
      expect(can("MANAGER", "products", "update")).toBe(true);
    });

    it("não vê valor de pedido nem faturamento", () => {
      expect(can("MANAGER", "orders", "viewFinancials")).toBe(false);
      expect(can("MANAGER", "reports", "viewSales")).toBe(false);
      expect(can("MANAGER", "reports", "viewFinancial")).toBe(false);
    });

    it("não acessa o financeiro nem registra ou estorna pagamento", () => {
      expect(can("MANAGER", "finance", "view")).toBe(false);
      expect(can("MANAGER", "finance", "registerPayment")).toBe(false);
      expect(can("MANAGER", "finance", "refund")).toBe(false);
    });

    it("não exporta pedidos — o CSV carrega os valores que ele não pode ver", () => {
      expect(can("MANAGER", "orders", "export")).toBe(false);
    });

    it("não altera a assinatura do Fluxy", () => {
      expect(can("MANAGER", "subscription", "manage")).toBe(false);
    });

    it("não gerencia equipe", () => {
      expect(can("MANAGER", "team", "invite")).toBe(false);
      expect(can("MANAGER", "team", "updateRole")).toBe(false);
    });
  });

  describe("FINANCE — dinheiro sim, operação não", () => {
    it("consulta e registra pagamento", () => {
      expect(can("FINANCE", "finance", "view")).toBe(true);
      expect(can("FINANCE", "finance", "registerPayment")).toBe(true);
    });

    it("estorna, diferente do MANAGER", () => {
      expect(can("FINANCE", "finance", "refund")).toBe(true);
    });

    it("não cria nem altera pedido", () => {
      expect(can("FINANCE", "orders", "create")).toBe(false);
      expect(can("FINANCE", "orders", "update")).toBe(false);
      expect(can("FINANCE", "orders", "updateStatus")).toBe(false);
    });

    it("vê custo e exporta, para conciliar", () => {
      expect(can("FINANCE", "products", "viewCosts")).toBe(true);
      expect(can("FINANCE", "orders", "export")).toBe(true);
    });
  });

  describe("assinatura — ação contratual é do dono", () => {
    it("ADMIN visualiza", () => {
      expect(can("ADMIN", "subscription", "view")).toBe(true);
    });

    it("ADMIN não altera plano", () => {
      expect(can("ADMIN", "subscription", "manage")).toBe(false);
    });

    it("OWNER altera plano", () => {
      expect(can("OWNER", "subscription", "manage")).toBe(true);
    });

    it("FINANCE visualiza para conciliar, sem alterar", () => {
      expect(can("FINANCE", "subscription", "view")).toBe(true);
      expect(can("FINANCE", "subscription", "manage")).toBe(false);
    });

    it("MANAGER, OPERATOR e VIEWER não veem cobrança", () => {
      for (const role of ["MANAGER", "OPERATOR", "VIEWER"] as const) {
        expect(can(role, "subscription", "view")).toBe(false);
      }
    });
  });

  describe("OWNER pode tudo", () => {
    // Enumerado em vez de percorrido: `can` é genérico sobre o recurso, e uma
    // tupla heterogênea faz a ação virar união de todas as ações de todos os
    // recursos — o compilador deixaria passar `("orders", "refund")`, que não
    // existe. Escrever uma linha por par mantém o erro de digitação sendo
    // pego na compilação, que é metade do valor de ter a matriz tipada.
    it("nenhuma ação sensível é negada ao OWNER", () => {
      expect(can("OWNER", "orders", "delete")).toBe(true);
      expect(can("OWNER", "orders", "export")).toBe(true);
      expect(can("OWNER", "orders", "viewFinancials")).toBe(true);
      expect(can("OWNER", "products", "viewCosts")).toBe(true);
      expect(can("OWNER", "stock", "adjust")).toBe(true);
      expect(can("OWNER", "reports", "viewSales")).toBe(true);
      expect(can("OWNER", "finance", "refund")).toBe(true);
      expect(can("OWNER", "team", "updateRole")).toBe(true);
      expect(can("OWNER", "settings", "updateCompany")).toBe(true);
      expect(can("OWNER", "subscription", "manage")).toBe(true);
    });
  });

  describe("hierarquia de atribuição de papel", () => {
    it("ADMIN não promove ninguém a OWNER", () => {
      expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
    });

    it("ADMIN atribui todos os papéis abaixo dele", () => {
      for (const role of ["ADMIN", "MANAGER", "OPERATOR", "FINANCE", "VIEWER"] as const) {
        expect(canAssignRole("ADMIN", role)).toBe(true);
      }
    });

    it("OWNER atribui qualquer papel", () => {
      for (const role of ALL_ROLES) {
        expect(canAssignRole("OWNER", role)).toBe(true);
      }
    });
  });

  describe("assertPermission", () => {
    it("passa em silêncio quando permitido", () => {
      expect(() => assertPermission("OWNER", "orders", "delete")).not.toThrow();
    });

    it("lança ForbiddenError quando negado", () => {
      expect(() => assertPermission("VIEWER", "orders", "delete")).toThrow(
        ForbiddenError,
      );
    });

    // O que o usuário vê é a mensagem genérica de ForbiddenError; a mensagem
    // detalhada existe para o log. Se ela vazasse na resposta, quem sonda o
    // sistema mapearia a matriz inteira testando ações uma a uma.
    it("responde 403 sem revelar a matriz ao usuário", () => {
      try {
        assertPermission("VIEWER", "orders", "delete");
        expect.unreachable("deveria ter lançado");
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenError);
        const forbidden = error as ForbiddenError;
        expect(forbidden.statusCode).toBe(403);
        expect(forbidden.userMessage).toBe("Você não tem permissão para esta ação");
      }
    });
  });

  describe("nenhum papel fica sem leitura operacional", () => {
    it.each(ALL_ROLES)("%s consulta pedidos", (role) => {
      expect(can(role, "orders", "view")).toBe(true);
    });
  });
});
