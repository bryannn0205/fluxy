import type { Company, OrderAttachment, Role } from "@/lib/generated/prisma/client";
import { assertPermission } from "@/lib/permissions";
import { NotFoundError } from "@/lib/errors";
import { deleteFile } from "@/lib/r2";
import type {
  CreateOrderAttachmentData,
  OrderAttachmentRepository,
} from "@/repositories/interfaces/OrderAttachmentRepository";
import type { OrderRepository } from "@/repositories/interfaces/OrderRepository";
import type { AuditService } from "@/services/AuditService";
import type { SubscriptionGateService } from "@/services/SubscriptionGateService";

// Inclui o papel porque o guard de permissão vive dentro do service — o
// objeto passado é sempre o CompanySession de requireCompany(), que já o traz.
type GateCompany = Pick<Company, "subscriptionStatus" | "trialEndsAt"> & {
  role: Role;
};

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
    assertPermission(company.role, "attachments", "create");

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
    assertPermission(company.role, "attachments", "delete");

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
