import type {
  AttachmentCategory,
  OrderPriority,
  OrderStatus,
  PaymentMethod,
  Role,
  StockMovementReason,
} from "@/lib/generated/prisma/client";

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

export const CACHE_TTL = {
  ORDERS: 60,
  CUSTOMERS: 300,
  PRODUCTS: 900,
  COMPANY: 1800,
} as const;

export const TRIAL_DURATION_DAYS = 14;

// Quantas linhas os rankings do relatório mostram. Cinco cabe sem rolagem e
// mantém o gráfico legível — acima disso as barras ficam finas demais para
// comparar visualmente, e a resposta passa a ser uma tabela, não um gráfico.
export const REPORT_RANKING_SIZE = 5;

// Quantas notificações o painel do sino carrega. Não é paginado: além disso
// a lista deixa de ser "o que aconteceu agora" e vira histórico, que é papel
// da linha do tempo do pedido.
export const NOTIFICATION_LIST_LIMIT = 15;

// Pedidos lidos por vez ao gerar o CSV. Equilibra idas ao banco contra memória
// residente: o processo nunca segura mais que este número de linhas, qualquer
// que seja o tamanho do histórico da empresa.
export const EXPORT_BATCH_SIZE = 500;

// Slug do plano padrão criado no seed — ver prisma/seed.ts.
export const DEFAULT_PLAN_SLUG = "standard";

export const ROUTES = {
  LOGIN: "/login",
  REGISTER: "/register",
  FORGOT_PASSWORD: "/forgot-password",
  DASHBOARD: "/dashboard",
  ORDERS: "/dashboard/orders",
  ORDER_DETAIL: (id: string) => `/dashboard/orders/${id}`,
  PRODUCTION: "/dashboard/production",
  CUSTOMERS: "/dashboard/customers",
  CUSTOMER_DETAIL: (id: string) => `/dashboard/customers/${id}`,
  PRODUCTS: "/dashboard/products",
  PRODUCT_DETAIL: (id: string) => `/dashboard/products/${id}`,
  STOCK: "/dashboard/stock",
  REPORTS: "/dashboard/reports",
  SETTINGS: "/dashboard/settings",
  TEAM: "/dashboard/settings/team",
  BILLING: "/dashboard/settings/billing",
  ACCEPT_INVITE: "/accept-invite",
} as const;

// Marca um redirecionamento causado por sessão órfã (token válido, mas o
// usuário/empresa não existe mais). O middleware precisa deixar passar quem
// chega ao login com esta marca — senão devolveria a pessoa ao dashboard por
// ainda haver um JWT, criando um laço infinito. Ver lib/session.ts.
export const EXPIRED_SESSION_PARAM = "session";
export const EXPIRED_SESSION_VALUE = "expired";
export const EXPIRED_SESSION_LOGIN_URL = `${ROUTES.LOGIN}?${EXPIRED_SESSION_PARAM}=${EXPIRED_SESSION_VALUE}`;

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  OPERATOR: "Operador",
  FINANCE: "Financeiro",
  VIEWER: "Visualizador",
};

// O que cada papel faz, em uma linha — exibido ao escolher papel num convite
// ou ao alterar o de um membro. Quem convida precisa entender a consequência
// sem abrir a documentação. Ver lib/permissions.ts para a matriz completa.
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Controle total, incluindo plano e cobrança",
  ADMIN: "Gerencia equipe, configurações e toda a operação",
  MANAGER: "Toda a operação e os valores, sem mexer em equipe",
  OPERATOR: "Cria e toca pedidos no dia a dia; não vê custos nem relatórios",
  FINANCE: "Valores, pagamentos e relatórios; não altera pedidos",
  VIEWER: "Somente leitura da operação, sem nenhum valor financeiro",
};

// Chaves de módulo usadas em Plan.modules para o gate de acesso.
// Ver services/SubscriptionGateService.ts.
export const MODULE_KEYS = {
  ORDERS: "orders",
  CUSTOMERS: "customers",
  PRODUCTS: "products",
  PRODUCTION: "production",
  STOCK: "stock",
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];

// Tipado como Record<OrderStatus, ...> (não Record<string, ...>) de propósito:
// esquecer um status novo aqui vira erro de compilação, não bug silencioso.
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Recebido",
  PROCESSING: "Em produção",
  READY: "Pronto",
  COMPLETED: "Entregue",
  CANCELLED: "Cancelado",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  PROCESSING: "bg-blue-50 text-blue-700 border-blue-200",
  READY: "bg-violet-50 text-violet-700 border-violet-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
};

// Transições de status permitidas — ver OrderService.updateStatus.
export const VALID_ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// Colunas do Kanban de Produção, em ordem — CANCELLED não é uma coluna do
// board (pedidos cancelados continuam acessíveis pela lista de Pedidos).
export const KANBAN_COLUMNS: readonly OrderStatus[] = [
  "PENDING",
  "PROCESSING",
  "READY",
  "COMPLETED",
];

// Pedidos concluídos somem do board de Produção após esta janela — a lista
// de Pedidos continua mostrando o histórico completo sem limite. Evita que
// o board cresça sem limite (ver OrderRepository.listForKanban).
export const KANBAN_COMPLETED_WINDOW_DAYS = 7;

// Feed de atividade recente na página de Estoque — ver StockService.listRecentMovements.
export const STOCK_RECENT_MOVEMENTS_LIMIT = 20;

export const ORDER_PRIORITY_LABELS: Record<OrderPriority, string> = {
  LOW: "Baixa",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const ORDER_PRIORITY_STYLES: Record<OrderPriority, string> = {
  LOW: "bg-slate-50 text-slate-600 border-slate-200",
  NORMAL: "bg-sky-50 text-sky-700 border-sky-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  URGENT: "bg-red-50 text-red-700 border-red-200",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: "PIX",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  BOLETO: "Boleto",
  CASH: "Dinheiro",
  BANK_TRANSFER: "Transferência bancária",
  OTHER: "Outro",
};

export const ATTACHMENT_CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  NOTA: "Nota",
  FOTO: "Foto",
  DOCUMENTO: "Documento",
  ARTE_CLIENTE: "Arte do cliente",
  OUTRO: "Outro",
};

// Tamanho máximo de anexo de pedido, em bytes — ver app/api/orders/[id]/attachments/route.ts.
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const STOCK_MOVEMENT_REASON_LABELS: Record<StockMovementReason, string> = {
  SALE: "Saída por venda",
  CANCELLATION: "Devolução (pedido cancelado)",
  RESTOCK: "Reposição",
  ADJUSTMENT: "Ajuste manual",
};
