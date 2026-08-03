import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  InvalidStatusTransitionError,
  SubscriptionRequiredError,
  ValidationError,
} from "@/lib/errors";
import { OrderService } from "@/services/OrderService";
import type { AuditService } from "@/services/AuditService";
import type { NotificationService } from "@/services/NotificationService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";
import type { OrderRepository } from "@/repositories/interfaces/OrderRepository";
import type { CustomerRepository } from "@/repositories/interfaces/CustomerRepository";
import type { ProductRepository } from "@/repositories/interfaces/ProductRepository";
import type { Customer, Product, Company } from "@/lib/generated/prisma/client";
import type { OrderWithRelations } from "@/types/orders";

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

function buildCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "customer-1",
    companyId: "company-1",
    name: "Cliente Teste",
    email: null,
    phone: null,
    document: null,
    address: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    companyId: "company-1",
    sku: "SKU-1",
    name: "Produto Teste",
    description: null,
    price: { toString: () => "100" } as Product["price"],
    costPrice: null,
    unit: "UN",
    active: true,
    stockQuantity: 100,
    lowStockThreshold: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

// O repositório devolve OrderWithRelations, que sempre traz cliente e itens
// (ver ORDER_INCLUDE). Um mock que devolvia `{}` passava no compilador pelo
// cast mas mentia sobre a forma — e quebrava assim que o Service passou a ler
// o nome do cliente para a notificação.
function buildCreatedOrder(
  overrides: Partial<OrderWithRelations> = {},
): OrderWithRelations {
  return {
    id: "order-1",
    orderNumber: "0001",
    customer: buildCustomer(),
    ...overrides,
  } as OrderWithRelations;
}

