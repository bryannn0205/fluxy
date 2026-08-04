import type { Plan } from "@/lib/generated/prisma/client";
import { PlanLimitReachedError } from "@/lib/errors";
import { startOfMonthBrazil, startOfNextMonthBrazil } from "@/lib/dates";
import {
  PLAN_RESOURCES,
  UPGRADE_PATH,
  fitsWithinLimit,
  limitFor,
  type PlanResource,
} from "@/lib/plan-limits";
import type { CompanyRepository } from "@/repositories/interfaces/CompanyRepository";
import type { CustomerRepository } from "@/repositories/interfaces/CustomerRepository";
import type { InvitationRepository } from "@/repositories/interfaces/InvitationRepository";
import type { OrderRepository } from "@/repositories/interfaces/OrderRepository";
import type { ProductRepository } from "@/repositories/interfaces/ProductRepository";
import type { UserRepository } from "@/repositories/interfaces/UserRepository";

/**
 * Único ponto que decide "ainda cabe mais um?".
 *
 * **Limite não é permissão.** A ordem de validação, sempre nesta sequência:
 *
 *   1. requireCompany()        — quem é você
 *   2. assertPermission()      — seu PAPEL permite? ................. 403
 *   3. assertCanWrite()        — sua ASSINATURA está ativa? ......... 402 SUBSCRIPTION_REQUIRED
 *   4. assertModuleAccess()    — seu PLANO tem o módulo? ............ 402
 *   5. assertWithinLimit()     — ainda há ESPAÇO? .................. 402 PLAN_LIMIT_REACHED
 *
 * Papel vem primeiro porque é a checagem mais barata (tabela em memória, sem
 * I/O) e porque a saída é outra: quem não tem permissão precisa pedir acesso,
 * não fazer upgrade. Convidar alguém a pagar por algo que o papel dele nunca
 * vai permitir é o pior erro possível nesta tela.
 *
 * Assinatura vem antes de cota pelo mesmo motivo: quem está com a assinatura
 * vencida precisa reativar, e dizer "faça upgrade" ali confunde.
 */
export class PlanLimitService {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly userRepository: UserRepository,
    private readonly invitationRepository: InvitationRepository,
    private readonly productRepository: ProductRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly orderRepository: OrderRepository,
  ) {}

  /**
   * Plano vinculado à empresa, ou `null` durante o trial.
   *
   * `null` é tratado como ilimitado em todos os recursos — ver `limitFor`.
   */
  async getCurrentPlan(companyId: string): Promise<Plan | null> {
    return this.companyRepository.findPlanByCompany(companyId);
  }

  async getPlanLimits(companyId: string): Promise<Record<PlanResource, number | null>> {
    const plan = await this.getCurrentPlan(companyId);

    return {
      users: limitFor(plan, "users"),
      ordersPerMonth: limitFor(plan, "ordersPerMonth"),
      products: limitFor(plan, "products"),
      customers: limitFor(plan, "customers"),
    };
  }

  /**
   * Uso corrente do recurso — sempre recalculado, nunca guardado.
   *
   * Contador materializado seria mais um cache para dessincronizar, e a
   * pergunta só é feita no momento de criar: uma contagem indexada custa
   * microssegundos e nunca mente.
   */
  async getCurrentUsage(
    companyId: string,
    resource: PlanResource,
    now: Date = new Date(),
  ): Promise<number> {
    switch (resource) {
      case "users":
        // Convite válido reserva vaga: quem já foi convidado vai ocupar um
        // lugar, e ignorar isso permitiria convidar dez pessoas para cinco
        // vagas e ver a briga acontecer na hora do aceite.
        return (
          (await this.userRepository.countActive(companyId)) +
          (await this.invitationRepository.countValidPending(companyId, now))
        );

      case "ordersPerMonth":
        return this.orderRepository.countCreatedInPeriodIncludingDeleted(
          companyId,
          startOfMonthBrazil(now),
          startOfNextMonthBrazil(now),
        );

      case "products":
        return this.productRepository.countNotDeleted(companyId);

      case "customers":
        return this.customerRepository.countNotDeleted(companyId);
    }
  }

  /**
   * Barra quando criar mais um estouraria o teto.
   *
   * @throws {PlanLimitReachedError} 402
   */
  async assertWithinLimit(
    companyId: string,
    resource: PlanResource,
    now: Date = new Date(),
  ): Promise<void> {
    const plan = await this.getCurrentPlan(companyId);
    const limit = limitFor(plan, resource);
    if (limit === null) return;

    const currentUsage = await this.getCurrentUsage(companyId, resource, now);
    // +1 porque a pergunta é "cabe mais um?", não "já estourou?".
    this.assertProjected(currentUsage + 1, currentUsage, limit, resource, plan);
  }

  /**
   * Aceite de convite: o convidado SUBSTITUI a própria reserva.
   *
   * Um convite válido já está contado no uso. Se o aceite somasse mais um sem
   * descontar a reserva que está sendo consumida, uma empresa com 4 usuários,
   * 1 convite e limite 5 veria o convidado ser recusado — apesar de a vaga
   * dele existir e estar reservada justamente para isso.
   *
   *   projetado = ativos + convitesVálidos − reservaDesteConvite + 1
   *
   * Para um convite válido, `reservaDesteConvite = 1`, e os dois últimos
   * termos se cancelam: aceitar não muda o uso, só troca reserva por pessoa.
   * Convite expirado nunca chega aqui — é recusado antes, e ele não reservava
   * vaga nenhuma.
   *
   * **Síncrona e sem I/O de propósito.** As contagens chegam prontas, lidas
   * dentro da transação e sob o lock da empresa. Consultar aqui pelo client
   * principal leria um estado que o lock existe para congelar — e travaria,
   * porque o Postgres embutido do ambiente local serializa conexões.
   */
  assertCanAcceptInvite(
    plan: Plan | null,
    contexto: { activeUsers: number; validPendingInvitations: number },
  ): void {
    const limit = limitFor(plan, "users");
    if (limit === null) return;

    const currentUsage = contexto.activeUsers + contexto.validPendingInvitations;
    // O convite sendo aceito está dentro de validPendingInvitations e some
    // ao ser consumido; em troca entra um usuário. Os dois se cancelam.
    const projected = currentUsage - 1 + 1;

    this.assertProjected(projected, currentUsage, limit, "users", plan);
  }

  /**
   * Convite: só exige vaga nova quando a linha ainda não reserva uma.
   *
   * Renovar convite pendente e válido não pode cobrar uma segunda vaga — ele
   * já está no uso. Renovar um expirado, sim: ele havia saído da conta.
   */
  async assertCanInvite(
    companyId: string,
    invitationAlreadyReservesSlot: boolean,
    now: Date = new Date(),
  ): Promise<void> {
    if (invitationAlreadyReservesSlot) return;

    const plan = await this.getCurrentPlan(companyId);
    const limit = limitFor(plan, "users");
    if (limit === null) return;

    const currentUsage = await this.getCurrentUsage(companyId, "users", now);
    this.assertProjected(currentUsage + 1, currentUsage, limit, "users", plan);
  }

  private assertProjected(
    projectedUsage: number,
    currentUsage: number,
    limit: number,
    resource: PlanResource,
    plan: Plan | null,
  ): void {
    if (fitsWithinLimit(projectedUsage, limit)) return;

    throw new PlanLimitReachedError(
      resource,
      PLAN_RESOURCES[resource].label,
      currentUsage,
      limit,
      plan?.slug ?? "trial",
      UPGRADE_PATH,
    );
  }
}
