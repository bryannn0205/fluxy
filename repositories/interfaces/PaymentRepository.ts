import type {
  OrderPaymentStatus,
  Payment,
  PaymentMethod,
  PaymentType,
} from "@/lib/generated/prisma/client";
import type { LedgerSummary } from "@/lib/payment-status";

export interface CreatePaymentData {
  orderId: string;
  type: PaymentType;
  /** Sempre positivo — o sinal vem de `type`. Há CHECK no banco. */
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  note: string | null;
  idempotencyKey: string;
  createdById: string;
}

/** Estado do pedido lido sob bloqueio, dentro da transação do lançamento. */
export interface LockedOrderState {
  id: string;
  status: string;
  total: number;
  paidAmount: number;
  ledger: LedgerSummary;
}

export interface RegisterPaymentResult {
  payment: Payment;
  paidAmountBefore: number;
  paidAmountAfter: number;
  statusBefore: OrderPaymentStatus;
  statusAfter: OrderPaymentStatus;
}

export interface PaymentRepository {
  /**
   * Executa o lançamento inteiro numa única transação, com o pedido travado
   * por `SELECT ... FOR UPDATE`.
   *
   * Recebe `decidir` porque a regra de negócio (pode lançar? qual o status
   * resultante?) pertence ao FinanceService, mas precisa rodar **dentro** da
   * transação, depois do lock e antes da escrita. Devolver o estado para o
   * service decidir do lado de fora abriria exatamente a janela de corrida que
   * o lock existe para fechar.
   */
  registerWithinTransaction(
    data: CreatePaymentData,
    companyId: string,
    decidir: (estado: LockedOrderState) => {
      paidAmountAfter: number;
      statusAfter: OrderPaymentStatus;
    },
  ): Promise<RegisterPaymentResult>;

  findByIdempotencyKey(key: string, companyId: string): Promise<Payment | null>;

  listByOrder(orderId: string, companyId: string): Promise<Payment[]>;

  /** Soma o ledger direto das linhas — usado para conferir o cache. */
  summarize(orderId: string, companyId: string): Promise<LedgerSummary>;
}
