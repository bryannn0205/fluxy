"use server";

import { handleAction } from "@/lib/action-handler";
import { assertPermission } from "@/lib/permissions";
import { requireCompany } from "@/lib/session";
import { subscriptionReconciliationService } from "@/services";
import type { ReconcileSummary } from "@/services/SubscriptionReconciliationService";
import type { ActionResult } from "@/types/common";

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
