import type { Company, Plan, SubscriptionStatus } from "@/lib/generated/prisma/client";
import type { RegisterInput } from "@/schemas/auth.schema";

export interface CreateCompanyWithOwnerData {
  register: RegisterInput;
  passwordHash: string;
  trialEndsAt: Date;
  planId: string | null;
}

export interface TransitionSubscriptionStatusInput {
  companyId: string;
  /**
   * Estados de partida aceitos. A transição só acontece a partir de um deles.
   *
   * **É isto que dá idempotência e ordem.** Uma entrega repetida do mesmo evento
   * encontra a empresa já no estado de destino, não em nenhum dos de partida, e
   * vira no-op — sem precisar guardar "já processei". Também impede regressão:
   * `CANCELED → ACTIVE` só é possível se alguém listar `CANCELED` como partida,
   * o que nenhum chamador faz.
   */
  from: readonly SubscriptionStatus[];
  to: SubscriptionStatus;
}

export interface ListForLifecycleReviewInput {
  companyId: string;
  /** Teto por execução: cada item custa uma chamada externa. */
  limit: number;
}

export interface CompanyRepository {
  findById(id: string): Promise<Company | null>;
  findByEmail(email: string): Promise<Company | null>;
  /** Cria a empresa e o usuário OWNER em uma única transação atômica. */
  createWithOwner(data: CreateCompanyWithOwnerData): Promise<Company>;
  update(id: string, data: Partial<Pick<Company, "name" | "phone">>): Promise<Company>;
  /** Incrementa e retorna o próximo número de pedido, de forma atômica. */
  incrementOrderNumber(id: string): Promise<number>;
  /**
   * Plano vinculado à empresa, ou `null` quando não há — o caso do trial.
   * Sem plano significa sem teto: travar quem está avaliando o produto seria
   * o oposto do que o trial existe para fazer.
   */
  findPlanByCompany(companyId: string): Promise<Plan | null>;

  /**
   * Empresa dona de uma assinatura da ValidaPay.
   *
   * Sem escopo de tenant, de propósito: webhook e reconciliação não têm sessão,
   * e é justamente esta consulta que DESCOBRE de quem é o evento. O identificador
   * não vem do payload por confiança — vem dele por ser a chave, e o resultado é
   * a empresa que o servidor gravou ao ativar a assinatura. Um `subscriptionId`
   * desconhecido devolve `null`, e nada acontece.
   */
  findByValidapaySubscriptionId(subscriptionId: string): Promise<Company | null>;

  /**
   * Muda `subscriptionStatus` **somente** se o estado atual for um dos de
   * partida. Nada mais é tocado: `planId`, `trialEndsAt` e histórico ficam como
   * estão.
   *
   * @returns `true` se esta execução foi a que mudou
   */
  transitionSubscriptionStatus(
    input: TransitionSubscriptionStatusInput,
  ): Promise<boolean>;

  /**
   * Empresas cuja assinatura externa vale revisar: têm identificador na
   * ValidaPay e estão num estado que pode ter divergido.
   */
  listForLifecycleReview(input: ListForLifecycleReviewInput): Promise<Company[]>;

  /**
   * Mesma seleção, **sem escopo de tenant** — para a execução agendada.
   *
   * Método PRÓPRIO, com o nome dizendo que atravessa tenants, e não um
   * `companyId` opcional no método acima. A diferença é o ponto: com parâmetro
   * opcional, esquecer o campo varreria o banco inteiro em silêncio, e a chamada
   * ficaria indistinguível de uma consulta escopada. Aqui, varrer a plataforma
   * exige escrever `AcrossTenants` — ninguém faz isso por acidente.
   *
   * Só o cron chama. Nenhuma action, nenhuma página.
   */
  listForLifecycleReviewAcrossTenants(limit: number): Promise<Company[]>;
}
