# 📋 Logs & Tratamento de Erros

## Regra Fundamental

**Nunca utilizar `console.log` em produção.**

Todo log deve ser **estruturado** (JSON), com contexto suficiente para diagnosticar sem reproduzir.

## Logger Estruturado

```typescript
// lib/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  companyId?: string;
  userId?: string;
  requestId?: string;
  resource?: string;
  resourceId?: string;
  duration?: number;
  [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel: LogLevel = env.NODE_ENV === "production" ? "info" : "debug";

function write(level: LogLevel, message: string, context: LogContext = {}) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    ...sanitize(context),
  };

  const output = JSON.stringify(entry);

  if (level === "error") {
    process.stderr.write(`${output}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => write("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => write("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => write("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => write("error", msg, ctx),
};
```

## Sanitização — Nunca Logar Dados Sensíveis

```typescript
const SENSITIVE_KEYS = [
  "password",
  "senha",
  "token",
  "secret",
  "apiKey",
  "authorization",
  "cardNumber",
  "cvv",
  "cpf",
  "cnpj",
];

function sanitize(context: LogContext): LogContext {
  const result: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    const isSensitive = SENSITIVE_KEYS.some((k) =>
      key.toLowerCase().includes(k.toLowerCase()),
    );

    if (isSensitive) {
      result[key] = "[REDACTED]";
    } else if (value instanceof Error) {
      result[key] = {
        name: value.name,
        message: value.message,
        stack: env.NODE_ENV === "production" ? undefined : value.stack,
      };
    } else if (value && typeof value === "object") {
      result[key] = sanitize(value as LogContext);
    } else {
      result[key] = value;
    }
  }

  return result;
}
```

⚠️ **Nunca** logue: senhas, tokens, chaves de API, números de cartão, CPF/CNPJ completo, conteúdo de emails.

## Níveis de Log

| Nível   | Quando usar                    | Exemplo                                  |
| ------- | ------------------------------ | ---------------------------------------- |
| `debug` | Diagnóstico em desenvolvimento | Payload de request, resultado de query   |
| `info`  | Eventos de negócio esperados   | Pedido criado, usuário logou             |
| `warn`  | Situação anormal recuperável   | Rate limit atingido, retry de webhook    |
| `error` | Falha que exige investigação   | Exceção não tratada, falha de integração |

```typescript
logger.info("Order created", {
  orderId: order.id,
  companyId,
  userId,
  total: order.total,
});

logger.warn("Rate limit exceeded", {
  identifier: `login:${ip}`,
  attempts: 6,
});

logger.error("Payment gateway failed", {
  error,
  companyId,
  orderId,
  gateway: "asaas",
});
```

## O Que Logar

### ✅ Sempre logar

- Criação, atualização e exclusão de entidades
- Login, logout, falhas de autenticação
- Chamadas a APIs externas (com duração)
- Erros não tratados
- Operações lentas (> 1s)
- Rate limits atingidos
- Webhooks recebidos e processados

### ❌ Nunca logar

- Dados sensíveis (ver sanitização)
- Payloads completos de request em produção
- Loops de alta frequência
- Informação sem contexto (`logger.info('erro')`)

## Contexto de Requisição

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);
  return response;
}
```

```typescript
// Correlacionar logs de uma mesma requisição
const requestId = headers().get("x-request-id");

logger.info("Processing order", { requestId, orderId, companyId });
```

## Medição de Duração

```typescript
export async function withTiming<T>(
  operation: string,
  context: LogContext,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();

  try {
    const result = await fn();
    const duration = Math.round(performance.now() - start);

    if (duration > 1000) {
      logger.warn("Slow operation", { operation, duration, ...context });
    } else {
      logger.debug("Operation completed", { operation, duration, ...context });
    }

    return result;
  } catch (error) {
    logger.error("Operation failed", {
      operation,
      duration: Math.round(performance.now() - start),
      error,
      ...context,
    });
    throw error;
  }
}
```

---

# Tratamento de Erros

## Hierarquia de Erros

```typescript
// lib/errors.ts
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

  constructor(public readonly fieldErrors: Record<string, string[]>) {
    super("Validation failed", { fieldErrors });
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND";
  readonly statusCode = 404;
  readonly userMessage = "Recurso não encontrado";
}

export class UnauthorizedError extends AppError {
  readonly code = "UNAUTHORIZED";
  readonly statusCode = 401;
  readonly userMessage = "Faça login para continuar";
}

export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN";
  readonly statusCode = 403;
  readonly userMessage = "Você não tem permissão para esta ação";
}

export class RateLimitError extends AppError {
  readonly code = "RATE_LIMIT";
  readonly statusCode = 429;
  readonly userMessage = "Muitas tentativas. Aguarde alguns minutos.";
}

export class DuplicateOrderError extends AppError {
  readonly code = "DUPLICATE_ORDER";
  readonly statusCode = 409;
  readonly userMessage = "Já existe um pedido com este número";

  constructor(orderNumber: string) {
    super(`Duplicate order number: ${orderNumber}`, { orderNumber });
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
```

