import { validaPayRequest } from "@/lib/validapay/client";

/**
 * Consulta de cobrança — `GET /v1/charges/:chargeId`.
 *
 * **É a prova de pagamento do Fluxy, e a única.** Nem a resposta de criação da
 * sessão, nem o retorno do cliente pela `successUrl`, nem o corpo de um webhook
 * ativam plano: os três são gatilhos que terminam aqui.
 *
 * **Somente leitura.** A criação de cobrança saiu deste módulo quando a
 * contratação passou a usar o checkout hospedado (`POST /v1/checkout-sessions`):
 * quem abre a cobrança agora é a ValidaPay, dentro da página dela, e o Fluxy só
 * descobre o `chargeId` pelo evento. Sem `POST` aqui, também não há dado de
 * pagamento algum atravessando este código.
 */

export interface ChargeSnapshot {
  readonly chargeId: string;
  /** Texto cru, não enum: um status novo precisa ser legível, não rejeitado. */
  readonly status: string;
  /** Única prova aceita de pagamento. Ver SubscriptionCheckoutService. */
  readonly paid: boolean;
  readonly subscriptionId: string | null;
  readonly paymentId: string | null;
  readonly paidAt: Date | null;
}

export interface ValidaPayChargesGateway {
  getCharge(chargeId: string): Promise<ChargeSnapshot>;
}

const STATUS_PAGO = "PAID";

interface RespostaDeConsulta {
  chargeId?: unknown;
  status?: unknown;
  subscriptionId?: unknown;
  subscription?: { subscriptionId?: unknown } | null;
  paymentId?: unknown;
  endToEndId?: unknown;
  paidAt?: unknown;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function data(valor: unknown): Date | null {
  if (typeof valor !== "string" || valor.length === 0) return null;

  const convertida = new Date(valor);
  return Number.isNaN(convertida.getTime()) ? null : convertida;
}

async function getCharge(chargeId: string): Promise<ChargeSnapshot> {
  const resposta = await validaPayRequest<RespostaDeConsulta>({
    path: `/v1/charges/${encodeURIComponent(chargeId)}`,
  });

  const status = texto(resposta.status) ?? "";

  return {
    chargeId: texto(resposta.chargeId) ?? chargeId,
    status,
    paid: status === STATUS_PAGO,
    subscriptionId:
      texto(resposta.subscriptionId) ?? texto(resposta.subscription?.subscriptionId),
    // `endToEndId` é o identificador do Pix na consulta; o webhook chama o
    // mesmo dado de `paymentId`. Quem consome não deveria conhecer os dois nomes.
    paymentId: texto(resposta.paymentId) ?? texto(resposta.endToEndId),
    paidAt: data(resposta.paidAt),
  };
}

export const validaPayCharges: ValidaPayChargesGateway = { getCharge };
