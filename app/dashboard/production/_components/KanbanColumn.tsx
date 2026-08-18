"use client";

import { useDroppable } from "@dnd-kit/core";
import { Inbox } from "lucide-react";

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
  const tituloId = `coluna-${status}`;

  return (
    <section
      aria-labelledby={tituloId}
      className={cn(
        "flex h-full min-w-0 snap-start flex-col rounded-2xl border border-border bg-card/60",
        "transition-[border-color,background-color] duration-150",
        // A coluna inteira reage ao arrasto, não só a área de soltura: o alvo
        // que o olho persegue durante o movimento é o bloco, não o retângulo
        // interno.
        isOver && "border-primary/50 bg-[var(--panel-surface)]",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <h2 id={tituloId} className="truncate text-sm font-semibold">
          {ORDER_STATUS_LABELS[status]}
        </h2>
        <span
          className={cn(
            "inline-flex min-w-7 shrink-0 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
            ORDER_STATUS_STYLES[status],
          )}
        >
          {orders.length}
        </span>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2.5 p-3 transition-colors duration-150",
          isOver && "bg-primary/5",
        )}
      >
        {orders.length === 0 ? (
          <div
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 px-3 py-8 text-center transition-colors duration-150",
              isOver && "border-primary/50 bg-primary/5",
            )}
          >
            <Inbox className="size-5 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-xs text-muted-foreground/70">
              {isOver ? "Solte aqui" : "Nenhum pedido nesta etapa"}
            </p>
          </div>
        ) : (
          orders.map((order) => <KanbanCard key={order.id} order={order} />)
        )}
      </div>
    </section>
  );
}
