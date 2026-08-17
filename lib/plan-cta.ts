import { planHasTrial, type BillingInterval } from "@/lib/constants";
import { buildRegisterUrl, buildSubscribeUrl, parsePlanIntent } from "@/lib/plan-intent";
import type { PublicPlan } from "@/types/plans";

/**
 * O que o botão de um plano faz na vitrine.
 *
 * **Existe para haver uma regra só.** A landing e `/plans` mostram o mesmo
 * catálogo e precisam prometer a mesma coisa; quando cada uma decidia por
 * conta, uma delas passou a oferecer cadastro para um plano que o cadastro não
 * entrega. Duas cópias divergem — aqui a decisão mora num lugar, e há teste
 * afirmando que as duas telas chegam ao mesmo resultado.
 *
 * A decisão sai de dado real, nunca de slug escrito à mão: `planHasTrial` diz
 * quem tem teste grátis, e `availableForCheckout` — derivado da existência dos
 * dois `priceId` remotos — diz quem pode ser cobrado. Não há
 * `if (slug === "plus")` em lugar nenhum.
 *
 * **Função pura, sem sessão.** Ela não sabe nem pode saber se há usuário
 * autenticado: o destino da contratação é sempre `/contratar`, e é o servidor
 * que decide dali se o visitante passa pelo login. Assim a vitrine continua
 * sendo só vitrine.
 */
export type PlanoCta =
  /** Onboarding gratuito: leva ao cadastro, que cria a empresa em teste. */
  | { tipo: "trial"; href: string; rotulo: string }
  /**
   * Contratação real. Leva ao ponto de entrada público, que encaminha para o
   * login com a intenção preservada ou direto para a tela de pagamento. Em
   * nenhum dos dois casos o plano é concedido pelo caminho.
   */
  | { tipo: "assinar"; href: string; rotulo: string }
  /** Sem teste e sem preço remoto: não há como começar nem cobrar. */
  | { tipo: "indisponivel"; rotulo: string; explicacao: string };

export interface ResolverCtaInput {
  plano: PublicPlan;
  cobranca: BillingInterval;
}

const ROTULO_INDISPONIVEL = "Em breve";
const EXPLICACAO_INDISPONIVEL = "Contratação ainda não disponível para este plano.";

export function resolverCtaDoPlano({ plano, cobranca }: ResolverCtaInput): PlanoCta {
  // Revalidado pela mesma função que a próxima fronteira usará. Um slug que
  // não sobrevive a ela não vira link — e a fronteira valida de novo, sem
  // supor que esta tela já validou.
  const intencao = parsePlanIntent({ plan: plano.slug, billing: cobranca });

  if (intencao === null) {
    return {
      tipo: "indisponivel",
      rotulo: ROTULO_INDISPONIVEL,
      explicacao: EXPLICACAO_INDISPONIVEL,
    };
  }

  if (planHasTrial(plano.slug)) {
    return {
      tipo: "trial",
      href: buildRegisterUrl(intencao),
      rotulo: `Começar com o ${plano.name}`,
    };
  }

  if (!plano.availableForCheckout) {
    return {
      tipo: "indisponivel",
      rotulo: ROTULO_INDISPONIVEL,
      explicacao: EXPLICACAO_INDISPONIVEL,
    };
  }

  return {
    tipo: "assinar",
    href: buildSubscribeUrl(intencao),
    rotulo: `Assinar ${plano.name}`,
  };
}
