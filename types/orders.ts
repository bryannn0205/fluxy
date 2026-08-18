import type {
  AuditAction,
  OrderPaymentStatus,
  OrderPriority,
  OrderStatus,
  PaymentMethod,
  Prisma,
} from "@/lib/generated/prisma/client";
import type { OrderStats as OrderStatsData } from "@/repositories/interfaces/OrderRepository";

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    customer: true;
    items: true;
    createdBy: { select: { id: true; name: true } };
    attachments: { include: { uploadedBy: { select: { id: true; name: true } } } };
    auditLogs: { include: { user: { select: { id: true; name: true } } } };
  };
}>;

export type OrderListItem = Prisma.OrderGetPayload<{
  select: {
    id: true;
    orderNumber: true;
    status: true;
    total: true;
    createdAt: true;
    customer: { select: { id: true; name: true } };
  };
}>;

// Colunas da exportação em CSV. Mais larga que OrderListItem porque quem
// exporta está levando os dados para a contabilidade, não para uma tabela na
// tela — documento do cliente, forma de pagamento e desconto importam ali.
// `id` não vira coluna do CSV (um cuid não diz nada a quem abre a planilha);
// ele está aqui porque é o cursor que pagina o streaming.
export type OrderExportRow = Prisma.OrderGetPayload<{
  select: {
    id: true;
    orderNumber: true;
    createdAt: true;
    status: true;
    priority: true;
    paymentMethod: true;
    expectedDeliveryDate: true;
    dueDate: true;
    subtotal: true;
    discount: true;
    deliveryFee: true;
    surcharge: true;
    total: true;
    paidAmount: true;
    paymentStatus: true;
    notes: true;
    customer: { select: { name: true; document: true } };
    _count: { select: { items: true } };
  };
}>;

// Campos monetários do pedido, agrupados porque entram e saem juntos: quem
// não pode ver o total também não pode ver subtotal, desconto, preço unitário
// nem forma de pagamento — senão o valor é reconstruível somando os itens.
export const ORDER_FINANCIAL_FIELDS = [
  "subtotal",
  "discount",
  "total",
  "paymentMethod",
] as const;

/** Pedido sem nenhum valor monetário, para papéis sem `orders:viewFinancials`. */
export type RedactedOrderDetail = Omit<
  OrderWithRelations,
  (typeof ORDER_FINANCIAL_FIELDS)[number] | "items"
> & {
  items: Omit<OrderWithRelations["items"][number], "unitPrice" | "total">[];
};

/**
 * Remove os valores monetários do pedido — de verdade, não da tipagem.
 *
 * As chaves são descartadas por desestruturação, então não sobram no objeto
 * serializado nem no HTML renderizado pelo servidor. Esconder por CSS deixaria
 * o número no payload, ao alcance de quem abrir o inspetor.
 */
export function redactOrderFinancials(order: OrderWithRelations): RedactedOrderDetail {
  const {
    subtotal: _subtotal,
    discount: _discount,
    total: _total,
    paymentMethod: _paymentMethod,
    items,
    ...resto
  } = order;

  return {
    ...resto,
    items: items.map(({ unitPrice: _unitPrice, total: _itemTotal, ...item }) => item),
  };
}

// Prisma's Decimal não pode cruzar a fronteira Server -> Client Component
// (React rejeita instâncias de classe em props serializadas). Client
// Components sempre recebem este tipo, nunca o OrderListItem bruto.
//
// `total` é `number | null`: null significa "este papel não pode ver valores",
// não "pedido sem total". Pedido sempre tem total; a ausência aqui é decisão
// de permissão.
export type ClientOrderListItem = Omit<OrderListItem, "total"> & {
  total: number | null;
};

export function toClientOrderListItem(
  order: OrderListItem,
  canViewFinancials: boolean,
): ClientOrderListItem {
  const { total, ...resto } = order;
  return { ...resto, total: canViewFinancials ? Number(total) : null };
}

/**
 * Indicadores do painel já filtrados pelo papel de quem pergunta.
 *
 * `monthRevenue` e `todayRevenue` são `number | null` pela mesma convenção de
 * {@link ClientOrderListItem.total}: `null` significa "este papel não pode ver
 * faturamento", nunca "a empresa não faturou". As contagens operacionais ao
 * lado — pedidos no mês, hoje, em produção, prontos, atrasados — não carregam
 * dinheiro e valem para todo mundo que enxerga o painel.
 */
export type DashboardStats = Omit<OrderStatsData, "monthRevenue" | "todayRevenue"> & {
  monthRevenue: number | null;
  todayRevenue: number | null;
};

/**
 * Apaga o faturamento de quem não tem `reports:viewSales`.
 *
 * As chaves são descartadas por desestruturação, e não zeradas: um
 * `monthRevenue: 0` seria indistinguível de uma empresa que não vendeu, e ainda
 * assim manteria o campo no payload — o que o inspetor do navegador mostraria.
 * O mesmo vale para o faturamento do dia.
 */
