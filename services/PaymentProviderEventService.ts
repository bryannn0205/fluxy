import { createHash } from "node:crypto";

import type { ProviderEventStatus } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import type { ValidaPaySubscriptionsGateway } from "@/lib/validapay/subscriptions";
import type { CompanyRepository } from "@/repositories/interfaces/CompanyRepository";
import type { PaymentProviderEventRepository } from "@/repositories/interfaces/PaymentProviderEventRepository";
import type { SubscriptionCheckoutRepository } from "@/repositories/interfaces/SubscriptionCheckoutRepository";
import type { SubscriptionCheckoutService } from "@/services/SubscriptionCheckoutService";
import type { SubscriptionLifecycleService } from "@/services/SubscriptionLifecycleService";

/**
 * Eventos que disparam confirmação de pagamento.
 *
 * **São gatilhos, não provas.** Nenhum deles ativa nada por si: o que decide é
 * `GET /v1/charges/:id` com `status = PAID`. `subscription.activated` entra na
 * lista porque no fluxo de cartão o `payment.success` não dispara — mas
 * mesmo ele só serve para indicar QUAL cobrança consultar.
 */
const EVENTOS_DE_CONFIRMACAO = new Set([
  "payment.success",
  "subscription.activated",
  "charge.created",
]);

/**
 * Eventos do ciclo de vida de uma assinatura JÁ ativa.
 *
 * `subscription.renewed` saiu da lista de confirmação: aquele caminho exige uma
 * tentativa `PENDING`, e depois do primeiro pagamento a tentativa está
 * `COMPLETED` — a renovação caía num no-op silencioso. A ativação inicial
 * continua com três gatilhos e a reconciliação como rede.
 *
 * `subscription.canceled` entra aqui, e não numa lista de falha: cancelar não é
 * falhar, e a ValidaPay cancela ao FIM do período pago.
 */
const EVENTOS_DE_CICLO_DE_VIDA = new Set([
  "subscription.canceled",
  "subscription.renewed",
]);

/**
 * Eventos que indicam que a cobrança não vai se concretizar.
 *
 * **Também são gatilhos, não provas** — pela mesma razão dos de confirmação, e
 * na mesma direção: quem decide continua sendo `GET /v1/charges/:id`. Um
 * `payment.failed` sobre uma cobrança que a API reporta paga não encerra nada.
 *
 * Cobre os dois casos de `payment.failed`, que são distintos: falha no checkout
 * inicial encerra a tentativa local; falha de um ciclo de assinatura já ativa
 * não tem tentativa `PENDING` e leva a empresa a `PAST_DUE`. A discriminação
 * está em `registrarFalha`.
 */
const EVENTOS_DE_FALHA = new Set(["payment.failed"]);

/** Chave de metadata que o Fluxy escreve ao criar a cobrança. */
const CHAVE_DE_CORRELACAO = "subscriptionCheckoutId";

export interface ProcessarEventoInput {
  /** Texto EXATO do corpo. Usado só para o hash — nunca persistido nem logado. */
  readonly rawBody: string;
  /** Corpo já convertido, depois da assinatura verificada. */
  readonly payload: Record<string, unknown>;
}

export interface ProcessarEventoResult {
  readonly eventId: string;
  readonly status: ProviderEventStatus;
  /** `true` se esta entrega ativou uma assinatura. Só para observabilidade. */
  readonly ativou: boolean;
}

/**
 * Recepção de webhooks da ValidaPay.
 *
 * Grava PRIMEIRO, processa depois: um evento que falhe ao ser correlacionado
 * continua registrado, em vez de sumir. A gravação é append-only e sem PII —
 * o corpo bruto vira hash e é descartado.
 */
export class PaymentProviderEventService {
  constructor(
    private readonly events: PaymentProviderEventRepository,
    private readonly checkouts: SubscriptionCheckoutRepository,
    private readonly checkoutService: SubscriptionCheckoutService,
    private readonly subscriptions: ValidaPaySubscriptionsGateway,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly companies: CompanyRepository,
  ) {}

