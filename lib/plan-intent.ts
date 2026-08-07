import {
  BILLING_INTERVALS,
  DEFAULT_PLAN_SLUG,
  PUBLIC_PLAN_SLUGS,
  ROUTES,
  type BillingInterval,
  type PublicPlanSlug,
} from "@/lib/constants";

/**
 * Intenção comercial declarada antes da autenticação.
 *
 * **Isto é navegação, não contrato.** O visitante dizer "quero o Pro" decide
 * qual card vem destacado e para onde o botão leva — nada além. A intenção
 * não altera `Company.planId`, não altera `subscriptionStatus`, não concede
 * limite, não define preço, não cria assinatura nem pagamento. O módulo
 * inteiro não conhece banco, sessão nem service; é a garantia estrutural de
 * que não poderia fazer nada disso mesmo se alguém tentasse.
 *
 * **A intenção é sempre não confiável.** Ela chega pela URL, que é do
 * visitante. Validar aqui não a torna confiável em outro lugar: **toda
 * fronteira de servidor que a receber precisa chamar `parsePlanIntent` de
 * novo**, sem supor que a página anterior já validou. Não há cookie, coluna,
 * `localStorage` nem estado global carregando esse valor — a query string
 * validada a cada salto é a única forma de ele viajar, justamente para que
 * não exista um lugar onde ele pareça já verificado.
 */
export interface PlanIntent {
  plan: PlanIntentSlug;
  billing: BillingInterval;
}

/**
 * Os mesmos slugs vendidos publicamente — reaproveitados, não redeclarados.
 * Um plano só pode ser pretendido se puder ser comprado, e um terceiro plano
 * no futuro deve entrar em um lugar só. Ver PUBLIC_PLAN_SLUGS.
 */
export type PlanIntentSlug = PublicPlanSlug;

export type { BillingInterval };

/**
 * Periodicidade usada quando o plano veio e a cobrança não.
 *
 * Mensal, e não anual, porque é o compromisso MENOR: presumir o anual
 * escolheria pelo visitante a opção de maior desembolso imediato. Não há risco
 * de escalada nesta escolha — periodicidade não concede recurso nenhum, só
 * decide qual preço a tela exibe.
 */
const BILLING_PADRAO: BillingInterval = "monthly";

/**
 * Entrada crua. `unknown` de propósito: `searchParams` do Next entrega
 * `string | string[] | undefined`, e um atacante entrega o que quiser.
 */
export interface PlanIntentInput {
  plan?: unknown;
  billing?: unknown;
}

/**
 * Aceita o valor apenas se for exatamente um dos permitidos.
 *
 * Um único `find` cobre, sem ramo especial para cada caso: array
 * (`typeof` não é `"string"`, o que barra a poluição de parâmetro
 * `?plan=standard&plan=pro` — e barra sem "pegar o primeiro", que é como esse
 * ataque costuma passar), string vazia, espaços em volta, caixa diferente,
 * número, `null` e `undefined`.
 */
function apenasSeConhecido<T extends string>(
  valor: unknown,
  permitidos: readonly T[],
): T | null {
  if (typeof valor !== "string") return null;
  return permitidos.find((permitido) => permitido === valor) ?? null;
}

/**
 * Interpreta a intenção comercial. Função pura: mesma entrada, mesma saída,
 * sem I/O e sem tocar no objeto recebido.
 *
 * Regras, todas testadas:
 *
 * | Entrada                       | Resultado                    |
 * | ----------------------------- | ---------------------------- |
 * | plano válido + cobrança válida | a intenção                   |
 * | plano válido + cobrança ausente | plano + `monthly`           |
 * | plano válido + cobrança inválida | `null`                     |
 * | plano ausente ou inválido      | `null`                      |
 *
 * A distinção entre cobrança **ausente** e **inválida** é deliberada. Ausente
 * é omissão — um link curto como `/register?plan=pro` é legítimo, e o padrão
 * documentado resolve. Inválida significa que alguém escreveu algo que não
 * existe: ou o link está quebrado, ou está sendo adulterado. Nos dois casos,
 * adivinhar seria pior que desistir da intenção — e desistir é seguro, porque
 * o visitante simplesmente segue sem plano pré-selecionado.
 *
 * Nunca há queda silenciosa para `pro`: o plano ou veio válido, ou não há
 * intenção nenhuma.
 */
export function parsePlanIntent(input: PlanIntentInput): PlanIntent | null {
  const plan = apenasSeConhecido(input.plan, PUBLIC_PLAN_SLUGS);
  if (plan === null) return null;

  if (input.billing === undefined) {
    return { plan, billing: BILLING_PADRAO };
  }

  const billing = apenasSeConhecido(input.billing, BILLING_INTERVALS);
  if (billing === null) return null;

  return { plan, billing };
}

/**
 * Monta o caminho com a intenção anexada.
 *
 * **Só destinos internos e fechados.** A base nunca vem de fora — é escolhida
 * pelos exportados abaixo, dentre rotas conhecidas do projeto. Não existe
 * parâmetro `next`, `redirectTo` ou equivalente em lugar nenhum deste módulo:
 * é assim que um open redirect deixa de ser possível, em vez de ser filtrado.
 *
 * Só `plan` e `billing` saem daqui. Preço, `planId`, status, `companyId`,
 * token e dado pessoal não entram porque `PlanIntent` não os tem — não há o
 * que descartar.
 */
function comIntencao(caminho: string, intent: PlanIntent | null): string {
  if (intent === null) return caminho;

  // URLSearchParams codifica os valores. Redundante para os oito pares
  // possíveis, e é essa a intenção: se um dia um valor não validado chegar
  // aqui, ele sai escapado em vez de sair cru na URL.
  const parametros = new URLSearchParams({
    plan: intent.plan,
    billing: intent.billing,
  });

  return `${caminho}?${parametros.toString()}`;
}

/** `/register?plan=standard&billing=monthly` — ou `/register` sem intenção. */
export function buildRegisterUrl(intent: PlanIntent | null): string {
  return comIntencao(ROUTES.REGISTER, intent);
}

/** `/login?plan=pro&billing=yearly` — ou `/login` sem intenção. */
export function buildLoginUrl(intent: PlanIntent | null): string {
  return comIntencao(ROUTES.LOGIN, intent);
}

/**
 * Para onde ir depois de autenticar. **Conjunto fechado: sempre o painel.**
 *
 * Nenhum destino vem do navegador — não há `callbackUrl` nem `next` aqui, e é
 * por isso que redirect aberto não é possível neste caminho.
 *
 * A intenção só sobrevive quando é Pro, e **só como aviso**: o painel lê,
 * revalida e usa para dizer que a cobrança ainda será disponibilizada. Não
 * concede nada — quem decide plano é o banco, e o cadastro grava Standard
 * qualquer que tenha sido a escolha. Standard e "sem intenção" chegam ao
 * painel com a URL limpa, porque não há o que avisar: é o que já acontece.
 *
 * Some quando a ValidaPay existir e o checkout tiver destino próprio.
 */
export function buildPostAuthUrl(intent: PlanIntent | null): string {
  if (intent === null || intent.plan === DEFAULT_PLAN_SLUG) {
    return ROUTES.DASHBOARD;
  }

  return comIntencao(ROUTES.DASHBOARD, intent);
}
