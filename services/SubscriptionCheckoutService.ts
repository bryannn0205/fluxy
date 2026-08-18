import type {
  BillingInterval,
  Plan,
  Role,
  SubscriptionCheckout,
  SubscriptionCheckoutStatus,
} from "@/lib/generated/prisma/client";
import { ROUTES } from "@/lib/constants";
import { env } from "@/lib/env";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { assertPermission } from "@/lib/permissions";
import type { ChargeSnapshot, ValidaPayChargesGateway } from "@/lib/validapay/charges";
import type { ValidaPayCheckoutSessionsGateway } from "@/lib/validapay/checkout-sessions";
import { ValidaPayRequestError, ValidaPayTimeoutError } from "@/lib/validapay/errors";
import type { PlanRepository } from "@/repositories/interfaces/PlanRepository";
import type { SubscriptionCheckoutRepository } from "@/repositories/interfaces/SubscriptionCheckoutRepository";
import type { IniciarCheckoutInput } from "@/schemas/subscription-checkout.schema";

/**
 * Janela para reaproveitar uma tentativa `PENDING`.
 *
 * **Decisão de negócio**, não imposição da API. Trinta minutos é tempo de sobra
 * para concluir um pagamento na página hospedada; passado isso, insistir na
 * mesma sessão provavelmente apresentaria uma página vencida.
 */
const JANELA_DE_REAPROVEITAMENTO_MS = 30 * 60 * 1000;

type CompanyComPapel = { id: string; role: Role };

export interface PlanoParaCheckout {
  planId: string;
  name: string;
  billingInterval: BillingInterval;
  valor: number;
  disponivelParaContratacao: boolean;
}

export interface CheckoutResumo {
  checkoutId: string;
  /**
   * Página hospedada da ValidaPay, onde o cliente escolhe Pix ou cartão.
   *
   * `null` quando a tentativa já foi resolvida — não se manda ninguém pagar de
   * novo o que já está pago — ou quando a sessão ficou irrecuperável.
   */
  url: string | null;
  status: SubscriptionCheckoutStatus;
}

/**
 * Contratação de plano — abertura da sessão hospedada e ativação.
 *
 * **O pagamento acontece inteiramente na ValidaPay.** O Fluxy cria a sessão com
 * o `priceId` resolvido no servidor, manda o cliente para lá, e volta a ouvir só
 * quando um evento chega. Nenhum dado de pagamento — número de cartão, CVV,
 * chave Pix — entra neste processo.
 *
 * **Só uma consulta oficial ativa um plano.** `GET /v1/charges/:id` com
 * `status = PAID`. Nem a resposta da criação da sessão, nem o retorno do
 * cliente pela `successUrl`, nem o corpo de um webhook. Webhook e reconciliação
 * são gatilhos que convergem aqui.
 */
export class SubscriptionCheckoutService {
  constructor(
    private readonly repository: SubscriptionCheckoutRepository,
    private readonly planRepository: PlanRepository,
    private readonly sessions: ValidaPayCheckoutSessionsGateway,
    private readonly charges: ValidaPayChargesGateway,
  ) {}

  /**
   * Abre (ou reaproveita) uma tentativa e garante a sessão de pagamento.
   *
   * **Não altera plano nem status da empresa.** A tentativa nasce `PENDING` e
   * assim fica até um pagamento confirmado na fonte oficial.
   *
   * @throws {ForbiddenError} papel sem `subscription:manage`
   * @throws {ValidationError} plano inexistente ou sem preço na ValidaPay
   */
  async iniciarCheckout(
    input: IniciarCheckoutInput,
    company: CompanyComPapel,
  ): Promise<CheckoutResumo> {
    assertPermission(company.role, "subscription", "manage");

    const plano = await this.planRepository.findById(input.planId);
    if (!plano) {
      throw new ValidationError({ planId: ["Plano não encontrado"] });
    }

    // Falha aqui, antes de criar a tentativa: sem preço remoto a sessão não
    // teria como ser aberta, e a linha ficaria órfã por um erro de cadastro.
    this.exigirPrecoRemoto(plano, input.billingInterval);

    // Sob lock, com janela de reuso: dois cliques simultâneos convergem para a
    // MESMA tentativa local, que é o que impede duas sessões externas.
    const { checkout } = await this.repository.findOrCreatePending({
      companyId: company.id,
      intendedPlanId: plano.id,
      billingInterval: input.billingInterval,
      reuseWindowMs: JANELA_DE_REAPROVEITAMENTO_MS,
    });

    return this.garantirSessaoCriada(checkout.id);
  }

