import { validaPayRequest } from "@/lib/validapay/client";
import { ValidaPayRequestError } from "@/lib/validapay/errors";

/**
 * Cobranças da ValidaPay — `POST /v1/charges` e `GET /v1/charges/:chargeId`.
 *
 * **Este é o endpoint oficial de criação.** `POST /v1/subscriptions` não existe
 * na documentação como rota de criação: a assinatura nasce como efeito da
 * cobrança, e o `subscriptionId` só aparece depois, na consulta ou no webhook.
 *
 * Fica fora de `lib/validapay/index.ts` de propósito. Aquele índice é a
 * superfície de transporte da F1, e há teste afirmando que ela não conhece
 * negócio; quem precisa de cobrança importa este caminho diretamente.
 */

export interface ChargeCustomer {
  readonly name: string;
  readonly email: string;
  /** CPF/CNPJ, só dígitos. Obrigatório pela API mesmo sem cliente pré-cadastrado. */
  readonly documentNumber: string;
  readonly phone?: string;
  readonly cep?: string;
}

export interface CreatePixChargeInput {
  /**
   * Chave de idempotência da ValidaPay. Reenvio com o mesmo valor devolve
   * `409 DUPLICATE_CHARGE` com o `chargeId` original em vez de cobrar de novo.
   */
  readonly externalId: string;
  readonly priceId: string;
  readonly customer: ChargeCustomer;
  readonly metadata: Readonly<Record<string, string>>;
}

/**
 * Dados de pagamento Pix, para EXIBIÇÃO apenas.
 *
 * Trafegam do gateway até a tela e morrem ali. **Nunca são persistidos nem
 * logados**: o `emv` é o código que move dinheiro, e um log de aplicação não é
 * lugar para ele. Ver a redação em `lib/logger.ts` e os testes de auditoria.
 */
export interface PixPaymentData {
  /** Copia-e-cola. */
  readonly emv: string;
  /** Imagem do QR em data URI, quando a API a devolve. */
  readonly qrCodeImage: string | null;
}

export interface CreateChargeResult {
  readonly chargeId: string;
  readonly customerId: string | null;
  /**
   * `true` quando o `chargeId` veio de `409 DUPLICATE_CHARGE`, e não de uma
   * criação nova. Resultado **equivalente** para efeito de recuperação — a
   * distinção existe só para observabilidade.
   */
  readonly duplicated: boolean;
  /**
   * `null` na recuperação por `409`: a resposta de erro não traz o Pix. Quem
   * precisa exibir consulta `getCharge`, que devolve o `emv` da cobrança
   * original.
   */
  readonly pix: PixPaymentData | null;
}

export interface ChargeSnapshot {
  readonly chargeId: string;
  /** Texto cru, não enum: um status novo precisa ser legível, não rejeitado. */
  readonly status: string;
  /** Única prova aceita de pagamento. Ver SubscriptionCheckoutService. */
  readonly paid: boolean;
  readonly subscriptionId: string | null;
  readonly paymentId: string | null;
  readonly paidAt: Date | null;
  /**
   * Pix da cobrança, para exibição. É o que permite reabrir a tela de
   * pagamento sem criar nada — e o que a recuperação por `409` usa, já que a
   * resposta de erro não traz o código.
   */
  readonly pix: PixPaymentData | null;
}

export interface ValidaPayChargesGateway {
  createPixCharge(input: CreatePixChargeInput): Promise<CreateChargeResult>;
  getCharge(chargeId: string): Promise<ChargeSnapshot>;
}

const STATUS_PAGO = "PAID";

interface RespostaDeCriacao {
  chargeId?: unknown;
  customerId?: unknown;
  pix?: { emv?: unknown; qrCode?: unknown } | null;
}

interface RespostaDeConsulta {
  chargeId?: unknown;
  status?: unknown;
  subscriptionId?: unknown;
  subscription?: { subscriptionId?: unknown } | null;
  paymentId?: unknown;
  endToEndId?: unknown;
  paidAt?: unknown;
  emvQrCode?: unknown;
  paymentDetails?: { emvQrCode?: unknown } | null;
}

async function createPixCharge(input: CreatePixChargeInput): Promise<CreateChargeResult> {
  let resposta: RespostaDeCriacao;

  try {
    resposta = await validaPayRequest<RespostaDeCriacao>({
      path: "/v1/charges",
      method: "POST",
      body: {
        paymentMethod: "pix",
        externalId: input.externalId,
        customer: input.customer,
        items: [{ priceId: input.priceId, quantity: 1 }],
        metadata: input.metadata,
      },
    });
  } catch (erro) {
    const duplicado = extrairChargeIdDuplicado(erro);
    if (duplicado) {
      return { chargeId: duplicado, customerId: null, duplicated: true, pix: null };
    }
    throw erro;
  }

  const chargeId = texto(resposta.chargeId);
  if (!chargeId) {
    // 200 sem identificador é indistinguível de falha para quem chamou: sem
    // chargeId não há como consultar, confirmar nem simular.
    throw new ValidaPayRequestError(200, "/v1/charges", "resposta sem chargeId");
  }

  return {
    chargeId,
    customerId: texto(resposta.customerId),
    duplicated: false,
    pix: montarPix(texto(resposta.pix?.emv), texto(resposta.pix?.qrCode)),
  };
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
    // A consulta expõe o mesmo código em dois lugares; a criação chama de
    // `pix.emv`. Quem consome não deveria conhecer os três nomes.
    pix: montarPix(
      texto(resposta.emvQrCode) ?? texto(resposta.paymentDetails?.emvQrCode),
      null,
    ),
  };
}

function montarPix(
  emv: string | null,
  qrCodeImage: string | null,
): PixPaymentData | null {
  return emv === null ? null : { emv, qrCodeImage };
}

export const validaPayCharges: ValidaPayChargesGateway = { createPixCharge, getCharge };

/**
 * `409 DUPLICATE_CHARGE` traz o `chargeId` da cobrança original no corpo.
 *
 * É a recuperação de um `POST` que a ValidaPay processou mas cuja resposta não
 * chegou — o caso medido em sandbox, onde o cliente expirou em 10 s e o
 * servidor concluiu normalmente. Sem ler este corpo, a tentativa ficaria sem
 * `chargeId` para sempre, e a única saída seria cobrar de novo.
 */
function extrairChargeIdDuplicado(erro: unknown): string | null {
  if (!(erro instanceof ValidaPayRequestError) || erro.status !== 409) return null;

  try {
    const corpo = JSON.parse(erro.responseBody) as {
      error?: { code?: unknown; details?: { chargeId?: unknown } };
    };
    if (corpo.error?.code !== "DUPLICATE_CHARGE") return null;
    return texto(corpo.error.details?.chargeId);
  } catch {
    // Corpo de erro nem sempre é JSON. Sem chargeId legível, o 409 sobe como
    // erro — inventar um identificador seria pior que falhar.
    return null;
  }
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function data(valor: unknown): Date | null {
  if (typeof valor !== "string" || valor.length === 0) return null;
  const convertida = new Date(valor);
  return Number.isNaN(convertida.getTime()) ? null : convertida;
}
