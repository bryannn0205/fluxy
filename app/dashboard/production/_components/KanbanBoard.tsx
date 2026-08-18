"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ProductionMetrics } from "@/app/dashboard/production/_components/ProductionMetrics";
import { OrderDrawer } from "@/app/dashboard/production/_components/OrderDrawer";
import { ProductionFilters } from "@/app/dashboard/production/_components/ProductionFilters";
import {
  FILTROS_LIMPOS,
  aplicarFiltros,
  haFiltroAtivo,
  type FiltrosDeProducao,
} from "@/app/dashboard/production/_components/filtros";

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

interface KanbanBoardProps {
  initialOrders: ClientKanbanOrder[];
  readOnly?: boolean;
  /** Do servidor: pedidos criados hoje na empresa, independentes do board. */
  todayOrderCount: number;
  /** `null` sem `reports:viewSales` — o valor não chegou ao navegador. */
  todayRevenue: number | null;
  /** `orders:viewFinancials`, que governa o total somado por coluna. */
  mostrarTotaisPorColuna: boolean;
}

export function KanbanBoard({
  initialOrders,
  readOnly = false,
  todayOrderCount,
  todayRevenue,
  mostrarTotaisPorColuna,
}: KanbanBoardProps) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosDeProducao>(FILTROS_LIMPOS);
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

  // O filtro não é remontado a cada `router.refresh()`: ele é estado da
  // sessão de trabalho, e limpá-lo sozinho depois de mover um cartão faria o
  // board inteiro reaparecer no meio da tarefa.
  const filtroAtivo = haFiltroAtivo(filtros);
  const ordersVisiveis = useMemo(
    () => (filtroAtivo ? aplicarFiltros(orders, filtros) : orders),
    [orders, filtros, filtroAtivo],
  );

  const limparFiltros = useCallback(() => setFiltros(FILTROS_LIMPOS), []);

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

  const abrirPedido = useCallback((orderId: string) => setPedidoAberto(orderId), []);

  // O pedido continua existindo — só saiu da vista. Fechar o painel sozinho
  // seria arrancar da mão de quem estava lendo; deixá-lo mudo apontaria para
  // um cartão que o usuário não encontra mais. Então ele avisa e oferece a
  // saída. Nenhum filtro atual reage a mudança de etapa, mas mexer no filtro
  // com o painel aberto chega aqui.
  const pedidoForaDoFiltro =
    pedidoAberto !== null &&
    filtroAtivo &&
    !ordersVisiveis.some((order) => order.id === pedidoAberto);

  const fecharPedido = useCallback((aberto: boolean) => {
    if (!aberto) setPedidoAberto(null);
  }, []);

  /**
   * Avanço feito pelo painel: move o cartão no board sem recarregar.
   *
   * O board mantém o mesmo estado que alimenta colunas, contadores e
   * indicadores, então atualizar aqui move os três de uma vez. A gravação em
   * si já aconteceu no painel, pela mesma `updateOrderStatusAction` do
   * arrasto — não há segundo caminho de mutação.
   */
  const aplicarAvanco = useCallback(
    (orderId: string, novoStatus: OrderStatus) => {
      setOrders((current) =>
        current.map((item) =>
          item.id === orderId ? { ...item, status: novoStatus } : item,
        ),
      );
      router.refresh();
    },
    [router],
  );

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
      <div className="space-y-6">
        {/* Dentro do board, e não na página: os indicadores leem o mesmo estado
            que o arrasto otimista altera, então acompanham o cartão no instante
            em que ele muda de coluna. Calculados no servidor, ficariam um
            `router.refresh()` atrasados e exibiriam um número que não confere
            com o que está à vista. */}
        <ProductionMetrics
          orders={orders}
          todayOrderCount={todayOrderCount}
          todayRevenue={todayRevenue}
        />

        <ProductionFilters
          filtros={filtros}
          onChange={setFiltros}
          onLimpar={limparFiltros}
          visiveis={ordersVisiveis.length}
          total={orders.length}
        />

        {/* Abaixo de lg o board rola na horizontal em vez de empilhar quatro
            colunas: empilhado, o operador perde a leitura de fluxo entre etapas,
            que é a razão de existir do kanban. `-mx-*`/`px-*` deixam a rolagem
            sangrar até a borda da tela sem cortar o cartão no início nem no fim.
            `snap` faz cada coluna parar alinhada em vez de meia à mostra. */}
        <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:overflow-visible lg:px-0">
          <div className="grid snap-x snap-mandatory auto-cols-[86%] grid-flow-col items-stretch gap-4 sm:auto-cols-[46%] lg:snap-none lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-4">
            {KANBAN_COLUMNS.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                orders={ordersVisiveis.filter((order) => order.status === status)}
                onAbrirPedido={abrirPedido}
                mostrarTotal={mostrarTotaisPorColuna}
                filtroAtivo={filtroAtivo}
              />
            ))}
          </div>
        </div>
      </div>

      {/* `readOnly` já reflete `production:updateStage`. O portão real continua
          em OrderService.updateStatus — aqui só decide o que renderizar. */}
      <OrderDrawer
        orderId={pedidoAberto}
        onOpenChange={fecharPedido}
        podeAvancar={!readOnly}
        onEtapaAvancada={aplicarAvanco}
        foraDoFiltro={pedidoForaDoFiltro}
        onLimparFiltros={limparFiltros}
      />
    </DndContext>
  );
}
