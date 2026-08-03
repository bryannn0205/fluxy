"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { PriorityBadge } from "@/components/common/PriorityBadge";
import { isOverdue as computeIsOverdue } from "@/lib/dates";
import { formatCalendarDate, formatCurrency, formatOrderNumber } from "@/lib/formatters";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ClientKanbanOrder } from "@/types/orders";

export function KanbanCard({ order }: { order: ClientKanbanOrder }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { orderNumber: order.orderNumber },
  });

  const isOverdue =
    order.status !== "COMPLETED" && computeIsOverdue(order.expectedDeliveryDate);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "cursor-grab touch-none rounded-lg border bg-card p-3 shadow-sm active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={ROUTES.ORDER_DETAIL(order.id)}
          onPointerDown={(event) => event.stopPropagation()}
          className="font-mono text-sm font-medium hover:underline"
        >
          {formatOrderNumber(order.orderNumber)}
        </Link>
        <PriorityBadge priority={order.priority} />
      </div>
      <p className="mt-1 truncate text-sm text-muted-foreground">{order.customer.name}</p>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span
          className={cn(
            "text-muted-foreground",
            isOverdue && "font-medium text-destructive",
          )}
        >
          {order.expectedDeliveryDate
            ? formatCalendarDate(order.expectedDeliveryDate)
            : "Sem previsão"}
        </span>
        <span className="font-mono font-medium tabular-nums">
          {formatCurrency(order.total)}
        </span>
      </div>
    </div>
  );
}
