import { z } from "zod";

// Importa de generated/prisma/enums (não .../client) de propósito: o
// arquivo client.ts arrasta todo o runtime do Prisma Client (query engine,
// node:fs, node:crypto...) — inofensivo em Server Components, mas quebra o
// bundle de Client Components que só precisam dos valores do enum para
// z.enum(). enums.ts é o único caminho gerado sem essa dependência pesada.
import {
  AttachmentCategory,
  OrderPriority,
  OrderStatus,
  PaymentMethod,
} from "@/lib/generated/prisma/enums";

// unitPrice NÃO é aceito do cliente — o preço é sempre resolvido a partir do
// Product no servidor (OrderService), nunca confiado do input. Isso evita
// manipulação de preço via requisição forjada.
//
// Os campos numéricos usam z.number() (não z.coerce): o formulário envia o
// objeto para a Server Action via chamada direta (RSC), não FormData, então
// os tipos já chegam corretos — e z.coerce quebra a inferência de tipos do
// react-hook-form (input vira `unknown` antes da coerção).
export const createOrderItemSchema = z.object({
  productId: z.string().min(1, "Produto é obrigatório"),
  quantity: z.number().int().positive("Quantidade deve ser maior que zero"),
});

// `paidAmount` e `paymentStatus` NÃO aparecem aqui, nem em nenhum outro schema
// de pedido, e isso é proposital: são caches do ledger, escritos apenas pelo
// FinanceService e pelo cancelamento transacional. Fora do schema, nenhum
// input do usuário consegue alcançá-los — a proteção é o tipo, não a
// disciplina de quem escreve a próxima Server Action.
export const createOrderSchema = z.object({
  customerId: z.string().min(1, "Cliente é obrigatório"),
  items: z.array(createOrderItemSchema).min(1, "Adicione ao menos um item"),
  discount: z.number().min(0, "Desconto não pode ser negativo"),
  // `.optional()` e não `.default(0)`: com default, o tipo de entrada do Zod
  // difere do de saída, e o react-hook-form perde a inferência (o resolver
  // passa a exigir dois genéricos incompatíveis). O zero vive no Service.
  deliveryFee: z.number().min(0, "Taxa de entrega não pode ser negativa").optional(),
  surcharge: z.number().min(0, "Acréscimo não pode ser negativo").optional(),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// z.enum(OrderStatus) deriva as opções válidas diretamente do enum gerado
// pelo Prisma — adicionar um novo status ao schema.prisma atualiza esta
// validação automaticamente, sem risco de a lista aqui ficar desatualizada.
export const updateOrderStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(OrderStatus),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

// Filtros da exportação, vindos da query string. Um status desconhecido ou uma
// busca gigante são recusados aqui em vez de irem parar no `where` do Prisma.
// `catch(undefined)` faz parâmetro inválido virar "sem filtro" — a planilha
// sai completa em vez de a rota devolver erro por um link mal colado.
export const orderExportFilterSchema = z.object({
  search: z.string().trim().min(1).max(100).optional().catch(undefined),
  status: z.enum(OrderStatus).optional().catch(undefined),
  customerId: z.string().min(1).max(50).optional().catch(undefined),
});

export type OrderExportFilterInput = z.infer<typeof orderExportFilterSchema>;

// Campos editáveis após a criação do pedido — separados de createOrderSchema
// porque não fazem parte do fluxo inicial (mantém o diálogo de criação
// simples) e podem ser alterados repetidamente ao longo do ciclo de vida.
// expectedDeliveryDate usa z.string().date() (formato YYYY-MM-DD) porque o
// formulário usa <input type="date"> nativo — não é ISO datetime completo.
export const updateOrderDetailsSchema = z.object({
  orderId: z.string().min(1),
  priority: z.enum(OrderPriority),
  expectedDeliveryDate: z.string().date().optional().or(z.literal("")),
  // Mesmo formato de expectedDeliveryDate: <input type="date">, YYYY-MM-DD,
  // gravado como meia-noite UTC. É o que deixa isOverdue() servir aos dois.
  dueDate: z.string().date().optional().or(z.literal("")),
  // Forma COMBINADA com o cliente, não prova de recebimento. O método de cada
  // entrada de dinheiro vive em Payment.method.
  paymentMethod: z.enum(PaymentMethod).optional().or(z.literal("")),
});

export type UpdateOrderDetailsInput = z.infer<typeof updateOrderDetailsSchema>;

// O arquivo em si (tamanho/tipo MIME) é validado à parte no route handler —
// Zod não modela bem um objeto File dentro de FormData.
export const createOrderAttachmentSchema = z.object({
  category: z.enum(AttachmentCategory),
});

export type CreateOrderAttachmentInput = z.infer<typeof createOrderAttachmentSchema>;