  /**
   * Garante que a tentativa tenha sessão hospedada, sem nunca criar a segunda.
   *
   * A ordem importa: **reuso antes de criação**. Se a tentativa já tem sessão
   * gravada, devolve aquela URL e não fala com a ValidaPay — é o que faz o
   * clique duplo convergir.
   */
  async garantirSessaoCriada(subscriptionCheckoutId: string): Promise<CheckoutResumo> {
    const checkout = await this.repository.findById(subscriptionCheckoutId);
    if (!checkout) {
      throw new ValidationError({
        checkoutId: ["Tentativa de contratação não encontrada"],
      });
    }

    if (checkout.status !== "PENDING") {
      return resumo(checkout.id, null, checkout.status);
    }

    const reaproveitada = this.reaproveitarSessao(checkout);
    if (reaproveitada !== undefined) {
      return resumo(checkout.id, reaproveitada, checkout.status);
    }

    const plano = await this.planRepository.findById(checkout.intendedPlanId);
    if (!plano) {
      throw new ValidationError({ planId: ["Plano não encontrado"] });
    }

    const priceId = this.exigirPrecoRemoto(plano, checkout.billingInterval);

    let sessao;
    try {
      sessao = await this.sessions.createSession({
        priceId,
        // Único caminho de volta a esta tentativa. Sobrevive na consulta da
        // sessão e propaga para a assinatura criada pela ValidaPay.
        metadata: { subscriptionCheckoutId: checkout.id },
        successUrl: urlDeRetorno(checkout.id, "sucesso"),
        failureUrl: urlDeRetorno(checkout.id, "falha"),
      });
    } catch (erro) {
      if (erro instanceof ValidaPayTimeoutError) {
        // Não marca FAILED: a sessão pode ter sido criada do outro lado, e a
        // tentativa segue válida. Diferente do Pix, aqui não há `externalId`
        // para recuperar — a próxima chamada abrirá outra sessão, e a de fora
        // fica órfã sem ser paga. Ver o risco residual documentado no relatório.
        logger.warn("Timeout ao criar sessão — tentativa segue PENDING", {
          companyId: checkout.companyId,
          resource: "subscription_checkout",
          resourceId: checkout.id,
        });
        throw erro;
      }

      if (naoAdiantaRepetir(erro)) {
        await this.repository.markFailed(checkout.id);
      }
      throw erro;
    }

    // Condicional: se outra execução gravou primeiro, a dela vence e esta
    // sessão recém-criada é simplesmente abandonada, nunca apresentada.
    const atualizado = await this.repository.attachSession(checkout.id, sessao);

    return resumo(
      atualizado.id,
      atualizado.externalSessionUrl ?? sessao.url,
      atualizado.status,
    );
  }

  /**
   * A tentativa já tem sessão utilizável?
   *
   * - `string` — reaproveita esta URL, exatamente como a ValidaPay a devolveu
   * - `null` — estado incompleto: NÃO reaproveita e NÃO cria outra
   * - `undefined` — não há sessão; pode criar
   *
   * **O estado incompleto é tratado como irrecuperável de propósito.** Ter
   * identificador sem URL só aconteceria por linha anterior a esta coluna ou
   * escrita parcial fora deste código. As duas saídas seriam piores: derivar a
   * URL do identificador depende de um formato que a ValidaPay não documenta, e
   * criar outra sessão em cima de uma que já existe é justamente a duplicidade
   * que a escrita condicional existe para evitar. Melhor parar e pedir ajuda.
   */
  private reaproveitarSessao(checkout: SubscriptionCheckout): string | null | undefined {
    if (checkout.externalSessionId && checkout.externalSessionUrl) {
      return checkout.externalSessionUrl;
    }

    if (checkout.externalSessionId && !checkout.externalSessionUrl) {
      logger.error("Tentativa com sessão sem URL — não é possível retomar", {
        companyId: checkout.companyId,
        resource: "subscription_checkout",
        resourceId: checkout.id,
      });
      return null;
    }

    return undefined;
  }