export function toDashboardStats(
  stats: OrderStatsData,
  canViewRevenue: boolean,
): DashboardStats {
  const { monthRevenue, todayRevenue, ...resto } = stats;
  return {
    ...resto,
    monthRevenue: canViewRevenue ? monthRevenue : null,
    todayRevenue: canViewRevenue ? todayRevenue : null,
  };
}

// Formato enxuto para o board de Produção — só os campos que um card do
// Kanban mostra, evitando o over-fetch de OrderWithRelations (itens,
// anexos, timeline) para uma tela que só precisa do resumo.
export type KanbanOrder = Prisma.OrderGetPayload<{
  select: {
    id: true;
    orderNumber: true;
    status: true;
    priority: true;
    expectedDeliveryDate: true;
    total: true;
    createdAt: true;
    customer: { select: { id: true; name: true } };
    _count: { select: { items: true } };
  };
}>;

/**
 * O `_count` aninhado do Prisma vira um `itemCount` raso de propósito: a forma
 * aninhada é detalhe do ORM e não tem por que atravessar a fronteira do
 * servidor. O cartão precisa saber QUANTOS itens o pedido tem — nunca quais,
 * que o drawer busca sob demanda.
 */
export type ClientKanbanOrder = Omit<KanbanOrder, "total" | "_count"> & {
  total: number | null;
  itemCount: number;
};

export function toClientKanbanOrder(
  order: KanbanOrder,
  canViewFinancials: boolean,
): ClientKanbanOrder {
  const { total, _count, ...resto } = order;
  return {
    ...resto,
    total: canViewFinancials ? Number(total) : null,
    itemCount: _count.items,
  };
}

/**
 * Evento do histórico do pedido, no formato que a tela precisa.
 *
 * Deliberadamente mais estreito que `AuditLog`: a linha do banco carrega `ip`,
 * `resource`, `resourceId` e `companyId`, que não têm serventia na tela e não
 * devem viajar até o navegador — `ip` em especial. Aqui sobram apenas os
 * campos que a linha do tempo realmente lê.
 */
export interface OrderActivity {
  id: string;
  action: AuditAction;
  changes: unknown;
  createdAt: Date;
  user: { name: string } | null;
}

export interface ClientOrderItem {
  id: string;
  productName: string;
  quantity: number;
  /** `null` = este papel não pode ver valores. Ver ClientOrderDetail.financials. */
  unitPrice: number | null;
  total: number | null;
}

export interface ClientOrderFinancials {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  surcharge: number;
  total: number;
  paidAmount: number;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: PaymentMethod | null;
}

/**
 * Pedido completo já pronto para o navegador.
 *
 * Existe porque `OrderWithRelations` não atravessa a fronteira RSC: os campos
 * monetários são `Decimal` do Prisma, que é instância de classe e o React
 * recusa em props serializadas. A conversão para número acontece aqui, uma vez.
 *
 * `financials: null` significa "este papel não pode ver valores" — e então
 * nenhum número existe no objeto, nem no bloco nem dentro dos itens. Não é o
 * bloco escondido no JSX: ele não é montado.
 */
export interface ClientOrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  priority: OrderPriority;
  createdAt: Date;
  expectedDeliveryDate: Date | null;
  notes: string | null;
  customer: {
    name: string;
    document: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  /** Quem lançou o pedido no sistema — não é vendedor nem responsável. */
  createdBy: { name: string } | null;
  items: ClientOrderItem[];
  financials: ClientOrderFinancials | null;
  activities: OrderActivity[];
}

/**
 * Converte o pedido do banco no objeto que o navegador recebe, decidindo uma
 * única vez se os valores acompanham.
 *
 * Quando `canViewFinancials` é falso, os campos monetários não são zerados nem
 * omitidos do tipo: eles simplesmente não são lidos do registro de origem, e o
 * que sai daqui nunca os conteve.
 */
export function toClientOrderDetail(
  order: OrderWithRelations,
  canViewFinancials: boolean,
): ClientOrderDetail {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    priority: order.priority,
    createdAt: order.createdAt,
    expectedDeliveryDate: order.expectedDeliveryDate,
    notes: order.notes,
    customer: {
      name: order.customer.name,
      document: order.customer.document,
      phone: order.customer.phone,
      email: order.customer.email,
      address: order.customer.address,
    },
    createdBy: order.createdBy ? { name: order.createdBy.name } : null,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: canViewFinancials ? Number(item.unitPrice) : null,
      total: canViewFinancials ? Number(item.total) : null,
    })),
    financials: canViewFinancials
      ? {
          subtotal: Number(order.subtotal),
          discount: Number(order.discount),
          deliveryFee: Number(order.deliveryFee),
          surcharge: Number(order.surcharge),
          total: Number(order.total),
          paidAmount: Number(order.paidAmount),
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
        }
      : null,
    activities: order.auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      changes: log.changes,
      createdAt: log.createdAt,
      user: log.user ? { name: log.user.name } : null,
    })),
  };
}
