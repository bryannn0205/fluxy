import { env } from "@/lib/env";
import { ValidaPayConfigError } from "@/lib/validapay/errors";

export type ValidaPayEnvironment = "sandbox" | "production";

/**
 * Hosts da ValidaPay — constantes, **não variáveis de ambiente**.
 *
 * São quatro URLs, e o host de OAuth é separado do host da API. Deixá-las
 * como texto livre no ambiente daria quatro chances de apontar credencial de
 * produção para o host de sandbox; o erro só apareceria quando uma cobrança
 * real não fosse feita. Derivando de um único `VALIDAPAY_ENV`, a escolha é
 * uma palavra e não há como misturar metade de cada ambiente.
 *
 * Ver docs.validapay.com.br/comece-aqui/introducao e /post-autenticacao.
 */
const HOSTS: Record<
  ValidaPayEnvironment,
  { readonly api: string; readonly oauth: string }
> = {
  sandbox: {
    api: "https://sandbox.validapay.com.br",
    oauth: "https://oauth2-sandbox.validapay.com.br",
  },
  production: {
    api: "https://api.validapay.com.br",
    oauth: "https://oauth2.validapay.com.br",
  },
};

const CAMINHO_DO_TOKEN = "/auth/token";

export interface ValidaPayConfig {
  readonly environment: ValidaPayEnvironment;
  readonly apiBaseUrl: string;
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scope: string;
}

/**
 * Monta a configuração, ou explica exatamente o que falta.
 *
 * **Preguiçosa de propósito.** As variáveis são opcionais em `lib/env.ts`, como
 * as do R2 e do Asaas: a aplicação sobe sem elas e só o pagamento fica
 * indisponível. Validar na carga do módulo derrubaria o produto inteiro por
 * causa de uma integração que a maioria das telas não usa.
 *
 * @throws {ValidaPayConfigError} com os NOMES das variáveis ausentes
 */
export function loadValidaPayConfig(): ValidaPayConfig {
  const ausentes: string[] = [];

  const clientId = env.VALIDAPAY_CLIENT_ID?.trim();
  const clientSecret = env.VALIDAPAY_CLIENT_SECRET?.trim();
  const scope = env.VALIDAPAY_SCOPE?.trim();

  if (!clientId) ausentes.push("VALIDAPAY_CLIENT_ID");
  if (!clientSecret) ausentes.push("VALIDAPAY_CLIENT_SECRET");
  if (!scope) ausentes.push("VALIDAPAY_SCOPE");

  if (ausentes.length > 0) {
    throw new ValidaPayConfigError(ausentes);
  }

  const environment = env.VALIDAPAY_ENV;
  const hosts = HOSTS[environment];

  return {
    environment,
    apiBaseUrl: hosts.api,
    tokenUrl: `${hosts.oauth}${CAMINHO_DO_TOKEN}`,
    // Non-null seguro: as três foram verificadas acima e a função já teria
    // lançado. O compilador não acompanha o array de ausentes.
    clientId: clientId!,
    clientSecret: clientSecret!,
    scope: scope!,
  };
}

/** Para telas e diagnósticos: a integração está utilizável? */
export function isValidaPayConfigured(): boolean {
  return Boolean(
    env.VALIDAPAY_CLIENT_ID?.trim() &&
    env.VALIDAPAY_CLIENT_SECRET?.trim() &&
    env.VALIDAPAY_SCOPE?.trim(),
  );
}