  /**
   * Estado da tentativa para a página de RETORNO, escopado à empresa da sessão.
   *
   * Consulta a fonte oficial e ativa se houver pagamento confirmado. É o que
   * permite a tela dizer "confirmado" sem nunca acreditar na URL que trouxe o
   * cliente de volta.
   *
   * @throws {NotFoundError} tentativa inexistente OU de outra empresa — a
   *         distinção não é feita de propósito: dizer "existe, mas não é sua"
   *         confirmaria a existência de um registro alheio.
   */
  async consultarParaExibicao(
    subscriptionCheckoutId: string,
    companyId: string,
  ): Promise<CheckoutResumo> {
    const checkout = await this.repository.findByIdForCompany(
      subscriptionCheckoutId,
      companyId,
    );
    if (!checkout) {
      throw new NotFoundError("Tentativa de contratação");
    }

    if (checkout.status !== "PENDING") {
      return resumo(checkout.id, null, checkout.status);
    }

    // Sem cobrança conhecida ainda, o pagamento pode simplesmente não ter
    // chegado até nós — a tela mostra "aguardando", nunca "não pago".
    const ativou = checkout.externalChargeId
      ? await this.confirmarSeChargePago(checkout.id)
      : false;

    return resumo(
      checkout.id,
      checkout.externalSessionUrl,
      ativou ? "COMPLETED" : checkout.status,
    );
  }

  /**
   * Dados do plano para a tela de contratação.
   *
   * A disponibilidade sai daqui, e não da página, porque a regra é a mesma que
   * `iniciarCheckout` aplica: sem `priceId` remoto não há como cobrar. Duas
   * cópias divergiriam no dia em que a regra mudasse — e a tela ofereceria um
   * botão que o service recusaria.
   */
  async descreverPlanoParaCheckout(
    slug: string,
    intervalo: BillingInterval,
  ): Promise<PlanoParaCheckout | null> {
    const plano = await this.planRepository.findBySlug(slug);
    if (!plano) return null;

    const anual = intervalo === "YEARLY";
    const priceIdRemoto = anual
      ? plano.validapayPriceYearlyId
      : plano.validapayPriceMonthlyId;

    return {
      planId: plano.id,
      name: plano.name,
      billingInterval: intervalo,
      // `Decimal` vira número só aqui, para formatação — nunca para cálculo.
      valor: Number(anual ? plano.priceYearly : plano.priceMonthly),
      disponivelParaContratacao: priceIdRemoto !== null,
    };
  }

  /**
   * Garante que a tentativa é da empresa informada, antes de qualquer chamada
   * externa.
   *
   * @throws {NotFoundError} inexistente OU de outra empresa
   */
  async exigirTentativaDaEmpresa(
    subscriptionCheckoutId: string,
    companyId: string,
  ): Promise<void> {
    const checkout = await this.repository.findByIdForCompany(
      subscriptionCheckoutId,
      companyId,
    );
    if (!checkout) {
      throw new NotFoundError("Tentativa de contratação");
    }
  }

  /**
   * Confirma pela FONTE AUTORITATIVA e ativa, se pago.
   *
   * Chamada por webhook, tela de retorno e reconciliação — os três convergem no
   * mesmo `GET`. Idempotente: só a execução que vencer o claim atômico altera a
   * empresa.
   *
   * @param chargeIdDoEvento cobrança que o evento trouxe. No checkout hospedado
   *        a tentativa nasce sem cobrança — quem a revela é o evento, e este é
   *        o ponto em que ela passa a ser conhecida.
   * @returns `true` se esta execução foi a que ativou
   */
  async confirmarSeChargePago(
    subscriptionCheckoutId: string,
    chargeIdDoEvento: string | null = null,
  ): Promise<boolean> {
    let checkout = await this.repository.findById(subscriptionCheckoutId);
    if (!checkout || checkout.status !== "PENDING") return false;

    if (!checkout.externalChargeId && chargeIdDoEvento) {
      checkout = await this.repository.attachChargeId(checkout.id, chargeIdDoEvento);
    }

    if (!checkout.externalChargeId) return false;

    const cobranca = await this.charges.getCharge(checkout.externalChargeId);

    return this.aplicarConfirmacao(checkout, cobranca);
  }

