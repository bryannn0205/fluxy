import type {
  PaymentProviderEvent,
  ProviderEventStatus,
} from "@/lib/generated/prisma/client";

/**
 * Campos ESTRUTURADOS extraídos do payload — nunca o payload em si.
 *
 * Não existe campo para `payer`, `taxId`, conta, agência ou banco: o evento
 * `payment.success` traz dados bancários do pagador, e nada obriga o Fluxy a
 * guardá-los. O que fica é o mínimo para correlacionar e auditar, mais o
 * `payloadHash`.
 */
export interface RecordEventInput {
  eventType: string;
  /** SHA-256 do corpo bruto. É também a `idempotencyKey` nesta versão. */
  payloadHash: string;
  companyId: string | null;
  externalChargeId: string | null;
  externalPaymentId: string | null;
  externalSubscriptionId: string | null;
  occurredAt: Date | null;
}

export interface RecordEventResult {
  event: PaymentProviderEvent;
  /**
   * `false` quando a linha já existia com o mesmo hash — entrega repetida
   * byte a byte. Quem chama decide o que fazer conforme o `status` atual.
   */
  created: boolean;
}

export interface PaymentProviderEventRepository {
  /**
   * Grava o evento, ou devolve o já existente com o mesmo `payloadHash`.
   *
   * A unicidade é do banco (`@@unique([provider, idempotencyKey])`), não de
   * uma checagem prévia: duas entregas simultâneas do mesmo corpo passariam
   * juntas por um `findFirst` e as duas inseririam.
   */
  record(input: RecordEventInput): Promise<RecordEventResult>;

  markStatus(id: string, status: ProviderEventStatus): Promise<void>;

  /** Correlação a posteriori, quando o evento chega antes do dado local. */
  attachCompany(id: string, companyId: string): Promise<void>;

  findByPayloadHash(payloadHash: string): Promise<PaymentProviderEvent | null>;
}
