"use client";

import { useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, CalendarClock, Clock, Package } from "lucide-react";

import { PriorityBadge } from "@/components/common/PriorityBadge";
import { isOverdue as computeIsOverdue } from "@/lib/dates";
import { formatCalendarDate, formatCurrency, formatOrderNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ClientKanbanOrder } from "@/types/orders";

// Mesma distância que ativa o arrasto no PointerSensor do board. Abaixo dela o
// gesto é clique; acima, é arrasto — e o clique que o navegador dispara ao
// soltar precisa ser descartado, senão soltar um cartão abriria o painel.
const DISTANCIA_DE_ARRASTO_PX = 8;

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

export function KanbanCard({
  order,
  onAbrir,
}: {
  order: ClientKanbanOrder;
  onAbrir: (orderId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { orderNumber: order.orderNumber },
  });

  const origemDoPonteiro = useRef<{ x: number; y: number } | null>(null);

  const atrasado =
    order.status !== "COMPLETED" && computeIsOverdue(order.expectedDeliveryDate);

  function registrarOrigem(event: React.PointerEvent) {
    origemDoPonteiro.current = { x: event.clientX, y: event.clientY };
  }

  /**
   * Abre o painel apenas quando o gesto foi mesmo um clique.
   *
   * Comparar a posição de onde o ponteiro desceu com a de onde subiu é
   * deliberadamente independente do dnd-kit: `isDragging` já voltou a ser
   * falso quando o `click` dispara, e depender da ordem interna dos eventos da
   * biblioteca deixaria o comportamento refém de uma atualização dela.
   */
  function aoClicar(event: React.MouseEvent) {
    const origem = origemDoPonteiro.current;
    origemDoPonteiro.current = null;

    if (origem) {
      const percorrido = Math.hypot(event.clientX - origem.x, event.clientY - origem.y);
      if (percorrido > DISTANCIA_DE_ARRASTO_PX) return;
    }

    onAbrir(order.id);
  }

  return (
    <article
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // O dnd-kit marca o cartão como `role="button"`, e sem nome próprio o
      // leitor de tela o computa a partir do conteúdo — passando a anunciar o
      // cartão com o rótulo do botão interno ("Ver detalhes do pedido..."),
      // como se fossem o mesmo controle. Nomeando o cartão pelo que ele é, os
      // dois passam a se distinguir: este arrasta, o de dentro abre.
      aria-label={`Pedido ${formatOrderNumber(order.orderNumber)}, ${order.customer.name}`}
      onPointerDownCapture={registrarOrigem}
      onClick={aoClicar}
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
        {/* Botão próprio, e não só o clique no cartão: o KeyboardSensor usa
            Espaço e Enter para arrastar, então quem navega por teclado não
            teria como abrir o painel pelo cartão. Este controle recebe foco no
            Tab e responde a Enter. O `stopPropagation` no pointerdown impede
            que o gesto vire arrasto. */}
        <button
          type="button"
          aria-label={`Ver detalhes do pedido ${formatOrderNumber(order.orderNumber)}`}
          onPointerDown={(event) => event.stopPropagation()}
          // Sem isto o Enter nunca chega a acionar o botão: o evento sobe até
          // o cartão, onde o KeyboardSensor o interpreta como início de
          // arrasto e chama preventDefault, engolindo o clique que o navegador
          // dispararia. Conter o keydown aqui devolve o Enter ao botão e
          // preserva o arrasto por teclado no cartão, que continua recebendo
          // Espaço e Enter quando o foco está nele.
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onAbrir(order.id);
          }}
          className="rounded font-mono text-sm font-semibold tabular-nums underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {formatOrderNumber(order.orderNumber)}
        </button>
        <PriorityBadge priority={order.priority} />
      </div>

      <p className="mt-1.5 truncate text-sm font-medium">{order.customer.name}</p>

      {/* Envolve em vez de comprimir: sem `flex-wrap`, o cartão estreito
          quebrava "2 itens" no meio da palavra. Cada item é indivisível
          (`whitespace-nowrap`); quando falta largura, é o valor que desce. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-xs">
        <div className="flex min-w-0 items-center gap-2.5 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            {formatarEntrada(order.createdAt)}
          </span>

          {/* Quantos, nunca quais: o board recebe só a contagem do banco, e o
              detalhe dos itens fica com o drawer. Ver ORDER_KANBAN_SELECT. */}
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
            <Package className="size-3.5 shrink-0" aria-hidden="true" />
            {order.itemCount === 1 ? "1 item" : `${order.itemCount} itens`}
          </span>
        </div>

        {/* Ausente para papéis sem `orders:viewFinancials` — o valor nem chega
            ao componente nesse caso. Ver toClientKanbanOrder.

            `ml-auto` e não apenas o `justify-between` do contêiner: quando o
            valor cai para a segunda linha, ele fica sozinho nela e o
            `justify-between` passa a alinhá-lo à ESQUERDA — o valor mudava de
            lado de um cartão para o outro. */}
        {order.total !== null && (
          <span className="ml-auto shrink-0 font-mono text-sm font-semibold whitespace-nowrap tabular-nums">
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
