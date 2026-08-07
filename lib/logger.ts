import { env } from "@/lib/env";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
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

// A comparação é por SUBSTRING (ver isSensitiveKey), então "token" cobre
// "access_token" e "cpf" cobre "cpfCnpj". Acrescentar é barato; esquecer sai
// caro uma vez só.
const SENSITIVE_KEYS = [
  "password",
  "senha",
  "token",
  "secret",
  "apikey",
  "authorization",
  "cardnumber",
  "cvv",
  "cpf",
  "cnpj",
  "passwordhash",

  // Campos do payload de webhook do provedor de pagamento. O evento
  // `payment.success` traz `payer` com documento e dados bancários do pagador
  // — informação de terceiro, que o Fluxy não guarda e muito menos deve
  // registrar em log. `taxid` é o nome que a ValidaPay usa para o documento,
  // e por isso não era alcançado por "cpf"/"cnpj".
  "taxid",
  "account",
  "bank",
  "branch",
];

const minLevel: LogLevel = env.NODE_ENV === "production" ? "info" : "debug";

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => normalized.includes(sensitive));
}

function sanitize(context: LogContext): LogContext {
  const result: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    if (isSensitiveKey(key)) {
      result[key] = "[REDACTED]";
    } else if (value instanceof Error) {
      result[key] = {
        name: value.name,
        message: value.message,
        stack: env.NODE_ENV === "production" ? undefined : value.stack,
      };
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitize(value as LogContext);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function write(level: LogLevel, message: string, context: LogContext = {}) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    ...sanitize(context),
  };

  const output = `${JSON.stringify(entry)}\n`;

  if (level === "error") {
    process.stderr.write(output);
  } else {
    process.stdout.write(output);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
