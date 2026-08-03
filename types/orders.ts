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
    subtotal: true;
    discount: true;
    total: true;
    notes: true;
    customer: { select: { name: true; document: true } };
    _count: { select: { items: true } };
  };
}>;

// Prisma's Decimal não pode cruzar a fronteira Server -> Client Component
// (React rejeita instâncias de classe em props serializadas). Client
// Components sempre recebem este tipo, nunca o OrderListItem bruto.
export type ClientOrderListItem = Omit<OrderListItem, "total"> & { total: number };

export function toClientOrderListItem(order: OrderListItem): ClientOrderListItem {
  return { ...order, total: Number(order.total) };
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

export type ClientKanbanOrder = Omit<KanbanOrder, "total"> & { total: number };

export function toClientKanbanOrder(order: KanbanOrder): ClientKanbanOrder {
  return { ...order, total: Number(order.total) };
}
