"use server";

import { handleAction } from "@/lib/action-handler";
import { NotFoundError } from "@/lib/errors";
import { assertPermission, can } from "@/lib/permissions";
import { requireCompany } from "@/lib/session";
import { orderService } from "@/services";
import { toClientOrderDetail, type ClientOrderDetail } from "@/types/orders";
import type { ActionResult } from "@/types/common";

/**
 * Detalhe do pedido para o drawer de Produção, buscado sob demanda.
 *
 * Sob demanda de propósito: mandar itens, histórico e financeiro de todos os
 * pedidos no payload inicial do board só para alimentar um painel que talvez
 * nem seja aberto pesaria a tela toda — e colocaria no navegador dados de
 * pedidos que o usuário nunca chegou a consultar.
 *
 * O `orderId` vem do cliente; o `companyId`, não — ele sai da sessão via
 * `requireCompany()`. É isso que impede alguém de trocar o id na requisição e
 * ler pedido de outra empresa: `findById` filtra pelas duas chaves, então um
 * id de outro tenant simplesmente não resolve e vira 404, sem revelar que o
 * registro existe.
 */
export async function getOrderDetailAction(
  orderId: string,
): Promise<ActionResult<ClientOrderDetail>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      assertPermission(company.role, "orders", "view");

      const order = await orderService.findById(orderId, company.id);
      if (!order) {
        throw new NotFoundError("Pedido");
      }

      // A decisão sobre dinheiro é tomada aqui, no servidor: sem
      // `orders:viewFinancials`, nenhum valor é lido do registro, e o objeto
      // devolvido nunca chegou a conter preço, total ou forma de pagamento.
      return toClientOrderDetail(order, can(company.role, "orders", "viewFinancials"));
    },
    { companyId: company.id, userId: company.userId },
  );
}
