import { Reveal } from "@/app/(marketing)/_components/Reveal";

const BENEFICIOS = [
  {
    titulo: "Centralize informações",
    descricao:
      "Clientes, produtos, pedidos e movimentações de estoque no mesmo lugar, com um cadastro só para cada coisa.",
  },
  {
    titulo: "Acompanhe pedidos",
    descricao:
      "Status, prazo e prioridade visíveis a qualquer momento, com o histórico de alterações de cada pedido.",
  },
  {
    titulo: "Organize sua equipe",
    descricao:
      "Convide pessoas e defina o papel de cada uma — inclusive quem pode ou não enxergar valores.",
  },
  {
    titulo: "Controle estoque",
    descricao:
      "Saldo atualizado pela própria operação: a venda dá baixa, o cancelamento devolve, o ajuste fica registrado.",
  },
  {
    titulo: "Visualize produção",
    descricao:
      "Quadro por etapa mostra onde cada pedido está e o que depende de alguém para avançar.",
  },
  {
    titulo: "Tenha histórico",
    descricao:
      "O que mudou, quando e por quem — para consultar depois, sem depender da memória de ninguém.",
  },
];

export function BusinessBenefits() {
  return (
    <section className="relative border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="rounded-3xl border border-border bg-card/50 p-6 sm:p-10 lg:p-14">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Mais clareza para tomar decisões.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Seis frentes que o Fluxy cobre hoje, e que juntas mostram a situação real
                do negócio.
              </p>
            </div>

            {/* Lista ordenada: a numeração é conteúdo, não enfeite — o leitor
                de tela anuncia a posição sem precisar do número desenhado. */}
            <ol className="mt-12 grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {BENEFICIOS.map((beneficio, indice) => (
                <Reveal as="li" key={beneficio.titulo} delay={indice * 50}>
                  <div className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="font-mono text-sm font-semibold text-primary tabular-nums"
                    >
                      {String(indice + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold">{beneficio.titulo}</h3>
                      <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
                        {beneficio.descricao}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
