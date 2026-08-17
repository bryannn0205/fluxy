import type { Company } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import type { ValidaPayChargesGateway } from "@/lib/validapay/charges";
import type {
  SubscriptionSnapshot,
  ValidaPaySubscriptionsGateway,
} from "@/lib/validapay/subscriptions";
import type { CompanyRepository } from "@/repositories/interfaces/CompanyRepository";

/**
 * Ciclo de vida da assinatura DEPOIS do primeiro pagamento.
 *
 * `SubscriptionCheckoutService` cuida da contratação e para quando a tentativa
 * fica `COMPLETED`. O que acontece depois — renovar, falhar, cancelar — não tem
 * tentativa local a que se pendurar, e é este serviço.
 *
 * **A correlação é `Company.validapaySubscriptionId`**, gravado pelo servidor no
 * momento da ativação. Nenhum identificador de empresa vem de payload externo: o
 * evento traz o `subscriptionId`, e é a nossa própria coluna que diz de quem ele
 * é. Um `subscriptionId` desconhecido não altera nada.
 *
 * **Webhook continua sendo sinal.** Todo caminho aqui consulta a fonte oficial
 * antes de mexer em estado — `GET /v1/subscriptions/:id` para cancelamento e
 * renovação, `GET /v1/charges/:id` para pagamento. O corpo do evento nunca é a
 * prova.
 *
 * **Nada aqui toca `planId` nem `trialEndsAt`.** Cancelar não rebaixa plano para
 * Standard, não recria teste e não apaga histórico: muda só
 * `subscriptionStatus`, e o gate de escrita já existente responde por bloquear
 * ou liberar a partir dele.
 */
export type ResultadoDeCicloDeVida =
  /** Sem `validapaySubscriptionId`: nada a revisar. */
  | "SEM_ASSINATURA"
  /** Assinatura desconhecida para este Fluxy. */
  | "NAO_CORRELACIONADA"
  /** Cancelamento pedido, mas o período pago ainda corre. Segue ACTIVE. */
  | "CANCELAMENTO_AGENDADO"
  /** Data efetiva alcançada e confirmada na fonte: virou CANCELED. */
  | "CANCELADA"
  /** Renovação comprovadamente não paga: virou PAST_DUE. */
  | "INADIMPLENTE"
  /** Estava PAST_DUE e o ciclo corrente consta pago: voltou a ACTIVE. */
  | "REATIVADA"
  /** Consultado, nada a mudar. */
  | "SEM_MUDANCA";

/**
 * Teto de assinaturas revisadas por execução, e revisões simultâneas.
 *
 * Mesmos números de `SubscriptionReconciliationService`, pelo mesmo motivo: cada
 * item custa uma chamada externa de até 10 s, e disparar o lote inteiro de uma
 * vez contra um gateway de pagamento é a forma mais rápida de ser limitado por
 * ele. O que sobrar entra na execução seguinte, pela ordem de `updatedAt`.
 */
const LOTE_MAXIMO = 50;
const CONCORRENCIA = 5;

export interface RevisaoDeAssinaturasResumo {
  /** Empresas que entraram no lote. */
  reviewed: number;
  /** Passaram a CANCELED por a data efetiva ter chegado. */
  canceled: number;
  /** Voltaram de PAST_DUE para ACTIVE. */
  reactivated: number;
  /** Cancelamento pedido, período pago ainda correndo — seguem ACTIVE. */
  cancelScheduled: number;
  /** Falharam na consulta. O motivo vai para o log. */
  failed: number;
}

