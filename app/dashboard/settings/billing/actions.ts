"use server";

import { handleAction } from "@/lib/action-handler";
import { ValidationError } from "@/lib/errors";
import { assertPermission } from "@/lib/permissions";
import { requireCompany } from "@/lib/session";
import { iniciarCheckoutSchema } from "@/schemas/subscription-checkout.schema";
import {
  subscriptionCheckoutService,
  subscriptionReconciliationService,
} from "@/services";
import type { CheckoutResumo } from "@/services/SubscriptionCheckoutService";
import type { ReconcileSummary } from "@/services/SubscriptionReconciliationService";
import type { ActionResult } from "@/types/common";

/**
 * Actions da contratação de plano.
 *
 * Três regras valem para todas, sem exceção:
 *
 * 1. `companyId` vem de `requireCompany()` — **nunca** do cliente. Nenhuma
 *    delas aceita empresa como argumento.
 * 2. Toda consulta por `checkoutId` resolve `checkoutId + companyId`, então um
 *    identificador de outra empresa simplesmente não é encontrado.
 * 3. Nenhuma ativa plano. Quem ativa é o service, e só depois de
 *    `GET /v1/charges/:id` responder `PAID`.
 */

/**
 * Abre (ou reaproveita) a tentativa de contratação e garante a cobrança.
 *
 * Não altera plano nem status da empresa: a tentativa nasce `PENDING`.
 */
export async function iniciarCheckoutAction(
  input: unknown,
): Promise<ActionResult<CheckoutResumo>> {
  const company = await requireCompany();

  return handleAction(async () => {
    assertPermission(company.role, "subscription", "manage");

    const validacao = iniciarCheckoutSchema.safeParse(input);
    if (!validacao.success) {
      throw new ValidationError(validacao.error.flatten().fieldErrors);
    }

    // O service recebe a empresa da sessão inteira; `planId` e periodicidade
    // são o único que veio de fora, e ambos passaram pelo schema.
    return subscriptionCheckoutService.iniciarCheckout(validacao.data, company);
  });
}

/**
 * Estado atual da tentativa, para o polling da tela.
 *
 * A consulta a `GET /v1/charges/:id` acontece AQUI, no servidor — o navegador
 * nunca fala com a ValidaPay e nunca vê credencial. Se a cobrança estiver
 * paga, a ativação ocorre no mesmo caminho autoritativo usado por webhook e
 * reconciliação.
 */
export async function verificarStatusCheckoutAction(
  checkoutId: unknown,
): Promise<ActionResult<CheckoutResumo>> {
  const { companyId, role } = await requireCompany();

  return handleAction(async () => {
    assertPermission(role, "subscription", "view");

    if (typeof checkoutId !== "string" || checkoutId.length === 0) {
      throw new ValidationError({ checkoutId: ["Tentativa inválida"] });
    }

    return subscriptionCheckoutService.consultarParaExibicao(checkoutId, companyId);
  });
}

/**
 * Recuperação após um `POST /v1/charges` que expirou no cliente.
 *
 * Reaproveita a MESMA tentativa e, por consequência, o mesmo `externalId`
 * determinístico — é isso que faz a ValidaPay devolver `409 DUPLICATE_CHARGE`
 * com o `chargeId` original em vez de abrir uma segunda cobrança. Nunca cria
 * `SubscriptionCheckout` novo.
 */
export async function recuperarCheckoutAction(
  checkoutId: unknown,
): Promise<ActionResult<CheckoutResumo>> {
  const { companyId, role } = await requireCompany();

  return handleAction(async () => {
    assertPermission(role, "subscription", "manage");

    if (typeof checkoutId !== "string" || checkoutId.length === 0) {
      throw new ValidationError({ checkoutId: ["Tentativa inválida"] });
    }

    // Escopo ANTES de qualquer chamada externa: um id de outra empresa não
    // pode nem chegar a provocar uma requisição à ValidaPay.
    await subscriptionCheckoutService.exigirTentativaDaEmpresa(checkoutId, companyId);

    return subscriptionCheckoutService.garantirChargeCriado(checkoutId);
  });
}

/**
 * Reconciliação manual das contratações pendentes da própria empresa.
 *
 * Recuperação OPERACIONAL, não caminho normal: existe para o caso de uma
 * tentativa ficar `PENDING` porque o webhook não chegou e o usuário fechou a
 * aba antes de o polling confirmar.
 *
 * **Escopada à empresa da sessão.** O `companyId` vem de `requireCompany()` e
 * nunca da entrada — sem isso, quem chamasse acionaria trabalho sobre dados de
 * outros tenants. Não há papel de administração de plataforma neste produto;
 * os papéis são todos da empresa, e `subscription:manage` é o que responde por
 * contratação.
 *
 * Não recebe parâmetro algum de propósito: não há nada a escolher, e um
 * identificador de entrada seria mais uma superfície para apontar para fora do
 * próprio tenant.
 */
export async function reconciliarContratacoesAction(): Promise<
  ActionResult<ReconcileSummary>
> {
  const { companyId, role } = await requireCompany();

  return handleAction(async () => {
    assertPermission(role, "subscription", "manage");

    // Delega inteiramente: nem consulta cobrança, nem ativa nada aqui.
    return subscriptionReconciliationService.reconcilePending({ companyId });
  });
}
