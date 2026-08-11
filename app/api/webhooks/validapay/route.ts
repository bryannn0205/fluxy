import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  verificarAccessToken,
  verificarAssinatura,
} from "@/lib/validapay/webhook-signature";
import { paymentProviderEventService } from "@/services";

/**
 * Recepção de webhooks da ValidaPay.
 *
 * **Route Handler, não Server Action**: a requisição vem de fora, sem sessão,
 * e a autenticação é a assinatura HMAC do corpo — nada que o pipeline de
 * Server Action saiba fazer.
 *
 * Ordem inegociável: ler o corpo COMO TEXTO → verificar assinatura → só então
 * `JSON.parse`. Inverter isso quebraria o HMAC, que é calculado sobre os bytes
 * exatos recebidos.
 *
 * O webhook é GATILHO. Quem decide se um plano é ativado é
 * `GET /v1/charges/:id` com `status = PAID`, dentro do service.
 */
export async function POST(request: Request): Promise<Response> {
  // Antes de qualquer parsing. `request.json()` consumiria o corpo e devolveria
  // um objeto; reserializá-lo produziria bytes diferentes e a assinatura
  // deixaria de bater por defeito nosso.
  const rawBody = await request.text();

  const assinatura = verificarAssinatura({
    rawBody,
    header: request.headers.get("x-webhook-signature"),
    secret: env.VALIDAPAY_WEBHOOK_SECRET,
  });

  if (!assinatura.valido) {
    // O motivo vai para o log, nunca para a resposta: dizer a quem falhou por
    // que falhou ajuda mais quem sonda do que quem integra.
    logger.warn("Webhook ValidaPay recusado", {
      resource: "validapay_webhook",
      motivo: assinatura.motivo,
    });
    return recusar();
  }

  // Camada adicional, só quando configurada. Nunca substitui o HMAC — se
  // chegou aqui, a assinatura já é válida.
  if (
    !verificarAccessToken(
      request.headers.get("x-access-token"),
      env.VALIDAPAY_WEBHOOK_TOKEN,
    )
  ) {
    logger.warn("Webhook ValidaPay recusado", {
      resource: "validapay_webhook",
      motivo: "ACCESS_TOKEN_INVALIDO",
    });
    return recusar();
  }

  let payload: Record<string, unknown>;
  try {
    const convertido: unknown = JSON.parse(rawBody);
    if (
      convertido === null ||
      typeof convertido !== "object" ||
      Array.isArray(convertido)
    ) {
      throw new TypeError("corpo não é um objeto JSON");
    }
    payload = convertido as Record<string, unknown>;
  } catch {
    // Assinatura válida com corpo inválido: quem enviou é quem diz ser, mas
    // mandou algo que não dá para interpretar. 400 descreve isso; 401 mentiria
    // sobre a autenticação.
    logger.warn("Webhook ValidaPay com corpo inválido", {
      resource: "validapay_webhook",
    });
    return Response.json({ error: "Corpo inválido" }, { status: 400 });
  }

  try {
    const resultado = await paymentProviderEventService.processar({ rawBody, payload });

    // 200 assim que o evento está DURAVELMENTE gravado, mesmo que a
    // confirmação tenha ficado PENDING: a ValidaPay não documenta política de
    // retentativa, então não se pode contar com reenvio. A garantia de
    // ativação eventual é da reconciliação servidor, não desta resposta.
    return Response.json({ received: true, status: resultado.status }, { status: 200 });
  } catch (erro) {
    // Falha ao PERSISTIR. Responder 200 aqui afirmaria um recebimento que não
    // existe: o evento não ficou registrado em lugar nenhum.
    logger.error("Falha ao registrar evento de webhook", {
      resource: "validapay_webhook",
      erro: erro instanceof Error ? erro.name : "desconhecido",
    });
    return Response.json({ error: "Falha ao registrar evento" }, { status: 500 });
  }
}

/** Mesma resposta para assinatura e token: não distingue o que falhou. */
function recusar(): Response {
  return Response.json({ error: "Não autorizado" }, { status: 401 });
}
