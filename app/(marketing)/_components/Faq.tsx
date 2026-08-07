import { ChevronDown } from "lucide-react";

import { TRIAL_DURATION_DAYS } from "@/lib/constants";

/**
 * Respostas descrevem o produto como ele está hoje.
 *
 * Sem "sem cartão", "cancele quando quiser", "garantia" ou "reembolso":
 * nenhuma delas está implementada, e prometer na venda o que o sistema não
 * cumpre é dívida que vence no suporte. Onde a cobrança online ainda não
 * existe, a resposta diz isso.
 */
const PERGUNTAS = [
  {
    pergunta: `Como funciona o teste grátis?`,
    resposta: `Ao criar a conta, sua empresa começa com ${TRIAL_DURATION_DAYS} dias de acesso ao Fluxy, com os limites do plano Standard. Não há cobrança durante o teste.`,
  },
  {
    pergunta: "Preciso escolher um plano agora?",
    resposta:
      "Você pode indicar o plano que pretende usar antes de criar a conta, mas isso serve só para orientar seu cadastro. O teste começa igual para todo mundo, com os limites do Standard.",
  },
  {
    pergunta: `O que acontece depois dos ${TRIAL_DURATION_DAYS} dias?`,
    resposta:
      "Ao fim do teste, a criação e a edição de registros ficam bloqueadas até a assinatura ser ativada. Seus dados continuam guardados — nada é apagado.",
  },
  {
    pergunta: "Posso trocar de plano?",
    resposta:
      "Sim. A troca de plano será feita pela tela de plano e cobrança, dentro do Fluxy, quando o pagamento online estiver disponível.",
  },
  {
    pergunta: "Meus dados ficam protegidos?",
    resposta:
      "Cada empresa tem ambiente isolado: toda consulta é filtrada pela empresa da sessão autenticada, e nenhum usuário alcança dados de outra. Dentro da empresa, o papel de cada pessoa define o que ela vê — incluindo se enxerga valores financeiros.",
  },
  {
    pergunta: "O Fluxy funciona em celular?",
    resposta:
      "Sim. As telas se adaptam a celular, tablet e computador, pelo navegador, sem instalar aplicativo.",
  },
] as const;

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 border-b border-border bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Dúvidas frequentes
        </h2>

        {/* <details>/<summary> nativos: abrem sem JavaScript, respondem a
            teclado e são anunciados como "expansível" por leitores de tela,
            sem uma linha de ARIA nem biblioteca de acordeão. */}
        <div className="mt-8 divide-y divide-border border-y border-border">
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
      </div>
    </section>
  );
}
