import type {
  OrderPriority,
  OrderStatus,
  PaymentMethod,
} from "@/lib/generated/prisma/client";
import type { ListOptions, PaginatedResult } from "@/types/common";
import type {
  KanbanOrder,
  OrderExportRow,
  OrderListItem,
  OrderWithRelations,
} from "@/types/orders";

export interface CreateOrderItemData {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface CreateOrderData {
  customerId: string;
  items: CreateOrderItemData[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  surcharge: number;
  // Já formado por lib/order-totals.ts — o repositório grava, não calcula.
  total: number;
  notes?: string | undefined;
  createdById: string;
}

/**
 * Cota mensal a validar DENTRO da transação de criação.
 *
 * O período vem de fora (lib/dates decide o que é "este mês em Brasília") e a
 * regra também (o Service sabe o teto do plano); o repositório só garante que
 * a contagem aconteça sob o mesmo lock que gera o número do pedido.
 */
export interface MonthlyQuotaCheck {
  from: Date;
  to: Date;
  /** Lança se o uso estourou. Recebe a contagem lida sob lock. */
  assert: (usageInPeriod: number) => void;
}

export interface OrderListOptions extends ListOptions {
  status?: OrderStatus | undefined;
  customerId?: string | undefined;
}

/** Mesmos filtros da listagem, menos a paginação — a exportação leva tudo. */
export type OrderExportOptions = Pick<
  OrderListOptions,
  "search" | "status" | "customerId"
>;

export interface OrderStats {
  monthRevenue: number;
  monthOrderCount: number;
  pendingCount: number;
  processingCount: number;
  readyCount: number;
  overdueCount: number;
}

// Não deriva de Partial<>: mesma razão do CreateCustomerData — Zod .partial()
// inclui `| undefined` no tipo do valor, incompatível com o Partial<T> puro
// do TypeScript sob exactOptionalPropertyTypes.
export interface UpdateOrderDetailsData {
  priority?: OrderPriority | undefined;
  expectedDeliveryDate?: Date | null | undefined;
  paymentMethod?: PaymentMethod | null | undefined;
}

export interface OrderRepository {
  /**
   * Cria o pedido, seus itens e consome o próximo número sequencial da
   * empresa — tudo em uma única transação atômica.
   */
  create(
    data: CreateOrderData,
    companyId: string,
    quota?: MonthlyQuotaCheck,
  ): Promise<OrderWithRelations>;

  /**
   * Conta pedidos CRIADOS no período, INCLUINDO cancelados e soft-deleted.
   *
   * A ausência de `deletedAt: null` é o ponto inteiro do método. Todo o resto
   * deste repositório filtra soft-deleted — inclusive `getStats`, que usa o
   * mesmo `startOfMonthBrazil` para o faturamento. São perguntas parecidas com
   * respostas diferentes:
   *
   *   getStats  → "quanto a empresa faturou?"   → excluído NÃO conta
   *   este aqui → "quanta cota a empresa usou?" → excluído CONTA
   *
   * Se excluir devolvesse cota, o teto seria contornável em looping: criar,
   * excluir, criar de novo. **Não acrescente `deletedAt: null` aqui.**
   */
  countCreatedInPeriodIncludingDeleted(
    companyId: string,
    from: Date,
    to: Date,
  ): Promise<number>;
  findById(id: string, companyId: string): Promise<OrderWithRelations | null>;
  findByNumber(
    orderNumber: string,
    companyId: string,
  ): Promise<OrderWithRelations | null>;
  list(
    companyId: string,
    options: OrderListOptions,
  ): Promise<PaginatedResult<OrderListItem>>;
  /**
   * Emite os pedidos do filtro em lotes, sem materializar tudo em memória.
   * Uma empresa com anos de histórico pode ter centenas de milhares de
   * pedidos, e um `findMany` sem `take` derrubaria o processo.
   */
  streamForExport(
    companyId: string,
    options: OrderExportOptions,
  ): AsyncGenerator<OrderExportRow>;
  /**
   * Pedidos para o board de Produção: PENDING/PROCESSING/READY sem limite de
   * data, COMPLETED só dos últimos KANBAN_COMPLETED_WINDOW_DAYS dias.
   * CANCELLED nunca aparece — ver lib/constants.ts.
   */
  listForKanban(companyId: string): Promise<KanbanOrder[]>;
  /**
   * userId identifica quem fez a mudança nos StockMovement gerados quando
   * status vira CANCELLED (repõe o estoque debitado na criação do pedido).
   */
  updateStatus(
    id: string,
    companyId: string,
    status: OrderStatus,
    userId: string,
  ): Promise<void>;
  updateDetails(
    id: string,
    companyId: string,
    data: UpdateOrderDetailsData,
  ): Promise<void>;
  /**
   * userId identifica quem fez a exclusão no StockMovement de reposição —
   * só gerado se o pedido ainda não estava CANCELLED (evita repor estoque
   * duas vezes para o mesmo pedido).
   */
  softDelete(id: string, companyId: string, userId: string): Promise<void>;
  getStats(companyId: string): Promise<OrderStats>;
}
