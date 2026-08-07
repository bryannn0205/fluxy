import { EXPIRED_SESSION_PARAM, EXPIRED_SESSION_VALUE, ROUTES } from "@/lib/constants";

/**
 * Rotas que respondem sem sessão.
 *
 * `/` e `/plans` **não estão aqui de propósito** — e não por esquecimento.
 * A regra "rota pública + sessão válida → dashboard" existe para tirar quem
 * já entrou das telas de acesso; aplicá-la à landing ou à página de planos
 * impediria um usuário autenticado de abri-las, que é justamente o oposto do
 * que se quer. Elas ficam públicas por ausência: o matcher do middleware não
 * as inclui, então nenhuma decisão é tomada sobre elas.
 */
const ROTAS_DE_ACESSO = [
  ROUTES.LOGIN,
  ROUTES.REGISTER,
  ROUTES.FORGOT_PASSWORD,
  "/reset-password",
  "/verify-email",
  ROUTES.ACCEPT_INVITE,
] as const;

export type NavigationDecision =
  | { readonly tipo: "seguir" }
  | { readonly tipo: "redirecionar"; readonly destino: string };

export interface NavigationInput {
  readonly pathname: string;
  readonly isLoggedIn: boolean;
  /** `?session=expired`, posto por requireCompany ao detectar sessão órfã. */
  readonly hasExpiredSessionMark: boolean;
}

/**
 * Decide se a requisição segue ou é redirecionada. **Função pura.**
 *
 * Extraída do middleware para poder ser lida e testada de uma vez: regra de
 * roteamento espalhada em `if` dentro de um handler de Edge é regra que
 * ninguém audita. Aqui as quatro combinações cabem numa tela.
 *
 * **Estado da assinatura não é entrada, deliberadamente.** Duas razões, e a
 * segunda é a que importa: o middleware roda no Edge e não alcança o banco,
 * então não teria como saber; e mesmo que soubesse, "trial vencido" não é
 * questão de rota — é o `SubscriptionGateService` que barra a escrita, no
 * service, onde a decisão é atômica com a operação. Rotear por assinatura
 * criaria uma segunda fonte de verdade que dessincroniza da primeira.
 *
 * A consequência é desejada e testada: **nenhuma regra aqui manda alguém para
 * `/plans`**. Trial válido, trial vencido ou PAST_DUE navegam igual; quem quer
 * ver planos abre a página, quem não quer nunca é empurrado para ela.
 *
 * Também não conhece intenção comercial. Interpretar `plan=pro` é papel de
 * `lib/plan-intent.ts`, e as duas coisas continuam testáveis em separado.
 */
export function decideNavigation(input: NavigationInput): NavigationDecision {
  const ehRotaDoPainel = input.pathname.startsWith(ROUTES.DASHBOARD);

  if (ehRotaDoPainel && !input.isLoggedIn) {
    const parametros = new URLSearchParams({ callbackUrl: input.pathname });
    return { tipo: "redirecionar", destino: `${ROUTES.LOGIN}?${parametros}` };
  }

  const ehRotaDeAcesso = ROTAS_DE_ACESSO.some((rota) => input.pathname.startsWith(rota));

  // A marca de sessão expirada quebra o laço: o JWT ainda existe, então
  // `isLoggedIn` é true, mas o usuário por trás dele não. Sem esta exceção o
  // middleware devolveria a pessoa ao painel, que a mandaria de volta ao
  // login, indefinidamente. Ver lib/session.ts.
  if (ehRotaDeAcesso && input.isLoggedIn && !input.hasExpiredSessionMark) {
    return { tipo: "redirecionar", destino: ROUTES.DASHBOARD };
  }

  return { tipo: "seguir" };
}

/** Lê a marca de sessão expirada de um conjunto de parâmetros. */
export function temMarcaDeSessaoExpirada(parametros: URLSearchParams): boolean {
  return parametros.get(EXPIRED_SESSION_PARAM) === EXPIRED_SESSION_VALUE;
}
