import type {
  BillingInterval,
  SubscriptionCheckout,
} from "@/lib/generated/prisma/client";

export interface FindOrCreatePendingInput {
  companyId: string;
  intendedPlanId: string;
  billingInterval: BillingInterval;
  /**
   * Idade máxima de uma tentativa `PENDING` para ser reaproveitada.
   *
   * **Decisão de negócio, não da API.** Passada a janela, um QR de Pix
   * provavelmente já expirou e insistir nele deixaria o cliente olhando um
   * código morto.
   */
  reuseWindowMs: number;
}

export interface FindOrCreatePendingResult {
  checkout: SubscriptionCheckout;
  /** `false` quando a linha nasceu agora. Só para log — o caminho é o mesmo. */
  reused: boolean;
}

export interface ListPendingWithChargeInput {
  /**
   * Escopo de tenant — **obrigatório**, como em toda query deste projeto.
   *
   * Não é opcional de propósito: ausência de escopo significaria "todos os
   * tenants" por omissão, e uma chamada que esquecesse o campo varreria o
   * banco inteiro sem que nada acusasse. Uma varredura de plataforma, se um
   * dia existir, precisa de método próprio com nome que diga isso.
   */
  companyId: string;
  /** Teto de itens por execução. Cada item custa uma chamada externa. */
  limit: number;
}

export interface ActivateIfPendingInput {
  subscriptionCheckoutId: string;
  companyId: string;
  intendedPlanId: string;
  /** Da ValidaPay, quando já conhecido. `null` não apaga o que estiver gravado. */
  validapaySubscriptionId: string | null;
}

export interface SubscriptionCheckoutRepository {
  /**
   * Uma tentativa por empresa/plano/periodicidade dentro da janela — sob lock.
   *
   * `findFirst` seguido de `create` fora de transação sofre corrida: dois
   * cliques simultâneos leem "não existe" ao mesmo tempo e ambos inserem. O
   * lock da empresa vem ANTES da leitura, então a segunda requisição espera a
   * primeira commitar e já enxerga a linha criada.
   */
  findOrCreatePending(
    input: FindOrCreatePendingInput,
  ): Promise<FindOrCreatePendingResult>;

  /**
   * Sem escopo de tenant, de propósito: webhook e reconciliação não têm sessão.
   * Quem serve tela usa `findByIdForCompany`.
   */
  findById(id: string): Promise<SubscriptionCheckout | null>;

  findByIdForCompany(id: string, companyId: string): Promise<SubscriptionCheckout | null>;

  /**
   * Correlação primária de um webhook: o `chargeId` do payload é o mesmo que
   * gravamos ao criar a cobrança. Escopado ao provedor, como o índice único.
   */
  findByChargeId(externalChargeId: string): Promise<SubscriptionCheckout | null>;

  /**
   * Grava o `chargeId` **somente se ainda não houver um**.
   *
   * N chamadas concorrentes de criação usam o mesmo `externalId` e convergem
   * para o mesmo `chargeId` (200 numa, 409 nas demais). A escrita condicional
   * torna a ordem de chegada irrelevante e dispensa segurar lock de banco
   * durante a chamada HTTP.
   *
   * Devolve a linha como ficou — o `externalChargeId` pode ser o de outra
   * execução que chegou primeiro.
   */
  attachChargeId(id: string, chargeId: string): Promise<SubscriptionCheckout>;

  markFailed(id: string): Promise<void>;

  /**
   * Tentativas que já têm cobrança mas seguem sem desfecho.
   *
   * `externalChargeId IS NOT NULL` não é filtro de conveniência: sem ele não há
   * o que consultar na ValidaPay, e a linha entraria no lote só para ser
   * descartada. Ordem por `createdAt ASC` — a mais antiga é a que espera há
   * mais tempo.
   */
  listPendingWithCharge(
    input: ListPendingWithChargeInput,
  ): Promise<SubscriptionCheckout[]>;

  /**
   * Claim atômico da ativação, numa única transação.
   *
   * `PENDING -> COMPLETED` é condicional: só quem afetar exatamente uma linha
   * atualiza a empresa. Webhook, polling e reconciliação podem chegar juntos —
   * o segundo bloqueia no `UPDATE`, reavalia o `WHERE` contra o valor já
   * commitado e vira no-op.
   *
   * @returns `true` se esta execução foi a que ativou.
   */
  activateIfPending(input: ActivateIfPendingInput): Promise<boolean>;
}
