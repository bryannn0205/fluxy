import { validaPayRequest } from "@/lib/validapay/client";

/**
 * Leitura de assinatura — `GET /v1/subscriptions/:subscriptionId`.
 *
 * **É a fonte oficial do ciclo de vida.** Serve a dois propósitos: reencontrar a
 * tentativa local pela `metadata` quando um evento chega sem `chargeId`, e dizer
 * se a assinatura foi cancelada — que é a única prova aceita para retirar
 * benefício de uma empresa.
 *
 * **Somente leitura.** Não existe rota de cancelamento documentada na API, e
 * este módulo não inventa nenhuma.
 */

export interface SubscriptionSnapshot {
  readonly subscriptionId: string;
  /**
   * `status` cru da API. Observado: `"ACTIVE"`.
   *
   * **Não use isto para detectar cancelamento.** Uma assinatura cancelada ao
   * fim do período continua respondendo `"ACTIVE"` — foi medido em sandbox. O
   * valor que `status` assume depois da data efetiva não está documentado nem
   * foi observado, então nada neste código depende de adivinhá-lo.
   */
  readonly status: string;
  /**
   * O cancelamento foi solicitado e vale ao fim do período pago?
   *
   * Vem de `cancelAtPeriodEnd`, campo que **só aparece na resposta quando existe
   * cancelamento**. Confirmado por contraste: a assinatura cancelada trazia
   * `cancelAtPeriodEnd: true`, `cancelRequestedAt` e `cancelReason`; a de
   * controle, ativa, não trazia nenhum dos três.
   */
  readonly cancelamentoAgendado: boolean;
  /**
   * Quando o cancelamento passa a valer — e `null` quando não há cancelamento.
   *
   * **Preenchido SOMENTE se `cancelamentoAgendado` for verdadeiro.** O campo
   * `cancellation.effectiveAt` existe em toda assinatura, cancelada ou não, e
   * vale a data do próximo ciclo: lê-lo sem essa condição transformaria
   * qualquer assinatura saudável num cancelamento agendado para a data da
   * próxima cobrança. Foi exatamente o falso positivo que a medição em sandbox
   * revelou, e a guarda vive aqui para que nenhum chamador possa repeti-lo.
   */
  readonly cancelamentoEfetivoEm: Date | null;
  /** `cancellation.immediate`. Só significa algo com cancelamento agendado. */
  readonly cancelamentoImediato: boolean;
  /**
   * O ciclo corrente da assinatura consta como pago?
   *
   * Sai de `billingCycles`, casando `cycleNumber` com `currentCycleNumber`, e é
   * **verdadeiro só quando o status daquele ciclo é exatamente `"PAID"`** —
   * valor observado em sandbox. Ficou como comparação POSITIVA de propósito: a
   * string de um ciclo que falhou não foi observada nem documentada, e inferir
   * "não pago" por exclusão seria adivinhar. Assim, um status desconhecido
   * resulta em `false`, que é o lado seguro: não devolve acesso a quem talvez
   * não tenha pagado.
   */
  readonly cicloAtualPago: boolean;
  /**
   * Metadata devolvida pela API — a única fonte confiável dela, já que o
   * payload do webhook é dado externo e pode não trazê-la.
   */
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ValidaPaySubscriptionsGateway {
  getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot>;
}

interface RespostaDeAssinatura {
  subscriptionId?: unknown;
  status?: unknown;
  cancelAtPeriodEnd?: unknown;
  cancellation?: unknown;
  currentCycleNumber?: unknown;
  billingCycles?: unknown;
  metadata?: unknown;
}

const STATUS_DE_CICLO_PAGO = "PAID";

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

/** Texto ISO → `Date`, ou `null` para qualquer coisa que não seja data válida. */
function data(valor: unknown): Date | null {
  if (typeof valor !== "string" || valor.length === 0) return null;

  const convertida = new Date(valor);
  return Number.isNaN(convertida.getTime()) ? null : convertida;
}

async function getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
  const resposta = await validaPayRequest<RespostaDeAssinatura>({
    path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
  });

  // `=== true` e não coerção: um `"false"` ou um `1` vindos de fora não podem
  // virar cancelamento por acidente de tipagem.
  const cancelamentoAgendado = resposta.cancelAtPeriodEnd === true;
  const cancelamento = objeto(resposta.cancellation);

  return {
    subscriptionId:
      typeof resposta.subscriptionId === "string" && resposta.subscriptionId.length > 0
        ? resposta.subscriptionId
        : subscriptionId,
    status: typeof resposta.status === "string" ? resposta.status : "",
    cancelamentoAgendado,
    cancelamentoEfetivoEm: cancelamentoAgendado ? data(cancelamento?.effectiveAt) : null,
    cancelamentoImediato: cancelamentoAgendado && cancelamento?.immediate === true,
    cicloAtualPago: cicloCorrentePago(resposta),
    metadata: objeto(resposta.metadata) ?? {},
  };
}

/**
 * O ciclo apontado por `currentCycleNumber` consta como `"PAID"`?
 *
 * O status vem aninhado (`billingCycles[n].cycle.status`) na resposta observada;
 * o `?? ciclo.status` cobre a forma plana sem depender de qual delas a API
 * escolher devolver.
 */
function cicloCorrentePago(resposta: RespostaDeAssinatura): boolean {
  const numeroAtual = resposta.currentCycleNumber;
  if (typeof numeroAtual !== "number") return false;

  const ciclos = Array.isArray(resposta.billingCycles) ? resposta.billingCycles : [];

  for (const bruto of ciclos) {
    const ciclo = objeto(bruto);
    if (ciclo?.cycleNumber !== numeroAtual) continue;

    const interno = objeto(ciclo.cycle);
    return (interno?.status ?? ciclo.status) === STATUS_DE_CICLO_PAGO;
  }

  return false;
}

export const validaPaySubscriptions: ValidaPaySubscriptionsGateway = { getSubscription };
