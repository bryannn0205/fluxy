import { AppError } from "@/lib/errors";

/**
 * Falhas da integração com a ValidaPay.
 *
 * Todas herdam de `AppError` para atravessarem o `handleAction`/`handleApiError`
 * já existentes, e todas carregam `userMessage` genérica de propósito: resposta
 * de gateway de pagamento pode trazer identificador interno, código de
 * adquirente ou dado do portador, e nada disso deve chegar à tela.
 *
 * **Nenhuma delas guarda credencial.** O que entra em `context` é lido pelo
 * logger, que redige chaves com `secret`/`token`/`authorization` — mas a regra
 * aqui é anterior a isso: segredo não é colocado no erro, ponto.
 */
export class ValidaPayConfigError extends AppError {
  readonly code = "VALIDAPAY_CONFIG_ERROR";
  readonly statusCode = 503;
  readonly userMessage = "Pagamento indisponível no momento";

  constructor(missingKeys: readonly string[]) {
    // Só os NOMES das variáveis ausentes. É o que torna a mensagem acionável
    // para quem opera, sem revelar o que está configurado.
    super(`ValidaPay não configurada: ${missingKeys.join(", ")}`, { missingKeys });
  }
}

export class ValidaPayAuthError extends AppError {
  readonly code = "VALIDAPAY_AUTH_ERROR";
  readonly statusCode = 502;
  readonly userMessage = "Pagamento indisponível no momento";

  constructor(message: string, context?: Record<string, unknown>) {
    super(`Falha ao autenticar na ValidaPay: ${message}`, context);
  }
}

export class ValidaPayTimeoutError extends AppError {
  readonly code = "VALIDAPAY_TIMEOUT";
  readonly statusCode = 504;
  readonly userMessage = "Pagamento indisponível no momento";

  constructor(
    public readonly operation: string,
    public readonly timeoutMs: number,
  ) {
    super(`ValidaPay não respondeu em ${timeoutMs}ms: ${operation}`, {
      operation,
      timeoutMs,
    });
  }
}

export class ValidaPayRequestError extends AppError {
  readonly code = "VALIDAPAY_REQUEST_ERROR";
  readonly statusCode = 502;
  readonly userMessage = "Pagamento indisponível no momento";

  constructor(
    public readonly status: number,
    public readonly path: string,
    /** Corpo bruto da resposta. Fica disponível para diagnóstico, mas **não**
     *  entra em `context` — corpo de erro de gateway não é campo estruturado e
     *  a redação do logger atua sobre chaves, não sobre texto livre. */
    public readonly responseBody: string,
  ) {
    super(`ValidaPay respondeu ${status} em ${path}`, { status, path });
  }
}
