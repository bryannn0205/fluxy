import { logger } from "@/lib/logger";
import type { SubscriptionCheckoutRepository } from "@/repositories/interfaces/SubscriptionCheckoutRepository";
import type { SubscriptionCheckoutService } from "@/services/SubscriptionCheckoutService";

/**
 * Teto de tentativas examinadas por execução.
 *
 * Cada item custa uma chamada externa de até 10 s. Cinquenta com concorrência
 * de cinco são ~10 rodadas — cabe folgado num tempo de resposta aceitável,
 * enquanto um lote sem teto travaria a requisição inteira no dia em que
 * houvesse acúmulo. O que sobrar entra na execução seguinte, pela ordem.
 */
const LOTE_MAXIMO = 50;

/**
 * Confirmações simultâneas.
 *
 * Cinco porque o gargalo é a ValidaPay, não o Postgres — e disparar cinquenta
 * chamadas de uma vez contra um gateway de pagamento é a forma mais rápida de
 * ser limitado por ele. Serial seria seguro e lento demais.
 */
const CONCORRENCIA = 5;

export interface ReconcileInput {
  /**
   * Escopo de tenant — **obrigatório**. Vem do `companyId` da sessão, jamais
   * de entrada do usuário.
   *
   * TODO(cron): uma varredura de plataforma, quando houver Vercel Pro e
   * agendamento real, entra como método PRÓPRIO e server-only
   * (`reconcileAllPendingForPlatform`). Ausência de `companyId` não pode
   * significar "todos os tenants" por omissão — seria a diferença entre
   * esquecer um campo e varrer o banco inteiro.
   */
  companyId: string;
}

export interface ReconcileSummary {
  /** Tentativas que entraram no lote. */
  examined: number;
  /** Ativadas por esta execução. */
  completed: number;
  /** Consultadas e ainda não pagas — resultado normal, não erro. */
  stillPending: number;
  /** Falharam na consulta. Contagem apenas: o motivo vai para o log. */
  failed: number;
}

/**
 * Recuperação de tentativas que ficaram sem desfecho.
 *
 * Existe porque nem o webhook nem o polling da tela garantem a ativação: o
 * primeiro depende de entrega que a ValidaPay não documenta como
 * retentável, e o segundo morre quando o usuário fecha a aba.
 *
 * **Não decide nada sobre pagamento.** Seleciona candidatos e delega a
 * `confirmarSeChargePago`, a mesma função usada pelo webhook e pelo polling —
 * que consulta `GET /v1/charges/:id` e só ativa com `PAID`. Reimplementar a
 * confirmação aqui criaria uma segunda definição de "pago".
 */
export class SubscriptionReconciliationService {
  constructor(
    private readonly repository: SubscriptionCheckoutRepository,
    private readonly checkoutService: SubscriptionCheckoutService,
  ) {}

  async reconcilePending({ companyId }: ReconcileInput): Promise<ReconcileSummary> {
    const pendentes = await this.repository.listPendingWithCharge({
      companyId,
      limit: LOTE_MAXIMO,
    });

    const resumo: ReconcileSummary = {
      examined: pendentes.length,
      completed: 0,
      stillPending: 0,
      failed: 0,
    };

    // Fila compartilhada entre N trabalhadores: o próximo item vai para quem
    // terminar primeiro. Fatiar em blocos fixos deixaria trabalhadores ociosos
    // esperando o item mais lento do próprio bloco.
    let proximo = 0;
    const trabalhar = async (): Promise<void> => {
      while (proximo < pendentes.length) {
        const item = pendentes[proximo++]!;

        try {
          const ativou = await this.checkoutService.confirmarSeChargePago(item.id);
          if (ativou) resumo.completed++;
          else resumo.stillPending++;
        } catch (erro) {
          // Falha de um item NÃO aborta o lote: a próxima tentativa da fila
          // pode estar paga, e derrubar tudo por causa de uma consulta que
          // expirou deixaria pagamentos confirmados sem ativação.
          resumo.failed++;
          logger.warn("Falha ao reconciliar tentativa de contratação", {
            companyId: item.companyId,
            resource: "subscription_checkout",
            resourceId: item.id,
            erro: erro instanceof Error ? erro.name : "desconhecido",
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCORRENCIA, pendentes.length) }, trabalhar),
    );

    if (resumo.examined > 0) {
      logger.info("Reconciliação de contratações concluída", {
        companyId,
        resource: "subscription_checkout",
        ...resumo,
      });
    }

    return resumo;
  }
}