  /**
   * Encerra a tentativa quando a cobrança não se concretizou.
   *
   * **A consulta decide, não o evento.** Um `payment.failed` que se refira a uma
   * cobrança que a API reporta `PAID` é contradição — e quem vence é a fonte
   * autoritativa, então nesse caso a tentativa é ATIVADA em vez de encerrada.
   *
   * **Nunca toca na empresa.** Uma tentativa frustrada encerra a si mesma; não
   * rebaixa plano, não mexe em assinatura e não cancela nada.
   *
   * @returns `true` se esta execução ativou — isto é, se a cobrança estava paga
   */
  async encerrarSeNaoPago(subscriptionCheckoutId: string): Promise<boolean> {
    const checkout = await this.repository.findById(subscriptionCheckoutId);
    if (!checkout || checkout.status !== "PENDING" || !checkout.externalChargeId) {
      return false;
    }

    const cobranca = await this.charges.getCharge(checkout.externalChargeId);

    if (cobranca.paid) {
      return this.aplicarConfirmacao(checkout, cobranca);
    }

    await this.repository.markFailed(checkout.id);

    logger.info("Tentativa de contratação encerrada sem pagamento", {
      companyId: checkout.companyId,
      resource: "subscription_checkout",
      resourceId: checkout.id,
    });

    return false;
  }

  /**
   * Decide e ativa a partir de um snapshot JÁ obtido.
   *
   * **Toda a regra de ativação vive aqui** — webhook, tela de retorno e
   * reconciliação convergem neste método, e não em três cópias dele.
   */
  private async aplicarConfirmacao(
    checkout: { id: string; companyId: string; intendedPlanId: string },
    cobranca: ChargeSnapshot,
  ): Promise<boolean> {
    if (!cobranca.paid) return false;

    const ativou = await this.repository.activateIfPending({
      subscriptionCheckoutId: checkout.id,
      companyId: checkout.companyId,
      intendedPlanId: checkout.intendedPlanId,
      validapaySubscriptionId: cobranca.subscriptionId,
    });

    if (ativou) {
      logger.info("Assinatura ativada por cobrança confirmada", {
        companyId: checkout.companyId,
        resource: "subscription_checkout",
        resourceId: checkout.id,
      });
    }

    return ativou;
  }

  private exigirPrecoRemoto(plano: Plan, intervalo: "MONTHLY" | "YEARLY"): string {
    const priceId =
      intervalo === "MONTHLY"
        ? plano.validapayPriceMonthlyId
        : plano.validapayPriceYearlyId;

    if (!priceId) {
      throw new ValidationError({
        billingInterval: ["Este plano ainda não está disponível para contratação"],
      });
    }

    return priceId;
  }
}

function resumo(
  checkoutId: string,
  url: string | null,
  status: SubscriptionCheckoutStatus,
): CheckoutResumo {
  return { checkoutId, url, status };
}

/**
 * Para onde a ValidaPay devolve o cliente.
 *
 * **Destino fechado, montado no servidor.** A tentativa viaja no caminho, e não
 * o resultado: a página de retorno consulta o estado real e nunca acredita na
 * URL que trouxe o visitante. `desfecho` só escolhe o texto exibido.
 */
function urlDeRetorno(subscriptionCheckoutId: string, desfecho: "sucesso" | "falha") {
  const parametros = new URLSearchParams({ checkout: subscriptionCheckoutId, desfecho });

  return `${env.NEXT_PUBLIC_APP_URL}${ROUTES.BILLING_CHECKOUT_RETURN}?${parametros.toString()}`;
}

/**
 * Erro que a mesma requisição repetida não resolveria.
 *
 * 4xx (fora de 429) é dado recusado: preço inexistente, formato inválido. 5xx e
 * rede ficam de fora de propósito — são transitórios, e marcar `FAILED` neles
 * fecharia uma tentativa que ainda poderia ser recuperada.
 */
function naoAdiantaRepetir(erro: unknown): boolean {
  return (
    erro instanceof ValidaPayRequestError &&
    erro.status >= 400 &&
    erro.status < 500 &&
    erro.status !== 429
  );
}
