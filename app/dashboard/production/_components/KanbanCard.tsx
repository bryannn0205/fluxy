"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, CalendarClock, Clock } from "lucide-react";

import { PriorityBadge } from "@/components/common/PriorityBadge";
import { isOverdue as computeIsOverdue } from "@/lib/dates";
import { formatCalendarDate, formatCurrency, formatOrderNumber } from "@/lib/formatters";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ClientKanbanOrder } from "@/types/orders";

/**
 * Hora de entrada do pedido.
 *
 * `createdAt` guarda o instante real, então o horário é dado, não enfeite. Mas
 * "09:41" sozinho só informa em um pedido de hoje — num de semana passada ele
 * mente por omissão. Por isso a hora aparece apenas no dia corrente; fora dele
 * a data diz mais.
 */
function formatarEntrada(createdAt: Date): string {
  const agora = new Date();
  const mesmoDia =
    createdAt.getFullYear() === agora.getFullYear() &&
    createdAt.getMonth() === agora.getMonth() &&
    createdAt.getDate() === agora.getDate();

  return mesmoDia
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
        createdAt,
      )
    : formatCalendarDate(createdAt);
}

export function KanbanCard({ order }: { order: ClientKanbanOrder }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { orderNumber: order.orderNumber },
  });

  const atrasado =
    order.status !== "COMPLETED" && computeIsOverdue(order.expectedDeliveryDate);

  return (
    <article
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "group/card relative cursor-grab touch-none rounded-xl border border-border bg-card/90 p-3.5",
        "transition-[border-color,box-shadow,transform] duration-150",
        "hover:border-primary/40 hover:shadow-[0_0_28px_-18px] hover:shadow-primary/80",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "active:cursor-grabbing",
        // Um pedido atrasado ganha um filete na borda esquerda em vez de tingir
        // o cartão inteiro: chama o olho sem competir com o badge de prioridade
        // que está logo ao lado.
        atrasado && "border-l-2 border-l-destructive/70",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={ROUTES.ORDER_DETAIL(order.id)}
          onPointerDown={(event) => event.stopPropagation()}
          className="font-mono text-sm font-semibold tabular-nums underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {formatOrderNumber(order.orderNumber)}
        </Link>
        <PriorityBadge priority={order.priority} />
      </div>

      <p className="mt-1.5 truncate text-sm font-medium">{order.customer.name}</p>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground tabular-nums">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          {formatarEntrada(order.createdAt)}
        </span>

        {/* Ausente para papéis sem `orders:viewFinancials` — o valor nem chega
            ao componente nesse caso. Ver toClientKanbanOrder. */}
        {order.total !== null && (
          <span className="font-mono text-sm font-semibold tabular-nums">
            {formatCurrency(order.total)}
          </span>
        )}
      </div>

      {order.expectedDeliveryDate && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border/50 pt-2 text-xs">
          {atrasado ? (
            <>
              <AlertTriangle
                className="size-3.5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <span className="font-medium text-destructive">Atrasado</span>
              <span className="text-muted-foreground/70 tabular-nums">
                · {formatCalendarDate(order.expectedDeliveryDate)}
              </span>
            </>
          ) : (
            <>
              <CalendarClock
                className="size-3.5 shrink-0 text-muted-foreground/70"
                aria-hidden="true"
              />
              <span className="text-muted-foreground tabular-nums">
                {formatCalendarDate(order.expectedDeliveryDate)}
              </span>
            </>
          )}
        </div>
      )}
    </article>
  );
}
