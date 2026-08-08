import { loadValidaPayConfig, type ValidaPayConfig } from "@/lib/validapay/config";
import { ValidaPayAuthError, ValidaPayTimeoutError } from "@/lib/validapay/errors";

const TIMEOUT_MS = 10_000;

/**
 * Renova o token esta antecedência antes de `expires_in`.
 *
 * Um token que vence em trânsito volta como 401 no meio de uma operação de
 * cobrança. Sessenta segundos cobrem latência de rede e relógios levemente
 * dessincronizados, num token que dura uma hora.
 */
const MARGEM_DE_RENOVACAO_MS = 60_000;

interface RespostaDeToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface TokenEmCache {
  readonly accessToken: string;
  readonly tokenType: string;
  /** Instante a partir do qual o token deixa de ser servido. */
  readonly renovarApos: number;
}

/**
 * Cache do token, **em memória do processo** — nunca em Redis ou disco.
 *
 * O token é credencial viva. Guardá-lo no Redis o colocaria em repouso num
 * segundo lugar, com um segundo controle de acesso e um segundo caminho de
 * vazamento, para economizar uma chamada por hora por instância. Na Vercel
 * cada instância mantém o seu; instância fria busca o próprio, e isso é
 * barato.
 *
 * Guarda a PROMESSA, não o valor: sem isso, dez requisições simultâneas numa
 * instância fria disparariam dez pedidos de token.
 */
let emVoo: Promise<TokenEmCache> | null = null;
let emCache: TokenEmCache | null = null;

function estaValido(token: TokenEmCache | null, agora: number): token is TokenEmCache {
  return token !== null && agora < token.renovarApos;
}

/**
 * Access token válido, do cache quando possível.
 *
 * @throws {ValidaPayAuthError} credenciais recusadas ou resposta inesperada
 * @throws {ValidaPayTimeoutError} o servidor de OAuth não respondeu
 * @throws {ValidaPayConfigError} faltam variáveis de ambiente
 */
export async function getAccessToken(): Promise<string> {
  const agora = Date.now();

  if (estaValido(emCache, agora)) {
    return emCache.accessToken;
  }

  // Já há uma busca em andamento nesta instância: aguarda a mesma promessa em
  // vez de abrir outra.
  emVoo ??= buscarToken()
    .then((token) => {
      emCache = token;
      return token;
    })
    .finally(() => {
      emVoo = null;
    });

  return (await emVoo).accessToken;
}

/**
 * Descarta o token guardado.
 *
 * Chamado ao receber 401 numa chamada de API: o token pode ter sido revogado
 * antes de expirar, e insistir com ele repetiria o 401 até o fim da hora.
 */
export function invalidateAccessToken(): void {
  emCache = null;
}

async function buscarToken(): Promise<TokenEmCache> {
  const config = loadValidaPayConfig();

  // Uma retentativa, e SÓ para falha de transporte: pedir token é idempotente
  // — não cria nada e não move dinheiro —, então repetir depois de a rede
  // cair é seguro. É o oposto de POST /v1/charges, que não pode ser repetido
  // às cegas.
  //
  // Erro de protocolo não entra aqui de propósito: credencial recusada não
  // melhora na segunda tentativa, e resposta 200 com corpo malformado
  // tampouco. Repetir os dois só dobraria a latência da falha.
  let resposta: Response;
  try {
    resposta = await transportar(config);
  } catch (erro) {
    if (erro instanceof ValidaPayTimeoutError) throw erro;
    resposta = await transportar(config);
  }

  return interpretar(resposta);
}

/** Só a ida à rede. Separada para que a retentativa não alcance o parsing. */
async function transportar(config: ValidaPayConfig): Promise<Response> {
  // application/x-www-form-urlencoded, não JSON — é o que o endpoint aceita.
  const corpo = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: config.scope,
  });

  try {
    return await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (erro) {
    if (
      erro instanceof Error &&
      (erro.name === "TimeoutError" || erro.name === "AbortError")
    ) {
      throw new ValidaPayTimeoutError("obter access_token", TIMEOUT_MS);
    }
    // Mensagem de rede não carrega segredo, mas também não é útil ao usuário.
    throw new ValidaPayAuthError("falha de rede");
  }
}

async function interpretar(resposta: Response): Promise<TokenEmCache> {
  const recebidoEm = Date.now();

  if (!resposta.ok) {
    // O corpo NÃO entra no erro: resposta de OAuth pode ecoar parte do que foi
    // enviado, e o que foi enviado inclui o client_secret.
    throw new ValidaPayAuthError(`resposta ${resposta.status}`, {
      status: resposta.status,
    });
  }

  const dados = (await resposta.json()) as Partial<RespostaDeToken>;

  if (typeof dados.access_token !== "string" || dados.access_token.length === 0) {
    throw new ValidaPayAuthError("resposta sem access_token");
  }
  if (typeof dados.expires_in !== "number" || dados.expires_in <= 0) {
    throw new ValidaPayAuthError("resposta sem expires_in utilizável");
  }

  // A margem nunca pode passar da própria validade: um token de 30s com margem
  // de 60s nasceria vencido e entraria em laço de renovação.
  const validadeMs = dados.expires_in * 1000;
  const margem = Math.min(MARGEM_DE_RENOVACAO_MS, Math.floor(validadeMs / 2));

  return {
    accessToken: dados.access_token,
    tokenType: dados.token_type ?? "Bearer",
    renovarApos: recebidoEm + validadeMs - margem,
  };
}

/** Só para testes: zera cache e busca em andamento entre casos. */
export function __resetTokenCacheForTests(): void {
  emCache = null;
  emVoo = null;
}
