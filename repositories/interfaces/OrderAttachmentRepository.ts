import type { AttachmentCategory, OrderAttachment } from "@/lib/generated/prisma/client";

export interface CreateOrderAttachmentData {
  orderId: string;
  uploadedById: string;
  category: AttachmentCategory;
  fileName: string;
  fileKey: string;
  mimeType: string;
  sizeBytes: number;
}

export interface OrderAttachmentRepository {
  create(data: CreateOrderAttachmentData, companyId: string): Promise<OrderAttachment>;
  findById(id: string, companyId: string): Promise<OrderAttachment | null>;
  softDelete(id: string, companyId: string): Promise<void>;
}
