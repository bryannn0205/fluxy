import type { Company, PrismaClient } from "@/lib/generated/prisma/client";
import type {
  CompanyRepository,
  CreateCompanyWithOwnerData,
  ListForLifecycleReviewInput,
  TransitionSubscriptionStatusInput,
} from "@/repositories/interfaces/CompanyRepository";

export class PrismaCompanyRepository implements CompanyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Company | null> {
    return this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findByEmail(email: string): Promise<Company | null> {
    return this.prisma.company.findFirst({
      where: { email, deletedAt: null },
    });
  }

  async createWithOwner({
    register,
    passwordHash,
    trialEndsAt,
    planId,
  }: CreateCompanyWithOwnerData): Promise<Company> {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: register.companyName,
          email: register.email,
          trialEndsAt,
          planId,
        },
      });

      await tx.user.create({
        data: {
          companyId: company.id,
          name: register.name,
          email: register.email,
          passwordHash,
          role: "OWNER",
        },
      });

      return company;
    });
  }

  async update(
    id: string,
    data: Partial<Pick<Company, "name" | "phone">>,
  ): Promise<Company> {
    return this.prisma.company.update({ where: { id }, data });
  }

  async findByValidapaySubscriptionId(subscriptionId: string): Promise<Company | null> {
    // `findFirst` e não `findUnique`: a coluna não tem índice único hoje. Duas
    // empresas com o mesmo `subscriptionId` seria dado corrompido, não um caso
    // a tratar — e pegar a primeira é melhor que lançar, porque lançar deixaria
    // o evento sem desfecho. Ver a recomendação de `@@unique` no relatório.
    return this.prisma.company.findFirst({
      where: { validapaySubscriptionId: subscriptionId, deletedAt: null },
    });
  }

  async transitionSubscriptionStatus(
    input: TransitionSubscriptionStatusInput,
  ): Promise<boolean> {
    // `updateMany` com o estado de partida no WHERE: é a mesma técnica do claim
    // de ativação. Duas entregas simultâneas do mesmo evento disputam a linha, a
    // segunda reavalia o WHERE contra o valor já commitado e afeta zero linhas.
    const { count } = await this.prisma.company.updateMany({
      where: {
        id: input.companyId,
        deletedAt: null,
        subscriptionStatus: { in: [...input.from] },
      },
      // Só o status. `planId` e `trialEndsAt` não aparecem aqui de propósito:
      // cancelar não rebaixa plano nem recria teste.
      data: { subscriptionStatus: input.to },
    });

    return count === 1;
  }

  async listForLifecycleReview(input: ListForLifecycleReviewInput): Promise<Company[]> {
    return this.prisma.company.findMany({
      where: {
        id: input.companyId,
        deletedAt: null,
        validapaySubscriptionId: { not: null },
        // TRIALING fica fora: não há assinatura paga para divergir. CANCELED e
        // EXPIRED também: são terminais, e revisitá-los gastaria chamada externa
        // para reconfirmar o que já está decidido.
        subscriptionStatus: { in: ["ACTIVE", "PAST_DUE"] },
      },
      orderBy: { updatedAt: "asc" },
      take: input.limit,
    });
  }

  async listForLifecycleReviewAcrossTenants(limit: number): Promise<Company[]> {
    return this.prisma.company.findMany({
      where: {
        deletedAt: null,
        validapaySubscriptionId: { not: null },
        subscriptionStatus: { in: ["ACTIVE", "PAST_DUE"] },
      },
      // Mais antigas primeiro: quem foi revisado há mais tempo entra antes, e um
      // lote cheio não revisita sempre as mesmas empresas.
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
  }

  async findPlanByCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true },
    });

    return company?.plan ?? null;
  }

  async incrementOrderNumber(id: string): Promise<number> {
    const company = await this.prisma.company.update({
      where: { id },
      data: { nextOrderNumber: { increment: 1 } },
      select: { nextOrderNumber: true },
    });

    // O número usado no pedido é o valor anterior ao incremento.
    return company.nextOrderNumber - 1;
  }
}