  async processar({
    rawBody,
    payload,
  }: ProcessarEventoInput): Promise<ProcessarEventoResult> {
    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    const eventType = texto(payload.event) ?? "desconhecido";

    const { event, created } = await this.events.record({
      eventType,
      payloadHash,
      // NUNCA do payload: `companyId` vindo de fora permitiria a um corpo
      // forjado apontar para a empresa que quisesse. Preenchido só depois,
      // a partir da tentativa local que a correlação encontrar.
      companyId: null,
      externalChargeId: texto(payload.chargeId),
      externalPaymentId: texto(payload.paymentId),
      externalSubscriptionId: texto(payload.subscriptionId),
      occurredAt: data(payload.timestamp) ?? data(payload.paidAt),
    });

    if (!created) {
      return this.resolverDuplicata(event.id, event.status, eventType, payload);
    }

    return this.despachar(event.id, eventType, payload);
  }

  /**
   * Encaminha pelo TIPO do evento.
   *
   * Um tipo que não esteja em nenhuma das duas listas vira `IGNORED`:
   * registrado para que se saiba que chegou, sem inventar comportamento para
   * ele. É o caso de `subscription.created`, `subscription.trial` e
   * `subscription.canceled`.
   */
  private async despachar(
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<ProcessarEventoResult> {
    if (EVENTOS_DE_CONFIRMACAO.has(eventType)) {
      return this.confirmar(eventId, eventType, payload);
    }

    if (EVENTOS_DE_FALHA.has(eventType)) {
      return this.registrarFalha(eventId, eventType, payload);
    }

    if (EVENTOS_DE_CICLO_DE_VIDA.has(eventType)) {
      return this.revisarCicloDeVida(eventId, eventType, payload);
    }

    await this.events.markStatus(eventId, "IGNORED");
    return { eventId, status: "IGNORED", ativou: false };
  }

  /**
   * Renovação e cancelamento de assinatura já ativa.
   *
   * Correlaciona pelo `subscriptionId` do corpo contra
   * `Company.validapaySubscriptionId` — coluna escrita pelo servidor na
   * ativação. O evento diz QUAL assinatura olhar; quem decide é
   * `GET /v1/subscriptions/:id`.
   */
  private async revisarCicloDeVida(
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<ProcessarEventoResult> {
    const subscriptionId = texto(payload.subscriptionId);

    if (!subscriptionId) {
      // Sem identificador não há o que consultar, e o mesmo corpo não traria.
      await this.events.markStatus(eventId, "FAILED");
      return { eventId, status: "FAILED", ativou: false };
    }

    try {
      const resultado = await this.lifecycle.revisarPorAssinatura(subscriptionId);

      if (resultado === "NAO_CORRELACIONADA") {
        logger.warn("Evento de assinatura sem empresa correspondente", {
          resource: "payment_provider_event",
          resourceId: eventId,
          eventType,
        });
        await this.events.markStatus(eventId, "FAILED");
        return { eventId, status: "FAILED", ativou: false };
      }

      await this.eventoDaEmpresaDaAssinatura(eventId, subscriptionId);
      await this.events.markStatus(eventId, "PROCESSED");
      return { eventId, status: "PROCESSED", ativou: false };
    } catch (erro) {
      logger.warn("Falha transitória ao revisar ciclo de vida da assinatura", {
        resource: "payment_provider_event",
        resourceId: eventId,
        eventType,
        erro: erro instanceof Error ? erro.name : "desconhecido",
      });
      await this.events.markStatus(eventId, "PENDING");
      return { eventId, status: "PENDING", ativou: false };
    }
  }

  /** Vincula o evento à empresa, para auditoria. Nunca vem do payload. */
  private async eventoDaEmpresaDaAssinatura(
    eventId: string,
    subscriptionId: string,
  ): Promise<void> {
    const company = await this.companies.findByValidapaySubscriptionId(subscriptionId);
    if (company) await this.events.attachCompany(eventId, company.id);
  }

  /**
   * Entrega repetida do MESMO corpo.
   *
   * `PROCESSED`/`IGNORED` já tiveram desfecho — reexecutar só gastaria uma
   * consulta. `PENDING` ficou pela metade e ganha nova chance. `FAILED` fica
   * para investigação: nesta versão significa que não houve como correlacionar,
   * e o mesmo corpo não traria a informação que faltou.
   */
  private async resolverDuplicata(
    eventId: string,
    status: ProviderEventStatus,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<ProcessarEventoResult> {
    if (status === "PENDING") {
      return this.despachar(eventId, eventType, payload);
    }

    return { eventId, status, ativou: false };
  }

  private async confirmar(
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<ProcessarEventoResult> {
    return this.aplicar(eventId, eventType, payload, (checkoutId) =>
      // O ÚNICO caminho de ativação. Consulta GET /v1/charges/:id e só segue
      // com PAID — o status do payload não participa da decisão.
      this.checkoutService.confirmarSeChargePago(checkoutId),
    );
  }

  /**
   * Encerra a tentativa correlacionada, sem encostar na empresa.
   *
   * A decisão final continua sendo da consulta: se a cobrança estiver paga, o
   * service ativa em vez de encerrar. Um evento de falha nunca rebaixa plano.
   */
  private async registrarFalha(
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<ProcessarEventoResult> {
    const subscriptionId = texto(payload.subscriptionId);

    // Falha de CICLO tem precedência quando a assinatura já é de uma empresa
    // conhecida. A discriminação é exata: no checkout inicial a empresa ainda
    // não tem `validapaySubscriptionId`, então a correlação falha e o fluxo cai
    // no caminho da tentativa local, que é o certo para aquele caso.
    if (subscriptionId) {
      try {
        const resultado = await this.lifecycle.registrarFalhaDeCiclo(
          subscriptionId,
          texto(payload.chargeId),
        );

        if (resultado !== "NAO_CORRELACIONADA") {
          await this.eventoDaEmpresaDaAssinatura(eventId, subscriptionId);
          await this.events.markStatus(eventId, "PROCESSED");
          return { eventId, status: "PROCESSED", ativou: false };
        }
      } catch (erro) {
        logger.warn("Falha transitória ao registrar inadimplência", {
          resource: "payment_provider_event",
          resourceId: eventId,
          eventType,
          erro: erro instanceof Error ? erro.name : "desconhecido",
        });
        await this.events.markStatus(eventId, "PENDING");
        return { eventId, status: "PENDING", ativou: false };
      }
    }

    return this.aplicar(eventId, eventType, payload, (checkoutId) =>
      this.checkoutService.encerrarSeNaoPago(checkoutId),
    );
  }

  /**
   * Correlaciona e executa o efeito, com o mesmo tratamento de insucesso.
   *
   * Confirmação e falha compartilham tudo menos a última chamada: a mesma
   * correlação, os mesmos dois modos de insucesso — API indisponível (fica
   * `PENDING`, alguém tenta de novo) e correlação impossível (fica `FAILED`,
   * porque o mesmo corpo não traria o que falta) — e o mesmo vínculo de
   * empresa. Duplicar isso faria os dois caminhos divergirem em silêncio.
   */
  private async aplicar(
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    efeito: (checkoutId: string) => Promise<boolean>,
  ): Promise<ProcessarEventoResult> {
    let checkoutId: string | null;

    try {
      checkoutId = await this.correlacionar(payload);
    } catch (erro) {
      // A correlação chamou a API e ela falhou: transitório. Fica PENDING
      // para a próxima entrega ou para a reconciliação servidor.
      logger.warn("Falha transitória ao correlacionar evento de pagamento", {
        resource: "payment_provider_event",
        resourceId: eventId,
        eventType,
        erro: erro instanceof Error ? erro.name : "desconhecido",
      });
      await this.events.markStatus(eventId, "PENDING");
      return { eventId, status: "PENDING", ativou: false };
    }

    if (!checkoutId) {
      // Nenhum dos três caminhos chegou a uma tentativa local. O mesmo corpo
      // não traria o que falta — reprocessar automaticamente seria laço.
      logger.warn("Evento de pagamento sem correlação possível", {
        resource: "payment_provider_event",
        resourceId: eventId,
        eventType,
      });
      await this.events.markStatus(eventId, "FAILED");
      return { eventId, status: "FAILED", ativou: false };
    }

    const checkout = await this.checkouts.findById(checkoutId);
    if (checkout) {
      await this.events.attachCompany(eventId, checkout.companyId);
    }

    let ativou: boolean;
    try {
      ativou = await efeito(checkoutId);
    } catch (erro) {
      logger.warn("Falha transitória ao confirmar cobrança de evento", {
        resource: "payment_provider_event",
        resourceId: eventId,
        eventType,
        erro: erro instanceof Error ? erro.name : "desconhecido",
      });
      await this.events.markStatus(eventId, "PENDING");
      return { eventId, status: "PENDING", ativou: false };
    }

    await this.events.markStatus(eventId, "PROCESSED");
    return { eventId, status: "PROCESSED", ativou };
  }

  /**
   * Três caminhos, em ordem de confiabilidade.
   *
   * @throws quando a consulta à API falha — quem chama trata como transitório
   */
  private async correlacionar(payload: Record<string, unknown>): Promise<string | null> {
    // A. `chargeId` é o identificador que NÓS gravamos ao criar a cobrança.
    const chargeId = texto(payload.chargeId);
    if (chargeId) {
      const porCharge = await this.checkouts.findByChargeId(chargeId);
      if (porCharge) return porCharge.id;
    }

    const subscriptionId = texto(payload.subscriptionId);

    // B. `metadata` do corpo — dado EXTERNO. Só vale se a tentativa existir,
    // for do provedor esperado e não contradisser o `chargeId` do mesmo corpo.
    const doCorpo = idDeMetadata(payload.metadata);
    if (doCorpo) {
      const candidato = await this.checkouts.findById(doCorpo);
      if (candidato && aceitavel(candidato, chargeId)) return candidato.id;
    }

    // C. Sem correlação local: pergunta à API de quem é a assinatura. A
    // metadata devolvida por ela é confirmada na fonte, não afirmada pelo
    // remetente do webhook.
    if (subscriptionId) {
      const assinatura = await this.subscriptions.getSubscription(subscriptionId);
      const daApi = idDeMetadata(assinatura.metadata);
      if (daApi) {
        const candidato = await this.checkouts.findById(daApi);
        if (candidato && aceitavel(candidato, chargeId)) return candidato.id;
      }
    }

    return null;
  }
}

/**
 * A tentativa apontada por metadata é confiável?
 *
 * Duas condições. **Provedor esperado**, porque a chave de correlação não
 * carrega provedor e um id de outro gateway não deve atravessar. E **sem
 * contradição com o `chargeId` do corpo**: se a tentativa já tem uma cobrança
 * gravada e ela é OUTRA, a metadata está errada ou forjada — aceitar ativaria
 * o plano da empresa errada, que é exatamente o ataque que o registro próprio
 * existe para impedir.
 */
function aceitavel(
  checkout: { provider: string; externalChargeId: string | null },
  chargeIdDoEvento: string | null,
): boolean {
  if (checkout.provider !== "VALIDAPAY") return false;

  if (
    chargeIdDoEvento !== null &&
    checkout.externalChargeId !== null &&
    checkout.externalChargeId !== chargeIdDoEvento
  ) {
    return false;
  }

  return true;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function data(valor: unknown): Date | null {
  if (typeof valor !== "string" || valor.length === 0) return null;
  const convertida = new Date(valor);
  return Number.isNaN(convertida.getTime()) ? null : convertida;
}

function idDeMetadata(metadata: unknown): string | null {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return texto((metadata as Record<string, unknown>)[CHAVE_DE_CORRELACAO]);
}