export class SubscriptionLifecycleService {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly subscriptions: ValidaPaySubscriptionsGateway,
    private readonly charges: ValidaPayChargesGateway,
    /** Injetável para teste. A lógica temporal nunca lê o relógio direto. */
    private readonly agora: () => Date = () => new Date(),
  ) {}

  /**
   * Revisa uma empresa contra a fonte oficial e aplica o que for devido.
   *
   * Usado pela reconciliação e por eventos de assinatura. Idempotente: as
   * transições são condicionais ao estado de partida, então repetir a revisão
   * não repete efeito.
   */
  async revisarEmpresa(company: Company): Promise<ResultadoDeCicloDeVida> {
    const subscriptionId = company.validapaySubscriptionId;
    if (!subscriptionId) return "SEM_ASSINATURA";

    const assinatura = await this.subscriptions.getSubscription(subscriptionId);

    if (assinatura.cancelamentoAgendado) {
      return this.aplicarCancelamento(company, assinatura);
    }

    return this.aplicarRecuperacao(company, assinatura);
  }

  /**
   * Revisa as assinaturas da empresa contra a fonte oficial.
   *
   * **É o único mecanismo capaz de agir numa data futura.** A ValidaPay cancela
   * ao fim do período pago, e não existe evento no instante em que
   * `cancellation.effectiveAt` chega — nenhum webhook avisa "agora acabou".
   * Depender apenas de entrega deixaria a empresa `ACTIVE` para sempre depois de
   * cancelar.
   *
   * Também é a rede para entrega perdida, duplicada ou processada pela metade:
   * a revisão consulta a fonte e reaplica a mesma decisão, e as transições são
   * condicionais ao estado de partida — rodar duas vezes não produz efeito duas
   * vezes.
   *
   * Vive aqui, e não na reconciliação de checkouts, porque a decisão é de estado
   * de assinatura: juntar as duas faria aquele serviço conhecer regra que não é
   * dele. A action chama as duas passadas.
   */
  async revisarAssinaturasDaEmpresa(
    companyId: string,
  ): Promise<RevisaoDeAssinaturasResumo> {
    const empresas = await this.companies.listForLifecycleReview({
      companyId,
      limit: LOTE_MAXIMO,
    });

    const resumo: RevisaoDeAssinaturasResumo = {
      reviewed: empresas.length,
      canceled: 0,
      reactivated: 0,
      cancelScheduled: 0,
      failed: 0,
    };

    // Fila compartilhada: o próximo item vai para quem terminar primeiro.
    let proxima = 0;
    const trabalhar = async (): Promise<void> => {
      while (proxima < empresas.length) {
        const empresa = empresas[proxima++]!;

        try {
          const resultado = await this.revisarEmpresa(empresa);

          if (resultado === "CANCELADA") resumo.canceled++;
          else if (resultado === "REATIVADA") resumo.reactivated++;
          else if (resultado === "CANCELAMENTO_AGENDADO") resumo.cancelScheduled++;
        } catch (erro) {
          // Falha de um item não aborta o lote: a próxima empresa pode ter um
          // cancelamento a efetivar.
          resumo.failed++;
          logger.warn("Falha ao revisar assinatura", {
            companyId: empresa.id,
            resource: "subscription",
            erro: erro instanceof Error ? erro.name : "desconhecido",
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCORRENCIA, empresas.length) }, trabalhar),
    );

    if (resumo.reviewed > 0) {
      logger.info("Revisão de assinaturas concluída", {
        companyId,
        resource: "subscription",
        ...resumo,
      });
    }

    return resumo;
  }

  /** Mesma revisão, entrando pelo identificador que o evento trouxe. */
  async revisarPorAssinatura(subscriptionId: string): Promise<ResultadoDeCicloDeVida> {
    const company = await this.companies.findByValidapaySubscriptionId(subscriptionId);
    if (!company) return "NAO_CORRELACIONADA";

    return this.revisarEmpresa(company);
  }

  /**
   * Falha de pagamento num CICLO de assinatura já ativa.
   *
   * Distinto da falha no checkout inicial, que encerra a tentativa local: aqui
   * não há tentativa `PENDING`, e o que está em jogo é o acesso de uma empresa
   * que já foi ativada.
   *
   * **Só marca `PAST_DUE`, nunca `CANCELED`.** Uma falha de Pix pode ser
   * transitória; cancelamento definitivo exige a confirmação oficial de
   * cancelamento, que é outro caminho.
   *
   * A evidência é a cobrança: se a API disser que ela está paga, o evento estava
   * fora de ordem e a empresa não é penalizada — pelo contrário, a recuperação é
   * avaliada.
   */
  async registrarFalhaDeCiclo(
    subscriptionId: string,
    chargeId: string | null,
  ): Promise<ResultadoDeCicloDeVida> {
    const company = await this.companies.findByValidapaySubscriptionId(subscriptionId);
    if (!company) return "NAO_CORRELACIONADA";

    if (chargeId) {
      const cobranca = await this.charges.getCharge(chargeId);
      if (cobranca.paid) {
        // Contradição entre evento e fonte: a fonte manda.
        return this.revisarEmpresa(company);
      }
    }

    const marcou = await this.companies.transitionSubscriptionStatus({
      companyId: company.id,
      // Só de ACTIVE. Já estar PAST_DUE torna isto no-op, e CANCELED não
      // regride — quem cancelou não volta a ser apenas inadimplente.
      from: ["ACTIVE"],
      to: "PAST_DUE",
    });

    if (marcou) {
      logger.warn("Assinatura marcada como inadimplente", {
        companyId: company.id,
        resource: "subscription",
      });
    }

    return marcou ? "INADIMPLENTE" : "SEM_MUDANCA";
  }

  /**
   * Cancelamento agendado: corta só quando o período pago termina.
   *
   * A ValidaPay cancela ao fim do período — `status` continua `"ACTIVE"` e o
   * acesso está pago até `cancellation.effectiveAt`. Cortar na solicitação
   * retiraria serviço já pago, então até a data a empresa permanece `ACTIVE` e
   * nada é gravado.
   *
   * A data vem da API, não de cálculo nosso; o relógio só responde "já chegou?".
   */
  private async aplicarCancelamento(
    company: Company,
    assinatura: SubscriptionSnapshot,
  ): Promise<ResultadoDeCicloDeVida> {
    const efetivoEm = assinatura.cancelamentoEfetivoEm;
    const chegou =
      assinatura.cancelamentoImediato ||
      (efetivoEm !== null && this.agora().getTime() >= efetivoEm.getTime());

    if (!chegou) {
      // Sem data e sem imediato seria cancelamento sem quando: registra-se para
      // investigação e NÃO se corta acesso por suposição.
      if (efetivoEm === null) {
        logger.warn("Cancelamento agendado sem data efetiva na fonte", {
          companyId: company.id,
          resource: "subscription",
        });
      }
      return "CANCELAMENTO_AGENDADO";
    }

    const cancelou = await this.companies.transitionSubscriptionStatus({
      companyId: company.id,
      from: ["ACTIVE", "PAST_DUE"],
      to: "CANCELED",
    });

    if (cancelou) {
      logger.info("Assinatura cancelada após a data efetiva", {
        companyId: company.id,
        resource: "subscription",
      });
    }

    return cancelou ? "CANCELADA" : "SEM_MUDANCA";
  }

  /**
   * Volta de `PAST_DUE` para `ACTIVE` quando o ciclo corrente consta pago.
   *
   * `cicloAtualPago` é comparação positiva com `"PAID"` — não "não está
   * falhado". Um status de ciclo que a API introduza e ninguém tenha observado
   * mantém a empresa como está, em vez de devolver acesso por omissão.
   */
  private async aplicarRecuperacao(
    company: Company,
    assinatura: SubscriptionSnapshot,
  ): Promise<ResultadoDeCicloDeVida> {
    if (company.subscriptionStatus !== "PAST_DUE" || !assinatura.cicloAtualPago) {
      return "SEM_MUDANCA";
    }

    const reativou = await this.companies.transitionSubscriptionStatus({
      companyId: company.id,
      from: ["PAST_DUE"],
      to: "ACTIVE",
    });

    if (reativou) {
      logger.info("Assinatura reativada após pagamento confirmado", {
        companyId: company.id,
        resource: "subscription",
      });
    }

    return reativou ? "REATIVADA" : "SEM_MUDANCA";
  }
}
