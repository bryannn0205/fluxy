"use server";

import { handleAction } from "@/lib/action-handler";
import { ValidationError } from "@/lib/errors";
import { assertPermission } from "@/lib/permissions";
import { requireCompany } from "@/lib/session";
import { iniciarCheckoutSchema } from "@/schemas/subscription-checkout.schema";
import {
  subscriptionCheckoutService,
  subscriptionLifecycleService,
  subscriptionReconciliationService,
} from "@/services";
import type { CheckoutResumo } from "@/services/SubscriptionCheckoutService";
import type { RevisaoDeAssinaturasResumo } from "@/services/SubscriptionLifecycleService";
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
 * Abre (ou reaproveita) a tentativa e devolve a URL do checkout hospedado.
 *
 * Não altera plano nem status da empresa: a tentativa nasce `PENDING`. O
 * pagamento acontece inteiramente na ValidaPay — nenhum dado de cartão ou Pix
 * atravessa esta action.
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

    // `planId` e periodicidade são o único que veio de fora, e ambos passaram
    // pelo schema. A empresa vem da sessão; o preço, do banco.
    return subscriptionCheckoutService.iniciarCheckout(validacao.data, {
      id: company.companyId,
      role: company.role,
    });
  });
}

/**
 * Reconciliação manual das contratações pendentes da própria empresa.
 *
 * Recuperação OPERACIONAL, não caminho normal: existe para o caso de uma
 * tentativa ficar `PENDING` porque o webhook não chegou.
 *
 * **Escopada à empresa da sessão.** O `companyId` vem de `requireCompany()` e
 * nunca da entrada — sem isso, quem chamasse acionaria trabalho sobre dados de
 * outros tenants. Não recebe parâmetro algum de propósito.
 */
export async function reconciliarContratacoesAction(): Promise<
  ActionResult<ReconcileSummary & { assinaturas: RevisaoDeAssinaturasResumo }>
> {
  const { companyId, role } = await requireCompany();

  return handleAction(async () => {
    assertPermission(role, "subscription", "manage");

    // Duas passadas, dois serviços, nenhuma regra aqui.
    //
    // A primeira recupera contratações sem desfecho; a segunda revisa
    // assinaturas já ativas contra a ValidaPay — é ela que efetiva um
    // cancelamento agendado, porque nenhum webhook avisa quando a data chega.
    // Sequenciais de propósito: as duas consultam o mesmo gateway, e paralelizar
    // só dobraria a pressão sobre ele.
    const contratacoes = await subscriptionReconciliationService.reconcilePending({
      companyId,
    });
    const assinaturas =
      await subscriptionLifecycleService.revisarAssinaturasDaEmpresa(companyId);

    return { ...contratacoes, assinaturas };
  });
}
