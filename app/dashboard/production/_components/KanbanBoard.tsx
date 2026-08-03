"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { toast } from "sonner";

import {
  KANBAN_COLUMNS,
  ORDER_STATUS_LABELS,
  VALID_ORDER_STATUS_TRANSITIONS,
} from "@/lib/constants";
import type { OrderStatus } from "@/lib/generated/prisma/client";
import type { ClientKanbanOrder } from "@/types/orders";
import { updateOrderStatusAction } from "@/app/dashboard/orders/actions";
import { KanbanColumn } from "@/app/dashboard/production/_components/KanbanColumn";

// Sem isso, o DndContext usa os textos padrão em inglês da biblioteca para
// leitor de tela — inconsistente com o resto da interface em pt-BR e é a
// única instrução de como operar o arraste por teclado (Espaço/Enter para
// pegar e soltar, setas para mover entre colunas, Esc para cancelar).
const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Pressione espaço ou enter para selecionar um pedido. " +
    "Use as setas do teclado para mover entre as colunas. " +
    "Pressione espaço ou enter novamente para soltar, ou Esc para cancelar.",
};

function describeOrder(data: Record<string, unknown> | undefined): string {
  const orderNumber = data?.orderNumber;
  return typeof orderNumber === "string" ? `Pedido #${orderNumber}` : "Pedido";
}

const announcements: Announcements = {
  onDragStart({ active }) {
    return `${describeOrder(active.data.current)} selecionado.`;
  },
  onDragOver({ active, over }) {
    if (!over)
      return `${describeOrder(active.data.current)} não está mais sobre uma coluna.`;
    return `${describeOrder(active.data.current)} sobre a coluna "${ORDER_STATUS_LABELS[over.id as OrderStatus]}".`;
  },
  onDragEnd({ active, over }) {
    const order = describeOrder(active.data.current);
    if (!over) return `${order} solto fora de uma coluna. Nenhuma alteração foi feita.`;
    return `${order} solto na coluna "${ORDER_STATUS_LABELS[over.id as OrderStatus]}".`;
  },
  onDragCancel({ active }) {
    return `Movimentação de ${describeOrder(active.data.current)} cancelada.`;
  },
};

export function KanbanBoard({
  initialOrders,
  readOnly = false,
}: {
  initialOrders: ClientKanbanOrder[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // useState(initialOrders) só captura o valor inicial no mount — sem este
  // efeito, o board nunca refletiria pedidos novos, nem mudanças feitas em
  // outra aba ou por outro usuário, já que router.refresh() só re-renderiza
  // a árvore de Server Components e não força este Client Component a
  // reler a prop.
  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const orderId = String(active.id);
    const targetStatus = over.id as OrderStatus;
    const order = orders.find((item) => item.id === orderId);
    if (!order || order.status === targetStatus) return;

    const allowedTransitions = VALID_ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowedTransitions.includes(targetStatus)) {
      toast.error(
        `Não é possível mover de "${ORDER_STATUS_LABELS[order.status]}" para "${ORDER_STATUS_LABELS[targetStatus]}"`,
      );
      return;
    }

    const previousStatus = order.status;
    setOrders((current) =>
      current.map((item) =>
        item.id === orderId ? { ...item, status: targetStatus } : item,
      ),
    );

    const result = await updateOrderStatusAction({ orderId, status: targetStatus });

    if (result.error) {
      toast.error(result.error);
      setOrders((current) =>
        current.map((item) =>
          item.id === orderId ? { ...item, status: previousStatus } : item,
        ),
      );
      return;
    }

    toast.success(`Pedido movido para "${ORDER_STATUS_LABELS[targetStatus]}"`);
    router.refresh();
  }

  return (
    <DndContext
      // Sem um id fixo, o dnd-kit gera o id do texto de instrução (usado em
      // aria-describedby de cada card) a partir de um contador em escopo de
      // módulo — divergente entre o contador do processo do servidor e o do
      // cliente, causando mismatch de hidratação no React. Um id estável
      // aqui faz o dnd-kit usá-lo diretamente, sem contador.
      id="production-kanban"
      collisionDetection={closestCorners}
      accessibility={{ announcements, screenReaderInstructions }}
      // Sem sensor nenhum, nenhum arrasto chega a começar — nem por mouse nem
      // por teclado. O DndContext continua montado porque os cards usam seus
      // hooks; removê-lo quebraria a renderização em vez de só travar a ação.
      // As props são omitidas, não passadas como undefined, por causa de
      // exactOptionalPropertyTypes. O portão de verdade é o guard em
      // OrderService.updateStatus: um POST forjado é barrado lá, não aqui.
      {...(readOnly
        ? {}
        : { sensors, onDragEnd: (event: DragEndEvent) => void handleDragEnd(event) })}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KANBAN_COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            orders={orders.filter((order) => order.status === status)}
          />
        ))}
      </div>
    </DndContext>
  );
}
