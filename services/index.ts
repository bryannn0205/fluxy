import { prisma } from "@/lib/db";
import { PrismaCompanyRepository } from "@/repositories/implementations/PrismaCompanyRepository";
import { PrismaUserRepository } from "@/repositories/implementations/PrismaUserRepository";
import { PrismaPlanRepository } from "@/repositories/implementations/PrismaPlanRepository";
import { PrismaCustomerRepository } from "@/repositories/implementations/PrismaCustomerRepository";
import { PrismaProductRepository } from "@/repositories/implementations/PrismaProductRepository";
import { PrismaOrderRepository } from "@/repositories/implementations/PrismaOrderRepository";
import { PrismaOrderAttachmentRepository } from "@/repositories/implementations/PrismaOrderAttachmentRepository";
import { PrismaStockRepository } from "@/repositories/implementations/PrismaStockRepository";
import { PrismaInvitationRepository } from "@/repositories/implementations/PrismaInvitationRepository";
import { PrismaReportRepository } from "@/repositories/implementations/PrismaReportRepository";
import { PrismaNotificationRepository } from "@/repositories/implementations/PrismaNotificationRepository";
import { PrismaPaymentRepository } from "@/repositories/implementations/PrismaPaymentRepository";
import { AuditService } from "@/services/AuditService";
import { AuthService } from "@/services/AuthService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";
import { CustomerService } from "@/services/CustomerService";
import { ProductService } from "@/services/ProductService";
import { OrderService } from "@/services/OrderService";
import { OrderAttachmentService } from "@/services/OrderAttachmentService";
import { StockService } from "@/services/StockService";
import { TeamService } from "@/services/TeamService";
import { ReportService } from "@/services/ReportService";
import { NotificationService } from "@/services/NotificationService";
import { FinanceService } from "@/services/FinanceService";

// companyRepository e userRepository são exportados diretamente (não só via
// Service) porque updates de perfil/empresa são CRUD puro, sem regra de
// negócio — criar um Service só para isso seria cerimônia sem propósito.
// Ver .claude/docs/architecture/design-principles.md#quando-criar-um-service.
export const companyRepository = new PrismaCompanyRepository(prisma);
export const userRepository = new PrismaUserRepository(prisma);
const planRepository = new PrismaPlanRepository(prisma);
const customerRepository = new PrismaCustomerRepository(prisma);
const productRepository = new PrismaProductRepository(prisma);
const orderRepository = new PrismaOrderRepository(prisma);
const orderAttachmentRepository = new PrismaOrderAttachmentRepository(prisma);
const stockRepository = new PrismaStockRepository(prisma);
const invitationRepository = new PrismaInvitationRepository(prisma);
const reportRepository = new PrismaReportRepository(prisma);
const notificationRepository = new PrismaNotificationRepository(prisma);
const paymentRepository = new PrismaPaymentRepository(prisma);

export const auditService = new AuditService(prisma);
export const subscriptionGateService = new SubscriptionGateService();

export const authService = new AuthService(
  companyRepository,
  userRepository,
  planRepository,
  auditService,
);

export const customerService = new CustomerService(
  customerRepository,
  auditService,
  subscriptionGateService,
);

export const productService = new ProductService(
  productRepository,
  auditService,
  subscriptionGateService,
);

export const notificationService = new NotificationService(notificationRepository);

export const orderService = new OrderService(
  orderRepository,
  customerRepository,
  productRepository,
  auditService,
  subscriptionGateService,
  notificationService,
);

export const financeService = new FinanceService(
  paymentRepository,
  auditService,
  subscriptionGateService,
);

export const orderAttachmentService = new OrderAttachmentService(
  orderAttachmentRepository,
  orderRepository,
  auditService,
  subscriptionGateService,
);

export const stockService = new StockService(stockRepository, subscriptionGateService);

export const reportService = new ReportService(reportRepository);

export const teamService = new TeamService(
  userRepository,
  invitationRepository,
  auditService,
  subscriptionGateService,
);
