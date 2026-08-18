import type { Metadata } from "next";
import { Factory } from "lucide-react";

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
  // O valor é retirado aqui, no servidor. Quem não tem `orders:viewFinancials`
  // recebe `total: null` — o número não chega ao componente nem ao payload RSC.
  const clientOrders = orders.map((order) =>
    toClientKanbanOrder(order, canViewFinancials),
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho próprio em vez de PageHeader: o ícone em cápsula e a
          hierarquia de duas linhas seguem o vocabulário do painel (mesma
          moldura do ícone do StatCard), que o PageHeader genérico não tem. */}
      <header className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/12 text-[var(--panel-lavender)]"
        >
          <Factory className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Produção</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            {canUpdateStage
              ? "Acompanhe cada etapa e arraste os pedidos para avançar a produção."
              : "Acompanhe os pedidos em cada etapa da produção."}
          </p>
        </div>
      </header>

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
