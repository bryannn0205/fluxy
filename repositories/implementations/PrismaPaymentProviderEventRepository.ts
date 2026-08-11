import type {
  PaymentProviderEvent,
  PrismaClient,
  ProviderEventStatus,
} from "@/lib/generated/prisma/client";
import type {
  PaymentProviderEventRepository,
  RecordEventInput,
  RecordEventResult,
} from "@/repositories/interfaces/PaymentProviderEventRepository";

const PROVIDER = "VALIDAPAY" as const;

export class PrismaPaymentProviderEventRepository implements PaymentProviderEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: RecordEventInput): Promise<RecordEventResult> {
    try {
      const event = await this.prisma.paymentProviderEvent.create({
        data: {
          provider: PROVIDER,
          eventType: input.eventType,
          idempotencyKey: input.payloadHash,
          payloadHash: input.payloadHash,
          companyId: input.companyId,
          externalChargeId: input.externalChargeId,
          externalPaymentId: input.externalPaymentId,
          externalSubscriptionId: input.externalSubscriptionId,
          occurredAt: input.occurredAt,
        },
      });

      return { event, created: true };
    } catch (erro) {
      if (!isUniqueViolation(erro)) throw erro;

      // Entrega repetida do MESMO corpo. A linha existente é a verdade — não
      // se sobrescreve nada: o registro é append-only, e o status atual dela é
      // o que decide se há algo a reprocessar.
      const existente = await this.findByPayloadHash(input.payloadHash);
      if (!existente) throw erro;

      return { event: existente, created: false };
    }
  }

  async markStatus(id: string, status: ProviderEventStatus): Promise<void> {
    await this.prisma.paymentProviderEvent.update({
      where: { id },
      data: {
        status,
        // `processedAt` marca a conclusão, não a tentativa: PENDING volta a
        // ser reprocessável e não deve parecer já resolvido.
        processedAt: status === "PENDING" ? null : new Date(),
      },
    });
  }

  async attachCompany(id: string, companyId: string): Promise<void> {
    await this.prisma.paymentProviderEvent.update({
      where: { id },
      data: { companyId },
    });
  }

  async findByPayloadHash(payloadHash: string): Promise<PaymentProviderEvent | null> {
    return this.prisma.paymentProviderEvent.findUnique({
      where: {
        provider_idempotencyKey: { provider: PROVIDER, idempotencyKey: payloadHash },
      },
    });
  }
}

function isUniqueViolation(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    "code" in erro &&
    (erro as { code: unknown }).code === "P2002"
  );
}
