/**
 * Estados da tela de contratação.
 *
 * Explícitos e distintos porque a UX de cada um é diferente — e três deles são
 * facilmente confundidos: "ainda criando a cobrança", "criação incerta por
 * timeout" e "falhou de vez" levariam o usuário a ações opostas se
 * aparecessem com a mesma cara.
 */
export type EstadoDoCheckout =
  /** Nada iniciado. */
  | "IDLE"
  /** `POST /v1/charges` em andamento. */
  | "INICIANDO"
  /** Cobrança criada, aguardando pagamento. */
  | "PENDING"
  /**
   * A criação expirou no cliente. **Não é falha**: a cobrança pode existir do
   * outro lado, e a saída é reaproveitar a mesma tentativa — nunca abrir outra.
   */
  | "TIMEOUT_RECOVERABLE"
  /** Pagamento confirmado pela consulta autoritativa. */
  | "COMPLETED"
  /** Falha definitiva desta tentativa. */
  | "FAILED"
  /** O plano não tem preço cadastrado na ValidaPay. */
  | "PLAN_UNAVAILABLE";

/** Estados em que ainda faz sentido consultar o servidor. */
export function aguardandoPagamento(estado: EstadoDoCheckout): boolean {
  return estado === "PENDING";
}
