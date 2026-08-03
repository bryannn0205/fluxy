import type { Company, OrderAttachment } from "@/lib/generated/prisma/client";
import { NotFoundError } from "@/lib/errors";
import { deleteFile } from "@/lib/r2";
import type {
  CreateOrderAttachmentData,
  OrderAttachmentRepository,
} from "@/repositories/interfaces/OrderAttachmentRepository";
import type { OrderRepository } from "@/repositories/interfaces/OrderRepository";
import type { AuditService } from "@/services/AuditService";
import type { SubscriptionGateService } from "@/services/SubscriptionGateService";

type GateCompany = Pick<Company, "subscriptionStatus" | "trialEndsAt">;

export class OrderAttachmentService {
  constructor(
    private readonly repository: OrderAttachmentRepository,
    private readonly orderRepository: OrderRepository,
    private readonly auditService: AuditService,
    private readonly subscriptionGate: SubscriptionGateService,
  ) {}

  /** @throws {NotFoundError} Pedido não existe nesta empresa */
  async create(
    data: CreateOrderAttachmentData,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<OrderAttachment> {
    this.subscriptionGate.assertCanWrite(company);

    const order = await this.orderRepository.findById(data.orderId, company.id);
    if (!order) {
      throw new NotFoundError("Pedido");
    }

    const attachment = await this.repository.create(data, company.id);

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "CREATE",
      resource: "order_attachment",
      resourceId: attachment.id,
      orderId: data.orderId,
    });

    return attachment;
  }

  /** @throws {NotFoundError} Anexo não existe nesta empresa */
  async delete(
    id: string,
    company: GateCompany & { id: string },
    userId: string,
  ): Promise<void> {
    this.subscriptionGate.assertCanWrite(company);

    const attachment = await this.repository.findById(id, company.id);
    if (!attachment) {
      throw new NotFoundError("Anexo");
    }

    await this.repository.softDelete(id, company.id);
    await deleteFile(attachment.fileKey);

    await this.auditService.log({
      companyId: company.id,
      userId,
      action: "DELETE",
      resource: "order_attachment",
      resourceId: id,
      orderId: attachment.orderId,
    });
  }
}
