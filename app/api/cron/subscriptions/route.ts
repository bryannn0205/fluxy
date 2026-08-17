import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { subscriptionLifecycleService } from "@/services";

/**
 * Revisão agendada das assinaturas — Vercel Cron.
 *
 * **A rota não conhece regra de plano nenhuma.** Ela autentica e delega a
 * `SubscriptionLifecycleService`, o mesmo serviço que o webhook e a tela usam.
 * Reimplementar aqui criaria uma segunda definição de "assinatura cancelada", e
 * há teste afirmando que este arquivo não menciona estado de assinatura.
 *
 * Existe porque billing real não pode depender de um OWNER abrir uma página: uma
 * empresa que cancelou e nunca mais entra ficaria `ACTIVE` para sempre. É também
 * a única via capaz de agir quando `cancellation.effectiveAt` chega — nenhum
 * webhook avisa nesse instante.
 *
 * **Proteção pela forma oficial**: a Vercel envia o valor de `CRON_SECRET` no
 * header `Authorization`, com o prefixo `Bearer`. Nada de header inventado, e
 * nenhum segredo chega ao navegador — a variável é de servidor e a rota nunca é
 * chamada pelo cliente.
 *
 * `GET` porque é o método que a Vercel usa. A operação é idempotente, então não
 * viola a semântica do verbo: rodar duas vezes tem o mesmo efeito de rodar uma.
 * Isso importa aqui — a documentação da Vercel avisa que a entrega de cron é
 * "best effort" e pode ser perdida OU repetida.
 */
export async function GET(request: Request): Promise<Response> {
  if (!autorizado(request.headers.get("authorization"))) {
    // Sem detalhar o motivo: dizer a quem falhou por que falhou ajuda mais quem
    // sonda do que quem integra.
    logger.warn("Execução agendada recusada", { resource: "subscription_cron" });
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const resumo = await subscriptionLifecycleService.revisarAssinaturasDaPlataforma();

    return Response.json(resumo, { status: 200 });
  } catch (erro) {
    // A Vercel não repete uma execução que falhou, e a próxima janela é o
    // mecanismo de recuperação: como a revisão é idempotente e reconciliatória,
    // o trabalho pendente é reavaliado na íntegra na próxima passada.
    logger.error("Falha na execução agendada de assinaturas", {
      resource: "subscription_cron",
      erro: erro instanceof Error ? erro.name : "desconhecido",
    });
    return Response.json({ error: "Falha na revisão" }, { status: 500 });
  }
}

/**
 * `Authorization: Bearer <CRON_SECRET>`, em tempo constante.
 *
 * **Falha fechada.** Sem `CRON_SECRET` configurado não existe modo permissivo: a
 * alternativa — aceitar quando não há o que verificar — transformaria uma
 * variável esquecida num endpoint público capaz de cancelar assinaturas.
 */
function autorizado(header: string | null): boolean {
  const segredo = env.CRON_SECRET;
  if (!segredo || !header) return false;

  const esperado = Buffer.from(`Bearer ${segredo}`, "utf8");
  const recebido = Buffer.from(header, "utf8");

  // `timingSafeEqual` lança com tamanhos diferentes; o comprimento não vaza nada
  // além do que o formato já revela.
  if (esperado.length !== recebido.length) return false;

  return timingSafeEqual(esperado, recebido);
}
