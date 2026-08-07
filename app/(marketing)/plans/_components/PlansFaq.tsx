import { ChevronDown } from "lucide-react";

import { TRIAL_DURATION_DAYS } from "@/lib/constants";

/**
 * FAQ curto, focado na decisão de plano — não repete o da landing.
 *
 * As respostas descrevem o produto como ele está. Sem "sem cartão", "cancele
 * quando quiser", "garantia" ou "ativação automática": nada disso existe, e
 * prometer na venda o que o sistema não cumpre é dívida que vence no suporte.
 */
const PERGUNTAS = [
  {
    pergunta: "Qual plano vale durante o teste?",
    resposta: `Durante os ${TRIAL_DURATION_DAYS} dias, todas as contas usam os limites do plano Standard, mesmo quem escolheu o Pro. Os limites maiores passam a valer com o pagamento confirmado.`,
  },
  {
    pergunta: "Posso mudar de plano depois?",
    resposta:
      "Sim. A troca será feita pela tela de plano e cobrança, dentro do Fluxy, quando o pagamento online estiver disponível.",
  },
  {
    pergunta: "Qual a diferença entre mensal e anual?",
    resposta:
      "O anual é cobrado de uma vez e custa menos que doze meses avulsos. Os limites e os módulos são os mesmos nas duas periodicidades.",
  },
  {
    pergunta: "O que acontece se eu passar de um limite?",
    resposta:
      "A criação de novos registros do tipo que atingiu o teto fica bloqueada, e o Fluxy indica qual limite foi alcançado. Nada é apagado, e o restante do sistema continua funcionando.",
  },
] as const;

export function PlansFaq() {
  return (
    <section className="mx-auto mt-16 max-w-3xl">
      <h2 className="text-2xl font-bold tracking-tight">Dúvidas sobre os planos</h2>

      {/* <details>/<summary> nativos: abrem sem JavaScript, respondem a
          teclado e são anunciados como expansíveis, sem ARIA nem biblioteca. */}
      <div className="mt-6 divide-y divide-border border-y border-border">
        {PERGUNTAS.map((item) => (
          <details key={item.pergunta} className="group py-4">
            <summary className="flex cursor-pointer items-center justify-between gap-4 rounded-md text-base font-medium marker:content-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {item.pergunta}
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="mt-3 text-sm text-pretty text-muted-foreground">
              {item.resposta}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
