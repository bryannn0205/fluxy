import type {
  BillingInterval,
  Company,
  Plan,
  Role,
  SubscriptionCheckoutStatus,
} from "@/lib/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { assertPermission } from "@/lib/permissions";
import type {
  ChargeCustomer,
  ChargeSnapshot,
  PixPaymentData,
  ValidaPayChargesGateway,
} from "@/lib/validapay/charges";
import { ValidaPayRequestError, ValidaPayTimeoutError } from "@/lib/validapay/errors";
import type { CompanyRepository } from "@/repositories/interfaces/CompanyRepository";
import type { PlanRepository } from "@/repositories/interfaces/PlanRepository";
import type { SubscriptionCheckoutRepository } from "@/repositories/interfaces/SubscriptionCheckoutRepository";
import type { IniciarCheckoutInput } from "@/schemas/subscription-checkout.schema";

/**
 * Janela para reaproveitar uma tentativa `PENDING`.
 *
 * **Decisão de negócio**, não imposição da API: passados 30 minutos o QR de Pix
 * provavelmente já não serve, e continuar apontando para ele deixaria o cliente
 * diante de um código morto. Reduzir o valor cria tentativas órfãs; aumentá-lo
 * insiste numa cobrança velha.
 */
const JANELA_DE_REAPROVEITAMENTO_MS = 30 * 60 * 1000;

/**
 * Prefixo do `externalId` enviado à ValidaPay.
 *
 * Derivado do id da tentativa, e **nunca de relógio ou aleatório**: é isso que
 * faz uma segunda tentativa da mesma contratação cair em `409 DUPLICATE_CHARGE`
 * — recuperando o `chargeId` original — em vez de abrir uma cobrança nova.
 */
const PREFIXO_EXTERNAL_ID = "fluxy-checkout-";

type CompanyComPapel = Company & { role: Role };

export interface PlanoParaCheckout {
  planId: string;
  name: string;
  billingInterval: BillingInterval;
  valor: number;
  disponivelParaContratacao: boolean;
}

export interface CheckoutResumo {
  checkoutId: string;
  chargeId: string | null;
  status: SubscriptionCheckoutStatus;
  /** Só para exibição. `null` quando ainda não há cobrança ou já foi paga. */
  pix: PixPaymentData | null;
}

/**
 * Contratação de plano pela ValidaPay — criação da cobrança e ativação.
 *
 * **Só `GET /v1/charges/:id` com `status = PAID` ativa um plano.** Nem a
 * resposta da criação, nem o payload de um webhook: a criação devolve uma
 * cobrança pendente, e o simulador oficial responde `PROCESSING` antes de
 * processar. Webhook e reconciliação são gatilhos que convergem aqui.
 */
export class SubscriptionCheckoutService {
  constructor(
    private readonly repository: SubscriptionCheckoutRepository,
    private readonly planRepository: PlanRepository,
    private readonly companyRepository: CompanyRepository,
    private readonly charges: ValidaPayChargesGateway,
  ) {}

