import type { Metadata } from "next";
import { Factory } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { orderService } from "@/services";
import { toClientKanbanOrder } from "@/types/orders";
import { KanbanBoard } from "@/app/dashboard/production/_components/KanbanBoard";

export const metadata: Metadata = { title: "Produção" };

export default async function ProductionPage() {
  const { companyId, role } = await requireCompany();
  const canViewFinancials = can(role, "orders", "viewFinancials");
  const canUpdateStage = can(role, "production", "updateStage");

  const orders = await orderService.listForKanban(companyId);
  const clientOrders = orders.map((order) =>
    toClientKanbanOrder(order, canViewFinancials),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produção"
        description={
          canUpdateStage
            ? "Arraste os pedidos entre as etapas para atualizar o status."
            : "Acompanhe os pedidos por etapa."
        }
      />

      {clientOrders.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="Nenhum pedido em produção"
          description="Pedidos aparecem aqui assim que forem criados."
        />
      ) : (
        <KanbanBoard initialOrders={clientOrders} readOnly={!canUpdateStage} />
      )}
    </div>
  );
}
