import { DashboardMockup } from "@/app/(marketing)/_components/DashboardMockup";
import { Reveal } from "@/app/(marketing)/_components/Reveal";

const MODULOS = [
  {
    titulo: "Do pedido ao recebimento",
    descricao:
      "O pedido nasce numerado, entra na produção, baixa o estoque e gera o que há para receber — sem ninguém repetir o lançamento em outro lugar.",
  },
  {
    titulo: "Cadastros que se conversam",
    descricao:
      "Clientes e produtos alimentam o pedido; o pedido devolve histórico para os dois. Preço, custo e margem ficam onde a decisão acontece.",
  },
];

export function ProductShowcase() {
  return (
    <section className="relative border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card/60 p-6 sm:p-10 lg:p-14">
            {/* Luz interna do cartão: canto superior direito, atrás da peça de
                interface, para dar profundidade sem lavar o texto da esquerda. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-[-30%] right-[-10%] size-[34rem] opacity-[0.18] [background:radial-gradient(50%_50%_at_50%_50%,var(--mkt-glow)_0%,transparent_70%)]"
            />

            <div className="relative grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                  Toda a sua operação, conectada.
                </h2>
                <p className="mt-4 text-muted-foreground">
                  O Fluxy reúne pedidos, clientes, produtos, estoque e produção numa base
                  só. Cada módulo enxerga o que o outro registrou, e a informação deixa de
                  viver espalhada em planilhas paralelas.
                </p>

                <dl className="mt-8 space-y-6">
                  {MODULOS.map((modulo) => (
                    <div
                      key={modulo.titulo}
                      className="border-l-2 border-primary/40 pl-4"
                    >
                      <dt className="text-sm font-semibold">{modulo.titulo}</dt>
                      <dd className="mt-1.5 text-sm text-pretty text-muted-foreground">
                        {modulo.descricao}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* `lg:-mr-6` deixa a peça sangrar levemente para fora do cartão
                  no desktop — o mesmo recurso da referência para dar a ideia de
                  janela para dentro do produto. Só a partir de lg, porque no
                  celular sangrar significaria rolagem horizontal. */}
              <div className="lg:-mr-6">
                <DashboardMockup />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