  /**
   * Abre (ou reaproveita) uma tentativa e garante a cobrança na ValidaPay.
   *
   * **Não altera plano nem status da empresa.** A tentativa nasce `PENDING` e
   * assim fica até um pagamento confirmado.
   *
   * @throws {ForbiddenError} papel sem `subscription:manage`
   * @throws {ValidationError} plano inexistente, sem preço na ValidaPay, ou empresa sem CNPJ
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

    // Falha aqui, antes de criar a tentativa: sem preço remoto a cobrança não
    // teria como ser aberta, e a linha ficaria órfã por um erro de cadastro.
    this.exigirPrecoRemoto(plano, input.billingInterval);
    exigirDocumento(company);

    const { checkout } = await this.repository.findOrCreatePending({
      companyId: company.id,
      intendedPlanId: plano.id,
      billingInterval: input.billingInterval,
      reuseWindowMs: JANELA_DE_REAPROVEITAMENTO_MS,
    });

    return this.garantirChargeCriado(checkout.id);
  }

  /**
   * Garante que a tentativa tenha `externalChargeId`, reusando o mesmo
   * `externalId` determinístico.
   *
   * Existe porque um timeout do cliente **não** significa que o servidor
   * falhou: já foi medido em sandbox um `POST` que expirou aqui e foi
   * processado lá. Rechamar com o mesmo `externalId` recupera o `chargeId`
   * original pelo `409`; gerar um `externalId` novo cobraria duas vezes.
   *
   * @throws {ValidaPayTimeoutError} sem gravar nada — a tentativa segue `PENDING`
   */
  async garantirChargeCriado(subscriptionCheckoutId: string): Promise<CheckoutResumo> {
    const checkout = await this.repository.findById(subscriptionCheckoutId);
    if (!checkout) {
      throw new ValidationError({
        checkoutId: ["Tentativa de contratação não encontrada"],
      });
    }

    if (checkout.externalChargeId) {
      return resumo(checkout.id, checkout.externalChargeId, checkout.status, null);
    }

    const [plano, company] = await Promise.all([
      this.planRepository.findById(checkout.intendedPlanId),
      this.carregarEmpresa(checkout.companyId),
    ]);

    if (!plano) {
      throw new ValidationError({ planId: ["Plano não encontrado"] });
    }

    const priceId = this.exigirPrecoRemoto(plano, checkout.billingInterval);
    const documento = exigirDocumento(company);

    let resultado;
    try {
      resultado = await this.charges.createPixCharge({
        externalId: `${PREFIXO_EXTERNAL_ID}${checkout.id}`,
        priceId,
        customer: montarCliente(company, documento),
        // Propaga para a assinatura criada pela ValidaPay — é por aqui que um
        // webhook de assinatura, que não traz chargeId, volta a esta tentativa.
        metadata: { subscriptionCheckoutId: checkout.id },
      });
    } catch (erro) {
      if (erro instanceof ValidaPayTimeoutError) {
        // Não marca FAILED: a cobrança pode ter sido criada do outro lado.
        // A próxima chamada reusa o mesmo externalId e recupera pelo 409.
        logger.warn("Timeout ao criar cobrança — tentativa segue PENDING", {
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

    const atualizado = await this.repository.attachChargeId(
      checkout.id,
      resultado.chargeId,
    );

    // Recuperação por 409 não traz o Pix — a resposta de erro não o carrega.
    // Buscar aqui evita devolver uma tela de pagamento sem código para pagar.
    const pix =
      resultado.pix ??
      (resultado.duplicated ? await this.buscarPix(resultado.chargeId) : null);

    return resumo(atualizado.id, atualizado.externalChargeId, atualizado.status, pix);
  }

  /**
   * Estado da tentativa para a TELA, escopado à empresa da sessão.
   *
   * Faz **uma** chamada externa e a reaproveita para as duas coisas que a tela
   * precisa: confirmar autoritativamente (e ativar, se pago) e obter o Pix
   * para exibir. Consultar duas vezes seria pagar dobrado pela mesma verdade.
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

    // Sem cobrança ou já resolvida: não há o que consultar lá fora.
    if (checkout.status !== "PENDING" || !checkout.externalChargeId) {
      return resumo(checkout.id, checkout.externalChargeId, checkout.status, null);
    }

    const cobranca = await this.charges.getCharge(checkout.externalChargeId);
    const ativou = await this.aplicarConfirmacao(checkout, cobranca);

    return resumo(
      checkout.id,
      checkout.externalChargeId,
      ativou ? "COMPLETED" : checkout.status,
      // Cobrança paga não precisa mais de código para pagar.
      cobranca.paid ? null : cobranca.pix,
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

  private async buscarPix(chargeId: string): Promise<PixPaymentData | null> {
    try {
      return (await this.charges.getCharge(chargeId)).pix;
    } catch {
      // O `chargeId` já está gravado; ficar sem o código para exibir é
      // recuperável pela própria tela, e falhar aqui perderia essa gravação.
      return null;
    }
  }

  /**
   * Confirma pela FONTE AUTORITATIVA e ativa, se pago.
   *
   * Chamada por webhook, polling e reconciliação — os três convergem no mesmo
   * `GET`. Idempotente: só a execução que vencer o claim atômico altera a
   * empresa.
   *
   * @returns `true` se esta execução foi a que ativou
   */
  async confirmarSeChargePago(subscriptionCheckoutId: string): Promise<boolean> {
    const checkout = await this.repository.findById(subscriptionCheckoutId);
    if (!checkout || checkout.status !== "PENDING" || !checkout.externalChargeId) {
      return false;
    }

    const cobranca = await this.charges.getCharge(checkout.externalChargeId);

    return this.aplicarConfirmacao(checkout, cobranca);
  }

  /**
   * Encerra a tentativa quando a cobrança não se concretizou.
   *
   * **A consulta decide, não o evento.** Um `payment.failed` que se refira a
   * uma cobrança que a API reporta `PAID` é contradição — e quem vence é a
   * fonte autoritativa, então nesse caso a tentativa é ATIVADA em vez de
   * encerrada. Fechar como falha ali descartaria um pagamento real por causa
   * de um corpo de webhook fora de ordem.
   *
   * **Nunca toca na empresa no caminho de falha.** Uma tentativa frustrada
   * encerra a si mesma; não rebaixa plano, não mexe em assinatura e não
   * cancela nada. Rebaixar exigiria uma prova de cancelamento que este evento
   * não é.
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
   * Separado de `confirmarSeChargePago` para que a tela consulte a cobrança
   * uma vez só. **Toda a regra de ativação vive aqui** — webhook, polling e
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

  private async carregarEmpresa(companyId: string): Promise<Company> {
    const company = await this.companyRepository.findById(companyId);
    if (!company) {
      throw new ValidationError({ companyId: ["Empresa não encontrada"] });
    }
    return company;
  }
}

function resumo(
  checkoutId: string,
  chargeId: string | null,
  status: SubscriptionCheckoutStatus,
  pix: PixPaymentData | null,
): CheckoutResumo {
  return { checkoutId, chargeId, status, pix };
}

/**
 * A ValidaPay exige CPF/CNPJ do comprador mesmo sem cliente pré-cadastrado.
 * Sem ele a cobrança é recusada — melhor dizer isso antes de abrir a tentativa.
 */
function exigirDocumento(company: Company): string {
  const documento = company.cnpj?.replace(/\D/g, "") ?? "";

  if (documento.length !== 11 && documento.length !== 14) {
    throw new ValidationError({
      cnpj: ["Informe o CNPJ da empresa antes de contratar um plano"],
    });
  }

  return documento;
}

function montarCliente(company: Company, documentNumber: string): ChargeCustomer {
  return {
    name: company.name,
    email: company.email,
    documentNumber,
    ...(company.phone ? { phone: company.phone } : {}),
  };
}

/**
 * Erro que a mesma requisição repetida não resolveria.
 *
 * 4xx (fora de 429) é dado recusado: falta campo, preço não existe, formato
 * inválido. 5xx e rede ficam de fora de propósito — são transitórios, e marcar
 * `FAILED` neles fecharia uma tentativa que ainda poderia ser recuperada.
 */
function naoAdiantaRepetir(erro: unknown): boolean {
  return (
    erro instanceof ValidaPayRequestError &&
    erro.status >= 400 &&
    erro.status < 500 &&
    erro.status !== 429
  );
}
