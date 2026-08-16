import { Plus } from "lucide-react";

import { TRIAL_DURATION_DAYS } from "@/lib/constants";
import { Reveal } from "@/app/(marketing)/_components/Reveal";

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
    pergunta: "O que é o Fluxy?",
    resposta:
      "Uma plataforma de gestão para pequenas e médias empresas. Reúne pedidos, clientes, produtos, estoque, produção e contas a receber num lugar só, com os módulos conversando entre si.",
  },
  {
    pergunta: "Preciso instalar alguma coisa?",
    resposta:
      "Não. O Fluxy roda pelo navegador. Basta criar a conta e acessar — não há programa para instalar nem servidor para configurar.",
  },
  {
    pergunta: "Posso usar pelo celular?",
    resposta:
      "Sim. As telas se adaptam a celular, tablet e computador, pelo navegador, sem instalar aplicativo.",
  },
  {
    pergunta: "Posso adicionar minha equipe?",
    resposta:
      "Sim. Você convida pessoas por e-mail e define o papel de cada uma. São seis papéis, e eles determinam quem cria pedidos, quem enxerga valores financeiros e quem administra a conta. O número de usuários depende do limite do seu plano.",
  },
  {
    pergunta: "Como funciona o período grátis?",
    resposta: `Ao criar a conta, sua empresa começa com ${TRIAL_DURATION_DAYS} dias de acesso ao Fluxy, com os limites do plano Standard. Não há cobrança durante o teste.`,
  },
  {
    pergunta: "O que acontece quando o teste termina?",
    resposta:
      "A criação e a edição de registros ficam bloqueadas até a assinatura ser ativada. Seus dados continuam guardados — nada é apagado, e a consulta ao que já existe segue disponível.",
  },
] as const;

export function Faq() {
  return (
    <section id="faq" className="relative scroll-mt-20 border-t border-border/60">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Perguntas frequentes
          </h2>
        </Reveal>

        {/* <details>/<summary> nativos: abrem sem JavaScript, respondem a
            teclado e são anunciados como "expansível" por leitores de tela,
            sem uma linha de ARIA nem biblioteca de acordeão. */}
        <div className="mt-12 space-y-3">
          {PERGUNTAS.map((item, indice) => (
            <Reveal key={item.pergunta} delay={indice * 50}>
              <details className="group rounded-2xl border border-border bg-card/60 px-5 transition-colors duration-200 open:border-primary/35 hover:border-primary/35">
                {/* `list-none` some com o marcador na maioria dos navegadores;
                    o pseudoelemento do WebKit precisa ser escondido à parte,
                    senão o Safari mantém o triângulo ao lado do ícone. */}
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium marker:content-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  {item.pergunta}
                  <Plus
                    className="size-4 shrink-0 text-[var(--mkt-lavender)] transition-transform duration-200 group-open:rotate-45"
                    aria-hidden="true"
                  />
                </summary>
                <p className="pb-5 text-sm text-pretty text-muted-foreground">
                  {item.resposta}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
