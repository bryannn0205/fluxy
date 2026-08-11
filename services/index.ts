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
import { PrismaSubscriptionCheckoutRepository } from "@/repositories/implementations/PrismaSubscriptionCheckoutRepository";
import { PrismaPaymentProviderEventRepository } from "@/repositories/implementations/PrismaPaymentProviderEventRepository";
import { validaPayCharges } from "@/lib/validapay/charges";
import { validaPaySubscriptions } from "@/lib/validapay/subscriptions";
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
import { PlanLimitService } from "@/services/PlanLimitService";
import { PlanCatalogService } from "@/services/PlanCatalogService";
import { SubscriptionCheckoutService } from "@/services/SubscriptionCheckoutService";
import { PaymentProviderEventService } from "@/services/PaymentProviderEventService";

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
const subscriptionCheckoutRepository = new PrismaSubscriptionCheckoutRepository(prisma);
const paymentProviderEventRepository = new PrismaPaymentProviderEventRepository(prisma);

export const auditService = new AuditService(prisma);
export const subscriptionGateService = new SubscriptionGateService();

// Catálogo público: sem dependência de sessão, empresa ou auditoria — é o
// único service que responde a quem não está autenticado.
export const planCatalogService = new PlanCatalogService(planRepository);

// Instanciado antes dos services de negócio: todos que criam registro
// dependem dele para conferir a cota do plano.
export const planLimitService = new PlanLimitService(
  companyRepository,
  userRepository,
  invitationRepository,
  productRepository,
  customerRepository,
  orderRepository,
);

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
  planLimitService,
);

export const productService = new ProductService(
  productRepository,
  auditService,
  subscriptionGateService,
  planLimitService,
);

export const notificationService = new NotificationService(notificationRepository);

export const orderService = new OrderService(
  orderRepository,
  customerRepository,
  productRepository,
  auditService,
  subscriptionGateService,
  notificationService,
  planLimitService,
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

export const subscriptionCheckoutService = new SubscriptionCheckoutService(
  subscriptionCheckoutRepository,
  planRepository,
  companyRepository,
  validaPayCharges,
);

// Depois do checkout: o webhook é gatilho e delega a confirmação a ele.
export const paymentProviderEventService = new PaymentProviderEventService(
  paymentProviderEventRepository,
  subscriptionCheckoutRepository,
  subscriptionCheckoutService,
  validaPaySubscriptions,
);

export const teamService = new TeamService(
  userRepository,
  invitationRepository,
  auditService,
  subscriptionGateService,
  planLimitService,
);
