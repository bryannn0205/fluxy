import type { PrismaClient, SubscriptionCheckout } from "@/lib/generated/prisma/client";
import type {
  ActivateIfPendingInput,
  FindOrCreatePendingInput,
  FindOrCreatePendingResult,
  ListPendingWithChargeInput,
  SubscriptionCheckoutRepository,
} from "@/repositories/interfaces/SubscriptionCheckoutRepository";

const PROVIDER = "VALIDAPAY" as const;

export class PrismaSubscriptionCheckoutRepository implements SubscriptionCheckoutRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrCreatePending(
    input: FindOrCreatePendingInput,
  ): Promise<FindOrCreatePendingResult> {
    return this.prisma.$transaction(async (tx) => {
      // Lock ANTES da leitura. Depois dela, a corrida já teria acontecido.
      // Mesma técnica do aceite de convite, e pelo mesmo motivo: serializar
      // decisões que dependem do que a empresa já tem.
      await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${input.companyId} FOR UPDATE`;

      const existente = await tx.subscriptionCheckout.findFirst({
        where: {
          companyId: input.companyId,
          intendedPlanId: input.intendedPlanId,
          billingInterval: input.billingInterval,
          provider: PROVIDER,
          status: "PENDING",
          createdAt: { gt: new Date(Date.now() - input.reuseWindowMs) },
        },
        orderBy: { createdAt: "desc" },
      });

      if (existente) return { checkout: existente, reused: true };

      const criado = await tx.subscriptionCheckout.create({
        data: {
          companyId: input.companyId,
          intendedPlanId: input.intendedPlanId,
          billingInterval: input.billingInterval,
          provider: PROVIDER,
        },
      });

      return { checkout: criado, reused: false };
    });
  }

  async findById(id: string): Promise<SubscriptionCheckout | null> {
    return this.prisma.subscriptionCheckout.findUnique({ where: { id } });
  }

  async findByIdForCompany(
    id: string,
    companyId: string,
  ): Promise<SubscriptionCheckout | null> {
    return this.prisma.subscriptionCheckout.findFirst({ where: { id, companyId } });
  }

  async listPendingWithCharge(
    input: ListPendingWithChargeInput,
  ): Promise<SubscriptionCheckout[]> {
    return this.prisma.subscriptionCheckout.findMany({
      where: {
        provider: PROVIDER,
        companyId: input.companyId,
        status: "PENDING",
        externalChargeId: { not: null },
      },
      orderBy: { createdAt: "asc" },
      take: input.limit,
    });
  }

  async findByChargeId(externalChargeId: string): Promise<SubscriptionCheckout | null> {
    return this.prisma.subscriptionCheckout.findUnique({
      where: { provider_externalChargeId: { provider: PROVIDER, externalChargeId } },
    });
  }

  async attachChargeId(id: string, chargeId: string): Promise<SubscriptionCheckout> {
    await this.prisma.subscriptionCheckout.updateMany({
      where: { id, externalChargeId: null },
      data: { externalChargeId: chargeId },
    });

    return this.prisma.subscriptionCheckout.findUniqueOrThrow({ where: { id } });
  }

  async markFailed(id: string): Promise<void> {
    await this.prisma.subscriptionCheckout.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "FAILED" },
    });
  }

  async activateIfPending(input: ActivateIfPendingInput): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.subscriptionCheckout.updateMany({
        where: { id: input.subscriptionCheckoutId, status: "PENDING" },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      if (count !== 1) return false;

      await tx.company.update({
        where: { id: input.companyId },
        data: {
          planId: input.intendedPlanId,
          subscriptionStatus: "ACTIVE",
          // Ausente quando null: sobrescrever com null apagaria um
          // identificador já conhecido por um evento que não o trouxe.
          ...(input.validapaySubscriptionId !== null
            ? { validapaySubscriptionId: input.validapaySubscriptionId }
            : {}),
        },
      });

      return true;
    });
  }
}
