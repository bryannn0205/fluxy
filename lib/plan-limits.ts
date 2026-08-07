import type { Plan } from "@/lib/generated/prisma/client";
import { ROUTES } from "@/lib/constants";

/**
 * Recursos com teto por plano — a tabela, não as consultas.
 *
 * Fica separada do PlanLimitService pelo mesmo motivo que `lib/permissions.ts`
 * é separada dos services: a definição precisa caber numa tela para poder ser
 * auditada, e as decisões precisam de I/O. Aqui não há query nem regra; só o
 * mapa de "qual coluna guarda o teto de quê".
 *
 * **Limite não é permissão.** Papel decide se você PODE fazer; plano decide se
 * ainda HÁ ESPAÇO. Negação de papel é 403 e a resposta é "peça acesso";
 * negação de plano é 402 e a resposta é "faça upgrade". Ver a ordem de
 * validação documentada em PlanLimitService.
 */
export const PLAN_RESOURCES = {
  users: {
    column: "maxUsers",
    label: "usuários",
  },
  ordersPerMonth: {
    column: "maxOrdersPerMonth",
    label: "pedidos por mês",
  },
  products: {
    column: "maxProducts",
    label: "produtos",
  },
  customers: {
    column: "maxCustomers",
    label: "clientes",
  },
} as const satisfies Record<string, { column: keyof Plan; label: string }>;

export type PlanResource = keyof typeof PLAN_RESOURCES;

/**
 * Para onde mandar quem bateu no teto.
 *
 * Aponta para a tela de plano e cobrança, não para Configurações em geral:
 * quem viu "limite de 5 usuários atingido" precisa cair onde os planos são
 * comparados, não numa página de perfil e dados da empresa. Enquanto essa
 * tela não existia, este caminho levava a um lugar sem nada sobre plano.
 */
export const UPGRADE_PATH = ROUTES.BILLING;

/**
 * Lê o teto do recurso no plano.
 *
 * `null` significa ilimitado — e é o valor com que todos os planos nascem, o
 * que faz a migration de limites não mudar comportamento algum até um passo
 * comercial preenchê-los. **Empresa sem plano vinculado também é ilimitada**:
 * durante o trial não há Plan, e travar quem está avaliando o produto seria o
 * oposto do que o trial existe para fazer.
 */
export function limitFor(plan: Plan | null, resource: PlanResource): number | null {
  if (!plan) return null;
  return plan[PLAN_RESOURCES[resource].column] as number | null;
}

/**
 * Decide se cabe mais um.
 *
 * Recebe o uso PROJETADO, não o atual: quem chama é que sabe se a operação
 * soma um (criar) ou apenas substitui uma reserva por um registro real
 * (aceitar convite). Ver o cálculo em PlanLimitService.assertCanAcceptInvite.
 */
export function fitsWithinLimit(projectedUsage: number, limit: number | null): boolean {
  if (limit === null) return true;
  return projectedUsage <= limit;
}
