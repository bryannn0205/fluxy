"use client";

import { useDroppable } from "@dnd-kit/core";

import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/generated/prisma/client";
import type { ClientKanbanOrder } from "@/types/orders";
import { KanbanCard } from "@/app/dashboard/production/_components/KanbanCard";

interface KanbanColumnProps {
  status: OrderStatus;
  orders: ClientKanbanOrder[];
}

export function KanbanColumn({ status, orders }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">{ORDER_STATUS_LABELS[status]}</h2>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-medium",
            ORDER_STATUS_STYLES[status],
          )}
        >
          {orders.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-col gap-2 rounded-md p-1 transition-colors",
          isOver && "bg-accent ring-2 ring-ring/50",
        )}
      >
        {orders.map((order) => (
          <KanbanCard key={order.id} order={order} />
        ))}
        {orders.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            Nenhum pedido
          </p>
        )}
      </div>
    </div>
  );
}
