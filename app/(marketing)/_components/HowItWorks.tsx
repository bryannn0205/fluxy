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
      className="scroll-mt-16 border-b border-border bg-background"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Como funciona
          </h2>
          <p className="mt-3 text-muted-foreground">
            Três passos do cadastro ao recebimento.
          </p>
        </div>

        {/* Lista ordenada de verdade: a ordem é a informação, e o leitor de
            tela anuncia "1 de 3" sem precisar de ARIA. */}
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {PASSOS.map((passo, indice) => (
            <li
              key={passo.titulo}
              className="relative rounded-xl border border-border bg-card p-6"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-semibold text-primary tabular-nums"
              >
                {indice + 1}
              </span>
              <h3 className="mt-4 text-base font-semibold">{passo.titulo}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{passo.descricao}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
