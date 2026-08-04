import type { Prisma } from "@/lib/generated/prisma/client";

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
  };
}>;

export type ClientKanbanOrder = Omit<KanbanOrder, "total"> & { total: number | null };

export function toClientKanbanOrder(
  order: KanbanOrder,
  canViewFinancials: boolean,
): ClientKanbanOrder {
  const { total, ...resto } = order;
  return { ...resto, total: canViewFinancials ? Number(total) : null };
}
