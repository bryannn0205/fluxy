export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  abstract readonly userMessage: string;

  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR";
  readonly statusCode = 422;
  readonly userMessage = "Os dados informados são inválidos";

  constructor(public readonly fieldErrors: Record<string, string[] | undefined>) {
    super("Validation failed", { fieldErrors });
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND";
  readonly statusCode = 404;
  readonly userMessage = "Recurso não encontrado";

  constructor(resource = "Resource") {
    super(`${resource} not found`);
  }
}

export class UnauthorizedError extends AppError {
  readonly code = "UNAUTHORIZED";
  readonly statusCode = 401;
  readonly userMessage = "Faça login para continuar";

  constructor(message = "Not authenticated") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN";
  readonly statusCode = 403;
  readonly userMessage = "Você não tem permissão para esta ação";

  constructor(message = "Forbidden") {
    super(message);
  }
}

/**
 * Estado atual do recurso impede a operação — 409.
 *
 * Diferente de ValidationError (422, "o dado está errado"): aqui o dado pode
 * estar perfeito, mas conflita com o que já existe. O caso que motivou a
 * classe é a mesma idempotencyKey chegando com payload diferente: nada a
 * corrigir no formulário, e devolver sucesso seria mentir.
 */
export class ConflictError extends AppError {
  readonly code = "CONFLICT";
  readonly statusCode = 409;
  readonly userMessage = "Esta operação conflita com o estado atual do registro";

  constructor(message = "Conflict") {
    super(message);
  }
}

export class RateLimitError extends AppError {
  readonly code = "RATE_LIMIT";
  readonly statusCode = 429;
  readonly userMessage = "Muitas tentativas. Aguarde alguns minutos.";

  constructor(message = "Rate limit exceeded") {
    super(message);
  }
}

export class DuplicateOrderNumberError extends AppError {
  readonly code = "DUPLICATE_ORDER_NUMBER";
  readonly statusCode = 409;
  readonly userMessage = "Já existe um pedido com este número";

  constructor(orderNumber: string) {
    super(`Duplicate order number: ${orderNumber}`, { orderNumber });
  }
}

export class EmailAlreadyInUseError extends AppError {
  readonly code = "EMAIL_ALREADY_IN_USE";
  readonly statusCode = 409;
  readonly userMessage = "Já existe uma conta com este e-mail";

  constructor() {
    super("Email already in use");
  }
}

export class DuplicateSkuError extends AppError {
  readonly code = "DUPLICATE_SKU";
  readonly statusCode = 409;
  readonly userMessage = "Já existe um produto com este SKU";

  constructor(sku: string) {
    super(`Duplicate SKU: ${sku}`, { sku });
  }
}

export class InvalidStatusTransitionError extends AppError {
  readonly code = "INVALID_STATUS_TRANSITION";
  readonly statusCode = 409;
  readonly userMessage = "Essa mudança de status não é permitida";

  constructor(from: string, to: string) {
    super(`Invalid order status transition: ${from} -> ${to}`, { from, to });
  }
}

export class SubscriptionRequiredError extends AppError {
  readonly code = "SUBSCRIPTION_REQUIRED";
  readonly statusCode = 402;
  readonly userMessage =
    "Sua assinatura expirou. Reative para continuar criando e editando registros.";

  constructor() {
    super("Subscription required");
  }
}

/**
 * A empresa atingiu o teto do plano para um recurso — 402.
 *
 * **Mesmo status de SubscriptionRequiredError, código diferente**, e isso é
 * deliberado: 402 *Payment Required* descreve os dois ("uma ação comercial
 * destrava isto"), e quem decide o que a tela mostra é o `code`, não o número.
 * `SUBSCRIPTION_REQUIRED` pede reativação; `PLAN_LIMIT_REACHED` pede upgrade.
 *
 * **Não é 403.** Papel sem permissão é 403 e a saída é pedir acesso a um
 * administrador; cota cheia é assunto comercial e a saída é mudar de plano.
 * Confundir os dois faz o usuário procurar a solução errada.
 *
 * Carrega dados estruturados para a interface montar a mensagem — sem isso,
 * "limite atingido" obriga a tela a adivinhar qual, quanto e para onde ir.
 */
export class PlanLimitReachedError extends AppError {
  readonly code = "PLAN_LIMIT_REACHED";
  readonly statusCode = 402;
  readonly userMessage: string;

  constructor(
    readonly resource: string,
    readonly resourceLabel: string,
    readonly currentUsage: number,
    readonly limit: number,
    readonly planSlug: string,
    readonly upgradePath: string,
  ) {
    super(`Plan limit reached: ${resource} (${currentUsage}/${limit})`, {
      resource,
      currentUsage,
      limit,
      planSlug,
      upgradePath,
    });

    this.userMessage =
      `Você atingiu o limite de ${limit} ${resourceLabel} do seu plano ` +
      `(em uso: ${currentUsage}). Faça upgrade para continuar.`;
  }
}

export class ExternalServiceError extends AppError {
  readonly code = "EXTERNAL_SERVICE_ERROR";
  readonly statusCode = 502;
  readonly userMessage = "Serviço temporariamente indisponível. Tente novamente.";

  constructor(service: string, cause?: unknown) {
    super(`External service failed: ${service}`, { service, cause });
  }
}
