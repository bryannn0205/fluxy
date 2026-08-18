import type {
  AttachmentCategory,
  OrderPaymentStatus,
  OrderPriority,
  OrderStatus,
  PaymentMethod,
  PaymentType,
  Role,
  StockMovementReason,
  SubscriptionStatus,
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

// Planos comercializáveis, NA ORDEM em que aparecem publicamente.
//
// É esta lista, e não uma coluna do banco, que decide o que é público: um
// plano criado à mão no banco não passa a ser vendido por existir. A ordem
// também vem daqui — não é alfabética nem por preço, é posicionamento
// comercial, e mudá-lo precisa ser a edição de uma linha só.
//
// Ver PlanRepository.listPublic(), que percorre esta lista para montar o
// resultado: o que não está aqui não pode sair de lá.
export const PUBLIC_PLAN_SLUGS = [DEFAULT_PLAN_SLUG, "plus", "pro"] as const;

export type PublicPlanSlug = (typeof PUBLIC_PLAN_SLUGS)[number];

// Nome comercial de cada plano — fonte única.
//
// Fica aqui, e não em `prisma/seed-plans.ts`, porque a interface também
// precisa nomear um plano a partir do slug (o aviso de intenção, por exemplo,
// só recebe o slug). Com o nome no seed, ou a tela consultava o banco para
// escrever uma frase, ou repetia a string — e a repetida divergiria no dia em
// que um plano fosse renomeado. O seed lê este mapa.
export const PUBLIC_PLAN_NAMES: Record<PublicPlanSlug, string> = {
  standard: "Fluxy Standard",
  plus: "Fluxy Plus",
  pro: "Fluxy Pro",
};

// Plano recomendado na vitrine. É posicionamento comercial, não regra de
// produto: não concede nada, não altera limite e não influencia cobrança.
export const RECOMMENDED_PLAN_SLUG: PublicPlanSlug = "plus";

// Planos que dão direito ao teste grátis.
//
// Lista, e não um `!== DEFAULT_PLAN_SLUG`, porque a pergunta "este plano tem
// trial?" precisa continuar respondível quando existir um quarto plano. O
// cadastro só provisiona o plano padrão, então na prática nenhum caminho cria
// TRIALING fora daqui — esta lista é o que a interface consulta para não
// prometer teste onde ele não existe.
export const PLAN_SLUGS_WITH_TRIAL: readonly PublicPlanSlug[] = [DEFAULT_PLAN_SLUG];

export function planHasTrial(slug: string): boolean {
  return (PLAN_SLUGS_WITH_TRIAL as readonly string[]).includes(slug);
}

// Periodicidades de cobrança. Fica aqui, junto dos slugs públicos, porque é a
// outra metade da mesma pergunta comercial — "qual plano, cobrado como?" — e
// as duas são consumidas pelos mesmos lugares: intenção, página de planos e
// tela de cobrança. Ver lib/plan-intent.ts.
export const BILLING_INTERVALS = ["monthly", "yearly"] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const ROUTES = {
  HOME: "/",
  PLANS: "/plans",
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
  RECEIVABLES: "/dashboard/finance/receivables",
  REPORTS: "/dashboard/reports",
  SETTINGS: "/dashboard/settings",
  TEAM: "/dashboard/settings/team",
  BILLING: "/dashboard/settings/billing",
  BILLING_CHECKOUT: "/dashboard/settings/billing/checkout",
  // Para onde a ValidaPay devolve o cliente depois do pagamento. A página lê o
  // estado no servidor — a URL não prova nada. Ver app/.../checkout/retorno.
  BILLING_CHECKOUT_RETURN: "/dashboard/settings/billing/checkout/retorno",
  // Ponto de entrada público da contratação. Decide no servidor se o visitante
  // precisa autenticar antes de chegar ao checkout — ver app/contratar/route.ts.
  SUBSCRIBE: "/contratar",
  ACCEPT_INVITE: "/accept-invite",
} as const;

// Marca um redirecionamento causado por sessão órfã (token válido, mas o
// usuário/empresa não existe mais). O middleware precisa deixar passar quem
// chega ao login com esta marca — senão devolveria a pessoa ao dashboard por
// ainda haver um JWT, criando um laço infinito. Ver lib/session.ts.
export const EXPIRED_SESSION_PARAM = "session";
export const EXPIRED_SESSION_VALUE = "expired";
export const EXPIRED_SESSION_LOGIN_URL = `${ROUTES.LOGIN}?${EXPIRED_SESSION_PARAM}=${EXPIRED_SESSION_VALUE}`;

// "Atrasado" não está aqui porque não é um valor de OrderPaymentStatus — é
// condição derivada por isOrderOverdue(). A tela combina o rótulo abaixo com
// o aviso de atraso; o banco guarda só o primeiro.
export const PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  PENDING: "Pendente",
  PARTIAL: "Parcial",
  PAID: "Pago",
  REFUNDED: "Estornado",
  CANCELLED: "Cancelado",
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  PAYMENT: "Recebimento",
  REFUND: "Estorno",
};

// Tipado contra o enum, e não Record<string, string>: um estado novo em
// SubscriptionStatus vira erro de compilação aqui, em vez de aparecer cru na
// tela. Estava duplicado e destipado dentro de Configurações.
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIALING: "Período de teste",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento pendente",
  CANCELED: "Cancelada",
  EXPIRED: "Expirada",
};

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
// sem abrir a documentação.
//
// **Estas frases descrevem a matriz de lib/permissions.ts e precisam mudar
// junto com ela.** A anterior dizia que o Gerente via "toda a operação e os
// valores"; quando MANAGER perdeu o acesso financeiro, a frase virou promessa
// falsa na tela de convite — que é onde alguém decide o que está concedendo.
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Controle total da empresa, incluindo plano, cobrança e equipe",
  ADMIN: "Administra a operação, a equipe e os valores financeiros",
  MANAGER: "Gerencia pedidos, clientes, produtos, estoque e produção, sem ver valores",
  OPERATOR: "Executa pedidos e produção, sem acesso financeiro",
  FINANCE: "Acessa valores, faturamento e pagamentos, sem operar pedidos ou produção",
  VIEWER: "Consulta a operação sem poder alterar nada, e sem ver valores",
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

/**
 * Tons translúcidos, e não os `-50`/`-700` de antes: o selo só aparece dentro
 * do painel, que passou a ser escuro, e uma pastilha de fundo claro virava um
 * bloco luminoso no meio da tabela. Com `/15` no fundo e `-300` no texto, o
 * mesmo selo funciona sobre a linha da tabela e sobre o cartão.
 */
export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-400/15 text-amber-300 border-amber-400/25",
  PROCESSING: "bg-sky-400/15 text-sky-300 border-sky-400/25",
  READY: "bg-violet-400/15 text-violet-300 border-violet-400/25",
  COMPLETED: "bg-emerald-400/15 text-emerald-300 border-emerald-400/25",
  CANCELLED: "bg-red-400/15 text-red-300 border-red-400/25",
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
