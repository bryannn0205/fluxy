const METRICAS = [
  { rotulo: "Pedidos no mês", valor: "128" },
  { rotulo: "Em produção", valor: "17" },
  { rotulo: "A receber", valor: "R$ 24.380" },
] as const;

const PEDIDOS = [
  { numero: "#0128", cliente: "Padaria Aurora", status: "Em produção", tom: "producao" },
  { numero: "#0127", cliente: "Studio Malta", status: "Pronto", tom: "pronto" },
  { numero: "#0126", cliente: "Casa Verde", status: "Entregue", tom: "entregue" },
  { numero: "#0125", cliente: "Oficina Norte", status: "Recebido", tom: "recebido" },
] as const;

const TONS_DE_STATUS: Record<(typeof PEDIDOS)[number]["tom"], string> = {
  recebido: "bg-amber-400/15 text-amber-300",
  producao: "bg-sky-400/15 text-sky-300",
  pronto: "bg-violet-400/15 text-violet-300",
  entregue: "bg-emerald-400/15 text-emerald-300",
};

/**
 * Composição ilustrativa do painel, em HTML e CSS.
 *
 * Não é captura de tela, nem imagem: some do peso da página e continua nítida
 * em qualquer densidade. Os números são fictícios e existem só para dar forma
 * ao layout — por isso o bloco é `aria-hidden` e traz uma descrição textual ao
 * lado, para quem usa leitor de tela receber a informação em vez de uma pilha
 * de números sem contexto.
 *
 * As cores são fixas, e não tokens do tema: a peça aparece tanto sobre o fundo
 * escuro da landing quanto sobre a seção clara do meio da página, e precisa ser
 * a mesma janela de produto nos dois lugares.
 */
export function DashboardMockup() {
  return (
    <div className="relative">
      <p className="sr-only">
        Ilustração do painel do Fluxy, com indicadores de pedidos do mês, itens em
        produção e valores a receber, além de uma lista de pedidos recentes e seus status.
        Os dados mostrados são fictícios.
      </p>

      <div
        aria-hidden="true"
        className="overflow-hidden rounded-2xl border border-white/12 bg-[oklch(0.17_0.02_288)] shadow-2xl ring-1 shadow-black/50 ring-white/5"
      >
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-2 text-xs text-white/45">Painel</span>
        </div>

        {/* Três colunas já no celular: empilhados, os indicadores esticavam a
            peça por quase 300px de altura e empurravam a lista de pedidos —
            a parte que de fato mostra o produto — para fora da primeira tela. */}
        <div className="grid grid-cols-3 gap-2 p-3 sm:gap-3 sm:p-4">
          {METRICAS.map((metrica) => (
            <div
              key={metrica.rotulo}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-3.5"
            >
              <p className="text-[11px] leading-tight tracking-wide text-white/50 uppercase">
                {metrica.rotulo}
              </p>
              <p className="mt-1.5 font-mono text-sm text-white tabular-nums sm:text-xl">
                {metrica.valor}
              </p>
            </div>
          ))}
        </div>

        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03]">
            <p className="border-b border-white/10 px-4 py-2.5 text-[11px] tracking-wide text-white/50 uppercase">
              Pedidos recentes
            </p>
            <ul className="divide-y divide-white/5">
              {PEDIDOS.map((pedido) => (
                <li
                  key={pedido.numero}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="font-mono text-xs text-white/55 tabular-nums">
                    {pedido.numero}
                  </span>
                  <span className="flex-1 truncate text-sm text-white/85">
                    {pedido.cliente}
                  </span>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${TONS_DE_STATUS[pedido.tom]}`}
                  >
                    {pedido.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
