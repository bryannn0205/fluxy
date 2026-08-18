import { validaPayRequest } from "@/lib/validapay/client";

/**
 * Checkout hospedado — `POST /v1/checkout-sessions`.
 *
 * **É o único caminho de pagamento da contratação.** O cliente escolhe Pix ou
 * cartão dentro do ambiente da ValidaPay, e nenhum dado de pagamento passa pelo
 * Fluxy: não há número de cartão, CVV ou validade em ponto algum deste código,
 * nem poderia haver — a sessão é criada só com o identificador do preço.
 *
 * Contrato medido em sandbox em 17/08/2026, não deduzido de documentação:
 *
 * | campo                   | resultado                                   |
 * | ----------------------- | ------------------------------------------- |
 * | `priceId`               | obrigatório — sem ele a API responde 400    |
 * | `allowedPaymentMethods` | validado — valor fora do enum responde 400  |
 * | `successUrl`            | aceito e devolvido na consulta              |
 * | `failureUrl`            | aceito e devolvido na consulta              |
 * | `cancelUrl`             | **aceito e DESCARTADO** — volta sempre null |
 * | `metadata`              | devolvido byte a byte                       |
 *
 * `cancelUrl` não é enviado justamente por isso: mandá-lo sugeriria um retorno
 * de cancelamento que não existe.
 *
 * **Campos desconhecidos passam em silêncio.** Enviar `campoQueNaoExiste` cria
 * a sessão sem erro nenhum — medido. Um nome digitado errado não falha, some.
 *
 * **A `url` só existe na resposta da criação.** `GET /v1/checkout-sessions/:id`
 * devolve status, metadata e métodos aceitos, mas nenhum campo de URL. É por
 * isso que ela é persistida em `SubscriptionCheckout.externalSessionUrl`, e não
 * derivada do identificador.
 */

/** Os dois métodos oferecidos dentro do checkout hospedado. */
export const METODOS_DE_PAGAMENTO = ["pix", "creditcard"] as const;

export interface CreateCheckoutSessionInput {
  readonly priceId: string;
  /** Volta na consulta e é como o evento reencontra a tentativa local. */
  readonly metadata: Readonly<Record<string, string>>;
  readonly successUrl: string;
  readonly failureUrl: string;
}

export interface CheckoutSessionCreated {
  readonly sessionId: string;
  /** Página hospedada. É para cá que o cliente é enviado, e só vem aqui. */
  readonly url: string;
}

export interface CheckoutSessionSnapshot {
  readonly sessionId: string;
  /** Texto cru. Observado: `"active"`. */
  readonly status: string;
  readonly allowedPaymentMethods: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ValidaPayCheckoutSessionsGateway {
  createSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionCreated>;
  getSession(sessionId: string): Promise<CheckoutSessionSnapshot>;
}

interface RespostaDeCriacao {
  id?: unknown;
  url?: unknown;
}

interface RespostaDeConsulta {
  id?: unknown;
  status?: unknown;
  allowedPaymentMethods?: unknown;
  metadata?: unknown;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

async function createSession(
  input: CreateCheckoutSessionInput,
): Promise<CheckoutSessionCreated> {
  const resposta = await validaPayRequest<RespostaDeCriacao>({
    path: "/v1/checkout-sessions",
    method: "POST",
    body: {
      priceId: input.priceId,
      allowedPaymentMethods: [...METODOS_DE_PAGAMENTO],
      successUrl: input.successUrl,
      failureUrl: input.failureUrl,
      metadata: input.metadata,
    },
  });

  const sessionId = texto(resposta.id);
  const url = texto(resposta.url);

  // 200 sem id ou sem url é indistinguível de falha para quem chamou: não há
  // para onde mandar o cliente, nem o que correlacionar depois.
  if (!sessionId || !url) {
    throw new Error("Resposta de checkout-session sem id ou url");
  }

  return { sessionId, url };
}

async function getSession(sessionId: string): Promise<CheckoutSessionSnapshot> {
  const resposta = await validaPayRequest<RespostaDeConsulta>({
    path: `/v1/checkout-sessions/${encodeURIComponent(sessionId)}`,
  });

  return {
    sessionId: texto(resposta.id) ?? sessionId,
    status: typeof resposta.status === "string" ? resposta.status : "",
    allowedPaymentMethods: Array.isArray(resposta.allowedPaymentMethods)
      ? resposta.allowedPaymentMethods.filter(
          (metodo): metodo is string => typeof metodo === "string",
        )
      : [],
    metadata: objeto(resposta.metadata),
  };
}

export const validaPayCheckoutSessions: ValidaPayCheckoutSessionsGateway = {
  createSession,
  getSession,
};
