"use client";

import { useEffect, useRef, useState } from "react";

import { verificarStatusCheckoutAction } from "@/app/dashboard/settings/billing/actions";
import type { EstadoDoCheckout } from "@/app/dashboard/settings/billing/checkout/_components/estado";

/**
 * Intervalos entre consultas, em milissegundos.
 *
 * Progressivo porque a maior parte dos pagamentos Pix acontece nos primeiros
 * segundos: consultar rápido no começo dá resposta imediata a quem já pagou,
 * e espaçar depois evita bater no servidor a cada dois segundos por dez
 * minutos enquanto a aba fica aberta e esquecida. O último valor se repete
 * indefinidamente.
 */
const INTERVALOS_MS = [2000, 3000, 5000, 8000, 10_000] as const;

interface CheckoutStatusPollerProps {
  checkoutId: string;
  /** Só consulta enquanto o estado for de espera. */
  ativo: boolean;
  onEstado: (estado: EstadoDoCheckout) => void;
}

/**
 * Consulta o estado da tentativa enquanto a tela estiver aberta.
 *
 * **É conveniência de UX, não garantia.** Morre quando o usuário fecha a aba;
 * quem garante a ativação no servidor é o webhook e, para o que escapar, a
 * reconciliação. Nada aqui decide pagamento: a action responde com o estado
 * que o servidor apurou consultando a ValidaPay.
 *
 * Não renderiza nada — é um efeito com forma de componente, o que mantém o
 * ciclo de vida amarrado ao da tela de pagamento.
 */
export function CheckoutStatusPoller({
  checkoutId,
  ativo,
  onEstado,
}: CheckoutStatusPollerProps) {
  const [tentativa, setTentativa] = useState(0);

  // Ref para o callback: incluí-lo nas dependências do efeito reiniciaria o
  // agendamento a cada render do pai, e uma função nova por render é o caso
  // normal — o resultado seria um timer recriado sem parar.
  const aoEstado = useRef(onEstado);
  aoEstado.current = onEstado;

  useEffect(() => {
    if (!ativo) return;

    // Guarda contra corrida: um efeito já limpo não pode entregar resultado
    // nem agendar o próximo. Sem isso, uma resposta em trânsito no momento da
    // desmontagem chamaria `setState` de um componente que não existe mais.
    let cancelado = false;

    const atraso = INTERVALOS_MS[Math.min(tentativa, INTERVALOS_MS.length - 1)]!;

    const timer = setTimeout(async () => {
      const resultado = await verificarStatusCheckoutAction(checkoutId);
      if (cancelado) return;

      if (resultado.data) {
        aoEstado.current(paraEstado(resultado.data.status));
      }

      // Reagenda mesmo em erro: falha transitória de rede não pode encerrar o
      // acompanhamento — e NUNCA cria checkout novo, só volta a consultar o
      // mesmo id.
      setTentativa((anterior) => anterior + 1);
    }, atraso);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
    // `tentativa` no array é o que encadeia as consultas: cada resposta
    // incrementa, o efeito roda de novo e agenda a seguinte com o atraso
    // maior. Um único timer vivo por vez, por construção.
  }, [checkoutId, ativo, tentativa]);

  return null;
}

function paraEstado(status: string): EstadoDoCheckout {
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "FAILED") return "FAILED";
  return "PENDING";
}
