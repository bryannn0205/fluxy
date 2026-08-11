import { validaPayRequest } from "@/lib/validapay/client";

/**
 * Leitura de assinatura — `GET /v1/subscriptions/:subscriptionId`.
 *
 * Existe para UM caso: um evento de assinatura chega sem `chargeId` e sem
 * `metadata` no corpo, e a única forma de voltar à tentativa local é perguntar
 * à API de quem é aquela assinatura. O `metadata` enviado na criação da
 * cobrança propaga para a assinatura — comprovado em sandbox —, então a
 * resposta desta consulta reencontra o `subscriptionCheckoutId`.
 *
 * **Somente leitura.** Módulo separado de `charges.ts` porque é outro recurso;
 * juntar os dois faria o nome do arquivo mentir sobre o que ele alcança.
 */

export interface SubscriptionSnapshot {
  readonly subscriptionId: string;
  readonly status: string;
  /**
   * Metadata devolvida pela API — a única fonte confiável dela, já que o
   * payload do webhook é dado externo e pode não trazê-la.
   */
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ValidaPaySubscriptionsGateway {
  getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot>;
}

interface RespostaDeAssinatura {
  subscriptionId?: unknown;
  status?: unknown;
  metadata?: unknown;
}

async function getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
  const resposta = await validaPayRequest<RespostaDeAssinatura>({
    path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  });

  return {
    subscriptionId:
      typeof resposta.subscriptionId === "string" && resposta.subscriptionId.length > 0
        ? resposta.subscriptionId
        : subscriptionId,
    status: typeof resposta.status === "string" ? resposta.status : "",
    metadata:
      resposta.metadata !== null &&
      typeof resposta.metadata === "object" &&
      !Array.isArray(resposta.metadata)
        ? (resposta.metadata as Record<string, unknown>)
        : {},
  };
}

export const validaPaySubscriptions: ValidaPaySubscriptionsGateway = { getSubscription };
