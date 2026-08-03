import type { OrderAttachment, PrismaClient } from "@/lib/generated/prisma/client";
import type {
  CreateOrderAttachmentData,
  OrderAttachmentRepository,
} from "@/repositories/interfaces/OrderAttachmentRepository";

export class PrismaOrderAttachmentRepository implements OrderAttachmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    data: CreateOrderAttachmentData,
    companyId: string,
  ): Promise<OrderAttachment> {
    return this.prisma.orderAttachment.create({
      data: { companyId, ...data },
    });
  }

  async findById(id: string, companyId: string): Promise<OrderAttachment | null> {
    return this.prisma.orderAttachment.findFirst({
      where: { id, companyId, deletedAt: null },
    });
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    await this.prisma.orderAttachment.updateMany({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    });
  }
}
