import { loadValidaPayConfig } from "@/lib/validapay/config";
import { ValidaPayRequestError, ValidaPayTimeoutError } from "@/lib/validapay/errors";
import { getAccessToken, invalidateAccessToken } from "@/lib/validapay/token";

const TIMEOUT_MS = 10_000;

export interface ValidaPayRequestOptions {
  /** Caminho a partir da base, incluindo a barra inicial: `/v1/charges`. */
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Serializado como JSON. Ausente em GET/DELETE. */
  body?: unknown;
}

/**
 * Chamada autenticada à API da ValidaPay.
 *
 * **Transporte, não negócio.** Não sabe o que é cobrança, assinatura ou
 * produto — resolve token, timeout, 401 e erro de rede, e devolve o JSON. As
 * fases seguintes constroem os recursos em cima disto.
 *
 * **Não repete 5xx nem timeout.** Repetir um `POST /v1/charges` que expirou
 * pode cobrar duas vezes, e só é seguro onde `externalId` garante
 * idempotência — decisão que pertence a cada endpoint, não ao transporte.
 * Aqui a falha sobe, e quem chama decide.
 *
 * @throws {ValidaPayRequestError} a ValidaPay respondeu com erro
 * @throws {ValidaPayTimeoutError} não respondeu no prazo
 * @throws {ValidaPayAuthError | ValidaPayConfigError} ver token.ts e config.ts
 */
export async function validaPayRequest<T>(options: ValidaPayRequestOptions): Promise<T> {
  const resposta = await executar(options, await getAccessToken());

  // 401 é avaliado ANTES de qualquer processamento do lado da ValidaPay: a
  // requisição não teve efeito. Por isso repetir é seguro mesmo em POST — e
  // por isso a repetição acontece só aqui, e não para 5xx.
  if (resposta.status === 401) {
    invalidateAccessToken();
    const segunda = await executar(options, await getAccessToken());
    return interpretar<T>(segunda, options.path);
  }

  return interpretar<T>(resposta, options.path);
}

async function executar(
  options: ValidaPayRequestOptions,
  accessToken: string,
): Promise<Response> {
  const config = loadValidaPayConfig();
  const method = options.method ?? "GET";
  const temCorpo = options.body !== undefined;

  try {
    return await fetch(`${config.apiBaseUrl}${options.path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(temCorpo ? { "Content-Type": "application/json" } : {}),
      },
      ...(temCorpo ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (erro) {
    if (
      erro instanceof Error &&
      (erro.name === "TimeoutError" || erro.name === "AbortError")
    ) {
      throw new ValidaPayTimeoutError(`${method} ${options.path}`, TIMEOUT_MS);
    }
    throw new ValidaPayRequestError(0, options.path, "falha de rede");
  }
}

async function interpretar<T>(resposta: Response, path: string): Promise<T> {
  if (!resposta.ok) {
    // Lido como texto: corpo de erro de gateway nem sempre é JSON válido, e
    // um parse que falha aqui esconderia o erro real por trás de outro.
    throw new ValidaPayRequestError(resposta.status, path, await resposta.text());
  }

  if (resposta.status === 204) {
    return undefined as T;
  }

  return (await resposta.json()) as T;
}
