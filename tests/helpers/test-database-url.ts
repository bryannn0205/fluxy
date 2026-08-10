/**
 * Resolução ÚNICA e validada do banco de testes.
 *
 * Usada em dois lugares, de propósito:
 *
 *   1. `vitest.config.ts` — avaliada ao carregar o config, antes de qualquer
 *      teste rodar. Se o alvo estiver errado, a suíte inteira aborta.
 *   2. `tests/helpers/prisma.ts` — revalida na hora de criar o client.
 *
 * Duas guardas em vez de uma porque a primeira depende do config ser carregado
 * como esperado; a segunda vale mesmo que alguém invoque o helper por outro
 * caminho.
 *
 * Contexto: enquanto os testes usavam `DATABASE_URL`, uma execução de
 * `npm test` gravou em `fluxy_dev` — 28 linhas em `VerificationToken` e o
 * `updatedAt` de um `Plan`. Depois de isolar o helper, uma segunda execução
 * ainda escreveu 28 linhas, porque o código de aplicação exercitado pelos
 * testes usa o singleton de `lib/db.ts`, que lê `DATABASE_URL`. Por isso o
 * ambiente de teste passa a apontar AMBAS as variáveis para `fluxy_test`.
 */

/** Bancos que a suíte jamais pode tocar. */
export const BANCOS_PROIBIDOS = new Set([
  "fluxy_dev",
  "fluxy_shadow",
  "gestao_pedidos",
  "postgres",
]);

export const BANCO_ESPERADO = "fluxy_test";
export const HOSTS_PERMITIDOS = new Set(["localhost", "127.0.0.1"]);
export const PORTA_PERMITIDA = 5432;

export interface AlvoDeTeste {
  /** URL completa, com credencial. Nunca deve ser impressa. */
  readonly url: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
}

/** Só host/porta/database — nunca usuário, senha ou URL completa. */
export function alvoSeguro(u: URL): string {
  return `${u.hostname}:${u.port || "(padrão)"}/${decodeURIComponent(u.pathname.replace(/^\//, ""))}`;
}

/**
 * Só o que a resolução realmente consome.
 *
 * Deliberadamente mais estreito que `NodeJS.ProcessEnv`: declarar apenas
 * `TEST_DATABASE_URL` deixa explícito no tipo que `DATABASE_URL` não é lida
 * aqui, e permite testar com objetos literais sem `as`.
 */
export interface EnvDeTeste {
  readonly TEST_DATABASE_URL?: string | undefined;
  // O índice existe para desativar a "weak type detection" do TypeScript: sem
  // ele, um objeto que não declare TEST_DATABASE_URL — inclusive `process.env`,
  // cuja tipagem do projeto não a conhece — seria recusado por não ter
  // propriedade em comum, justamente o caso que os testes precisam exercitar.
  readonly [outra: string]: string | undefined;
}

/**
 * Valida `TEST_DATABASE_URL` e devolve o alvo.
 *
 * `DATABASE_URL` NÃO é lida aqui em hipótese alguma, nem como alternativa.
 * Recebe o ambiente por parâmetro para ser testável sem mexer em
 * `process.env` global.
 */
export function resolveTestDatabaseUrl(env: EnvDeTeste = process.env): AlvoDeTeste {
  const connectionString = env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_URL não definida. Os testes exigem um banco próprio " +
        `("${BANCO_ESPERADO}"); DATABASE_URL NÃO é usada como alternativa.`,
    );
  }

  let u: URL;
  try {
    u = new URL(connectionString);
  } catch {
    throw new Error("TEST_DATABASE_URL não é uma URL válida.");
  }

  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));

  if (BANCOS_PROIBIDOS.has(database)) {
    throw new Error(
      `TEST_DATABASE_URL aponta para "${database}", proibido para testes. ` +
        `Use "${BANCO_ESPERADO}". Alvo recebido: ${alvoSeguro(u)}`,
    );
  }
  if (database !== BANCO_ESPERADO) {
    throw new Error(
      `TEST_DATABASE_URL deve apontar para "${BANCO_ESPERADO}". Alvo recebido: ${alvoSeguro(u)}`,
    );
  }
  if (!HOSTS_PERMITIDOS.has(u.hostname)) {
    throw new Error(
      `TEST_DATABASE_URL deve usar host local. Alvo recebido: ${alvoSeguro(u)}`,
    );
  }
  if (Number(u.port || PORTA_PERMITIDA) !== PORTA_PERMITIDA) {
    throw new Error(
      `TEST_DATABASE_URL deve usar a porta ${PORTA_PERMITIDA}. Alvo recebido: ${alvoSeguro(u)}`,
    );
  }

  return {
    url: connectionString,
    host: u.hostname,
    port: Number(u.port || PORTA_PERMITIDA),
    database,
  };
}
