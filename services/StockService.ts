import type { Company, StockMovement } from "@/lib/generated/prisma/client";
import type {
  StockMovementWithProduct,
  StockRepository,
} from "@/repositories/interfaces/StockRepository";
import type { AdjustStockInput } from "@/schemas/stock.schema";
import type { SubscriptionGateService } from "@/services/SubscriptionGateService";

type GateCompany = Pick<Company, "subscriptionStatus" | "trialEndsAt">;

export class StockService {
  constructor(
    private readonly repository: StockRepository,
    private readonly subscriptionGate: SubscriptionGateService,
  ) {}

  /**
   * Registra uma entrada/saída manual de estoque (reposição ou correção).
   *
   * Não grava em AuditLog: StockMovement já é, em si, um ledger completo
   * (quem, quando, motivo, quantidade, saldo resultante) — duplicar em
   * AuditLog seria um registro estritamente mais pobre do mesmo evento.
   *
   * @throws {NotFoundError} Produto não existe nesta empresa
   * @throws {ValidationError} Resultaria em estoque negativo
   */
  async adjust(
    input: AdjustStockInput,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<StockMovement> {
    this.subscriptionGate.assertCanWrite(company);

    const quantityDelta = input.direction === "IN" ? input.quantity : -input.quantity;

    return this.repository.adjust(
      {
        productId: input.productId,
        reason: input.reason,
        quantityDelta,
        note: input.note || null,
        createdById: userId,
      },
      company.id,
    );
  }

  async listMovements(
    productId: string,
    companyId: string,
  ): Promise<StockMovementWithProduct[]> {
    return this.repository.listMovements(productId, companyId);
  }

  async listRecentMovements(
    companyId: string,
    limit: number,
  ): Promise<StockMovementWithProduct[]> {
    return this.repository.listRecentMovements(companyId, limit);
  }
}