## Princípio: Duas Mensagens

Todo erro tem **duas mensagens**:

| Destinatário      | Conteúdo                                           |
| ----------------- | -------------------------------------------------- |
| **Usuário**       | Amigável, em português, acionável — `userMessage`  |
| **Desenvolvedor** | Técnica, detalhada, com contexto — log estruturado |

```typescript
try {
  await orderService.create(input, companyId);
} catch (error) {
  // Desenvolvedor: detalhes completos
  logger.error("Order creation failed", { error, companyId, userId, input });

  // Usuário: mensagem amigável
  if (error instanceof AppError) {
    return { error: error.userMessage };
  }
  return { error: "Não foi possível criar o pedido. Tente novamente." };
}
```

⚠️ **Nunca** exponha `error.message` cru ou stack trace ao usuário — vaza informação interna.

## Handler Centralizado — API Routes

```typescript
// lib/api-handler.ts
export function handleApiError(error: unknown, context: LogContext = {}): Response {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error(error.message, { error, ...context });
    } else {
      logger.warn(error.message, { code: error.code, ...context });
    }

    return Response.json(
      {
        code: error.code,
        message: error.userMessage,
        ...(error instanceof ValidationError && { fields: error.fieldErrors }),
      },
      { status: error.statusCode },
    );
  }

  logger.error("Unhandled error", { error, ...context });

  return Response.json(
    { code: "INTERNAL_ERROR", message: "Erro interno. Tente novamente." },
    { status: 500 },
  );
}
```

```typescript
// app/api/orders/route.ts
export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const body = await request.json();

    const validation = createOrderSchema.safeParse(body);
    if (!validation.success) {
      throw new ValidationError(validation.error.flatten().fieldErrors);
    }

    const order = await orderService.create(validation.data, session.user.companyId);
    return Response.json(OrderMapper.toDto(order), { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: "POST /api/orders" });
  }
}
```

## Handler — Server Actions

```typescript
// lib/action-handler.ts
export async function handleAction<T>(
  fn: () => Promise<T>,
  context: LogContext = {},
): Promise<ActionResult<T>> {
  try {
    return { data: await fn() };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.userMessage, fields: error.fieldErrors };
    }

    if (error instanceof AppError) {
      logger.warn(error.message, { code: error.code, ...context });
      return { error: error.userMessage };
    }

    logger.error("Unhandled action error", { error, ...context });
    return { error: "Ocorreu um erro inesperado. Tente novamente." };
  }
}
```

```typescript
"use server";
export async function createOrderAction(input: unknown) {
  const session = await requireAuth();

  return handleAction(
    async () => {
      const validation = createOrderSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      const order = await orderService.create(validation.data, session.user.companyId);
      revalidatePath("/dashboard/orders");
      return OrderMapper.toDto(order);
    },
    { companyId: session.user.companyId, userId: session.user.id },
  );
}
```

## Error Boundaries no React

```tsx
// app/(dashboard)/error.tsx
"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="size-12 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-medium">Algo deu errado</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Não foi possível carregar esta página.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Código: {error.digest}
        </p>
      )}
      <Button variant="outline" onClick={reset} className="mt-6">
        Tentar novamente
      </Button>
    </div>
  );
}
```

## Nunca Engolir Erros

```typescript
// ❌ Silêncio total — bug invisível
try {
  await sendNotification(order);
} catch {}

// ✅ Falha não-crítica: loga e continua
try {
  await sendNotification(order);
} catch (error) {
  logger.error("Failed to send order notification", { error, orderId: order.id });
  // pedido já foi criado; notificação é secundária
}

// ✅ Falha crítica: propaga
const payment = await paymentService.charge(order); // deixa subir
```

## Retry em Serviços Externos

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 200, operation }: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === attempts) break;

      const delay = baseDelayMs * 2 ** (attempt - 1);
      logger.warn("Retrying operation", { operation, attempt, delay });
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new ExternalServiceError(operation, lastError);
}
```

## Checklist

- [ ] Zero `console.log` no código
- [ ] Logs em JSON estruturado
- [ ] Dados sensíveis redigidos
- [ ] `companyId` e `userId` no contexto dos logs
- [ ] Classes de erro tipadas com `userMessage`
- [ ] Handler centralizado em API Routes e Actions
- [ ] Usuário nunca vê stack trace ou `error.message` cru
- [ ] Erros não-críticos logados, não propagados
- [ ] Error boundary em cada segmento de rota
- [ ] Retry com backoff em integrações externas
- [ ] Sentry configurado em produção

---

**Ver também:**

- [Security](../features/security.md)
- [UX Principles](../ui-ux/ux-principles.md)
- [Backend](../tech-stack/backend.md)