describe("OrderService", () => {
  let orderRepository: OrderRepository;
  let customerRepository: CustomerRepository;
  let productRepository: ProductRepository;
  let auditService: AuditService;
  let notificationService: NotificationService;
  let service: OrderService;

  beforeEach(() => {
    orderRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findByNumber: vi.fn(),
      list: vi.fn(),
      streamForExport: vi.fn(),
      listForKanban: vi.fn(),
      updateStatus: vi.fn(),
      updateDetails: vi.fn(),
      softDelete: vi.fn(),
      getStats: vi.fn(),
    };

    customerRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(buildCustomer()),
      list: vi.fn(),
      listActive: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      getStats: vi.fn(),
    };

    productRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySku: vi.fn(),
      findManyByIds: vi.fn().mockResolvedValue([buildProduct()]),
      list: vi.fn(),
      listActive: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };

    auditService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    notificationService = {
      notifyOrderCreated: vi.fn().mockResolvedValue(undefined),
      notifyOrderStatusChanged: vi.fn().mockResolvedValue(undefined),
      notifyOrderDeleted: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationService;

    service = new OrderService(
      orderRepository,
      customerRepository,
      productRepository,
      auditService,
      new SubscriptionGateService(),
      notificationService,
    );
  });

  describe("create", () => {
    const validInput = {
      customerId: "customer-1",
      items: [{ productId: "product-1", quantity: 2 }],
      discount: 0,
      notes: "",
    };

    it("rejeita quando a assinatura da empresa expirou", async () => {
      const expiredCompany: Company = {
        ...activeCompany,
        subscriptionStatus: "EXPIRED",
      };

      await expect(service.create(validInput, expiredCompany, "user-1")).rejects.toThrow(
        SubscriptionRequiredError,
      );

      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    it("rejeita quando o cliente não existe nesta empresa", async () => {
      vi.mocked(customerRepository.findById).mockResolvedValueOnce(null);

      await expect(service.create(validInput, activeCompany, "user-1")).rejects.toThrow(
        "not found",
      );
    });

    it("rejeita quando o produto está inativo", async () => {
      vi.mocked(productRepository.findManyByIds).mockResolvedValueOnce([
        buildProduct({ active: false }),
      ]);

      await expect(service.create(validInput, activeCompany, "user-1")).rejects.toThrow(
        ValidationError,
      );
    });

    it("calcula o total a partir do preço atual do produto, ignorando qualquer preço do cliente", async () => {
      vi.mocked(orderRepository.create).mockResolvedValueOnce(buildCreatedOrder());

      await service.create(validInput, activeCompany, "user-1");

      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: 200, // preço 100 x quantidade 2
          discount: 0,
          total: 200,
        }),
        "company-1",
      );
    });

    it("rejeita quando o desconto é maior que o subtotal", async () => {
      await expect(
        service.create({ ...validInput, discount: 999 }, activeCompany, "user-1"),
      ).rejects.toThrow(ValidationError);
    });

    it("registra auditoria ao criar o pedido", async () => {
      vi.mocked(orderRepository.create).mockResolvedValueOnce(buildCreatedOrder());

      await service.create(validInput, activeCompany, "user-1");

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CREATE",
          resource: "order",
          resourceId: "order-1",
        }),
      );
    });
  });

  describe("updateStatus", () => {
    function buildOrder(
      status: "PENDING" | "PROCESSING" | "READY" | "COMPLETED" | "CANCELLED",
    ) {
      return { id: "order-1", status } as OrderWithRelations;
    }

    it("permite transição válida (PENDING -> PROCESSING)", async () => {
      vi.mocked(orderRepository.findById).mockResolvedValueOnce(buildOrder("PENDING"));

      await service.updateStatus("order-1", "PROCESSING", activeCompany, "user-1");

      expect(orderRepository.updateStatus).toHaveBeenCalledWith(
        "order-1",
        "company-1",
        "PROCESSING",
        "user-1",
      );
    });

    it("permite transição válida (PROCESSING -> READY)", async () => {
      vi.mocked(orderRepository.findById).mockResolvedValueOnce(buildOrder("PROCESSING"));

      await service.updateStatus("order-1", "READY", activeCompany, "user-1");

      expect(orderRepository.updateStatus).toHaveBeenCalledWith(
        "order-1",
        "company-1",
        "READY",
        "user-1",
      );
    });

    it("permite transição válida (READY -> COMPLETED)", async () => {
      vi.mocked(orderRepository.findById).mockResolvedValueOnce(buildOrder("READY"));

      await service.updateStatus("order-1", "COMPLETED", activeCompany, "user-1");

      expect(orderRepository.updateStatus).toHaveBeenCalledWith(
        "order-1",
        "company-1",
        "COMPLETED",
        "user-1",
      );
    });

    it("rejeita transição que pula etapa (PENDING -> READY)", async () => {
      vi.mocked(orderRepository.findById).mockResolvedValueOnce(buildOrder("PENDING"));

      await expect(
        service.updateStatus("order-1", "READY", activeCompany, "user-1"),
      ).rejects.toThrow(InvalidStatusTransitionError);

      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    });

    it("rejeita transição inválida (COMPLETED -> PENDING)", async () => {
      vi.mocked(orderRepository.findById).mockResolvedValueOnce(buildOrder("COMPLETED"));

      await expect(
        service.updateStatus("order-1", "PENDING", activeCompany, "user-1"),
      ).rejects.toThrow(InvalidStatusTransitionError);

      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe("updateDetails", () => {
    const validInput = {
      orderId: "order-1",
      priority: "HIGH" as const,
      expectedDeliveryDate: "2026-08-20",
      paymentMethod: "PIX" as const,
    };

    function buildOrder() {
      return {
        id: "order-1",
        priority: "NORMAL",
        expectedDeliveryDate: null,
        paymentMethod: null,
      } as OrderWithRelations;
    }

    it("rejeita quando a assinatura da empresa expirou", async () => {
      const expiredCompany: Company = { ...activeCompany, subscriptionStatus: "EXPIRED" };

      await expect(
        service.updateDetails(validInput, expiredCompany, "user-1"),
      ).rejects.toThrow(SubscriptionRequiredError);

      expect(orderRepository.updateDetails).not.toHaveBeenCalled();
    });

    it("rejeita quando o pedido não existe nesta empresa", async () => {
      vi.mocked(orderRepository.findById).mockResolvedValueOnce(null);

      await expect(
        service.updateDetails(validInput, activeCompany, "user-1"),
      ).rejects.toThrow("not found");
    });

    it("converte a data (YYYY-MM-DD) para Date e string vazia para null", async () => {
      vi.mocked(orderRepository.findById).mockResolvedValueOnce(buildOrder());

      await service.updateDetails(validInput, activeCompany, "user-1");

      expect(orderRepository.updateDetails).toHaveBeenCalledWith("order-1", "company-1", {
        priority: "HIGH",
        expectedDeliveryDate: new Date("2026-08-20"),
        paymentMethod: "PIX",
      });
    });

    it("trata previsão de entrega e forma de pagamento vazias como null", async () => {
      vi.mocked(orderRepository.findById).mockResolvedValueOnce(buildOrder());

      await service.updateDetails(
        {
          orderId: "order-1",
          priority: "LOW",
          expectedDeliveryDate: "",
          paymentMethod: "",
        },
        activeCompany,
        "user-1",
      );

      expect(orderRepository.updateDetails).toHaveBeenCalledWith("order-1", "company-1", {
        priority: "LOW",
        expectedDeliveryDate: null,
        paymentMethod: null,
      });
    });

    it("registra auditoria com o estado anterior e novo", async () => {
      vi.mocked(orderRepository.findById).mockResolvedValueOnce(buildOrder());

      await service.updateDetails(validInput, activeCompany, "user-1");

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "UPDATE",
          resource: "order",
          resourceId: "order-1",
          changes: expect.objectContaining({
            priority: { before: "NORMAL", after: "HIGH" },
          }),
        }),
      );
    });
  });

  describe("listForKanban", () => {
    it("delega ao repositório escopado por empresa", async () => {
      vi.mocked(orderRepository.listForKanban).mockResolvedValueOnce([]);

      await service.listForKanban("company-1");

      expect(orderRepository.listForKanban).toHaveBeenCalledWith("company-1");
    });
  });
});
