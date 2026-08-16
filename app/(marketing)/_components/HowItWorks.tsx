import { Reveal } from "@/app/(marketing)/_components/Reveal";

const PASSOS = [
  {
    titulo: "Cadastre clientes e produtos",
    descricao: "Traga quem já compra e o que você vende, com preço, custo e unidade.",
  },
  {
    titulo: "Crie e acompanhe pedidos",
    descricao: "Cada pedido nasce numerado e caminha pelos status até a entrega.",
  },
  {
    titulo: "Controle produção, estoque e recebimentos",
    descricao:
      "O estoque baixa sozinho, a produção anda no quadro e o pagamento entra no pedido.",
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="relative scroll-mt-20 border-t border-border/60"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Como funciona
          </h2>
          <p className="mt-4 text-muted-foreground">
            Três passos do cadastro ao recebimento.
          </p>
        </Reveal>

        {/* Lista ordenada de verdade: a ordem é a informação, e o leitor de
            tela anuncia "1 de 3" sem precisar de ARIA. */}
        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {PASSOS.map((passo, indice) => (
            <Reveal as="li" key={passo.titulo} delay={indice * 80}>
              <div className="h-full rounded-2xl border border-border bg-card/60 p-7 transition-colors duration-200 hover:border-primary/35">
                <span
                  aria-hidden="true"
                  className="inline-flex size-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 font-mono text-sm font-semibold text-[var(--mkt-lavender)] tabular-nums"
                >
                  {String(indice + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-5 text-base font-semibold">{passo.titulo}</h3>
                <p className="mt-2 text-sm text-pretty text-muted-foreground">
                  {passo.descricao}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
