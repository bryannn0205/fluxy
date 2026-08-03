import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, SubscriptionRequiredError } from "@/lib/errors";
import { OrderAttachmentService } from "@/services/OrderAttachmentService";
import type { AuditService } from "@/services/AuditService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";
import type { OrderAttachmentRepository } from "@/repositories/interfaces/OrderAttachmentRepository";
import type { OrderRepository } from "@/repositories/interfaces/OrderRepository";
import type { Company, OrderAttachment } from "@/lib/generated/prisma/client";
import type { OrderWithRelations } from "@/types/orders";

vi.mock("@/lib/r2", () => ({
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

const activeCompany: Company = {
  id: "company-1",
  name: "Empresa Teste",
  email: "empresa@teste.com",
  cnpj: null,
  phone: null,
  planId: null,
  subscriptionStatus: "ACTIVE",
  trialEndsAt: new Date(),
  asaasCustomerId: null,
  asaasSubscriptionId: null,
  nextOrderNumber: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

function buildAttachment(overrides: Partial<OrderAttachment> = {}): OrderAttachment {
  return {
    id: "attachment-1",
    companyId: "company-1",
    orderId: "order-1",
    uploadedById: "user-1",
    category: "OUTRO",
    fileName: "nota.pdf",
    fileKey: "company-1/orders/order-1/nota.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

const createInput = {
  orderId: "order-1",
  uploadedById: "user-1",
  category: "OUTRO" as const,
  fileName: "nota.pdf",
  fileKey: "company-1/orders/order-1/nota.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
};

describe("OrderAttachmentService", () => {
  let repository: OrderAttachmentRepository;
  let orderRepository: OrderRepository;
  let auditService: AuditService;
  let service: OrderAttachmentService;

  beforeEach(() => {
    vi.clearAllMocks();

    repository = {
      create: vi.fn(),
      findById: vi.fn(),
      softDelete: vi.fn(),
    };

    orderRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue({ id: "order-1" } as OrderWithRelations),
      findByNumber: vi.fn(),
      list: vi.fn(),
      streamForExport: vi.fn(),
      listForKanban: vi.fn(),
      updateStatus: vi.fn(),
      updateDetails: vi.fn(),
      softDelete: vi.fn(),
      getStats: vi.fn(),
    };

    auditService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    service = new OrderAttachmentService(
      repository,
      orderRepository,
      auditService,
      new SubscriptionGateService(),
    );
  });

  describe("create", () => {
    it("rejeita quando a assinatura da empresa expirou", async () => {
      const expiredCompany: Company = { ...activeCompany, subscriptionStatus: "EXPIRED" };

      await expect(service.create(createInput, expiredCompany, "user-1")).rejects.toThrow(
        SubscriptionRequiredError,
      );

      expect(repository.create).not.toHaveBeenCalled();
    });

    it("rejeita quando o pedido não existe nesta empresa", async () => {
      vi.mocked(orderRepository.findById).mockResolvedValueOnce(null);

      await expect(service.create(createInput, activeCompany, "user-1")).rejects.toThrow(
        NotFoundError,
      );

      expect(repository.create).not.toHaveBeenCalled();
    });

    it("cria o anexo e registra auditoria", async () => {
      vi.mocked(repository.create).mockResolvedValueOnce(buildAttachment());

      const result = await service.create(createInput, activeCompany, "user-1");

      expect(repository.create).toHaveBeenCalledWith(createInput, "company-1");
      expect(result.id).toBe("attachment-1");
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CREATE",
          resource: "order_attachment",
          resourceId: "attachment-1",
          orderId: "order-1",
        }),
      );
    });
  });

  describe("delete", () => {
    it("rejeita quando a assinatura da empresa expirou", async () => {
      const expiredCompany: Company = { ...activeCompany, subscriptionStatus: "EXPIRED" };

      await expect(
        service.delete("attachment-1", expiredCompany, "user-1"),
      ).rejects.toThrow(SubscriptionRequiredError);

      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it("rejeita quando o anexo não existe nesta empresa", async () => {
      vi.mocked(repository.findById).mockResolvedValueOnce(null);

      await expect(
        service.delete("attachment-1", activeCompany, "user-1"),
      ).rejects.toThrow(NotFoundError);

      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it("exclui o anexo (soft delete), limpa o arquivo no R2 e registra auditoria", async () => {
      const { deleteFile } = await import("@/lib/r2");
      vi.mocked(repository.findById).mockResolvedValueOnce(buildAttachment());

      await service.delete("attachment-1", activeCompany, "user-1");

      expect(repository.softDelete).toHaveBeenCalledWith("attachment-1", "company-1");
      expect(deleteFile).toHaveBeenCalledWith("company-1/orders/order-1/nota.pdf");
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DELETE",
          resource: "order_attachment",
          resourceId: "attachment-1",
          orderId: "order-1",
        }),
      );
    });
  });
});
