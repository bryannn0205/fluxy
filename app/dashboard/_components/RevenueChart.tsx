import { formatCurrency } from "@/lib/formatters";
import type { RevenuePoint } from "@/types/reports";

interface RevenueChartProps {
  /** Já vem do ReportService com os dias sem venda preenchidos com zero. */
  pontos: RevenuePoint[];
  /** Rótulo do período, para o cabeçalho. */
  periodo: string;
}

const LARGURA = 640;
const ALTURA = 180;
const MARGEM_TOPO = 8;

/**
 * Faturamento por dia, em SVG.
 *
 * Sem biblioteca de gráficos: o projeto não tem nenhuma instalada, e uma área
 * com eixo implícito precisa de duas interpolações e um `path` — não paga uma
 * dependência de dezenas de kB no bundle do painel. Também não usa canvas,
 * então o traço acompanha a densidade da tela e o conteúdo continua no DOM.
 *
 * Renderiza no servidor: os pontos já chegam prontos, não há interação, e
 * mandar isso para o cliente só adiaria a primeira pintura.
 *
 * O gráfico é decorativo para leitor de tela — a leitura ponto a ponto de 30
 * dias não ajuda ninguém. O total e o período vão em texto ao lado, e a
 * tabela de pedidos recentes carrega o detalhe.
 */
export function RevenueChart({ pontos, periodo }: RevenueChartProps) {
  const total = pontos.reduce((soma, ponto) => soma + ponto.revenue, 0);
  const maximo = Math.max(...pontos.map((ponto) => ponto.revenue), 0);

  // Sem nenhuma venda no período, uma linha reta no zero comunica melhor que
  // um gráfico vazio — e evita dividir por zero na escala.
  const escala = maximo > 0 ? maximo : 1;
  const passo = pontos.length > 1 ? LARGURA / (pontos.length - 1) : LARGURA;

  const coordenadas = pontos.map((ponto, indice) => {
    const x = indice * passo;
    const y = MARGEM_TOPO + (ALTURA - MARGEM_TOPO) * (1 - ponto.revenue / escala);
    return { x, y };
  });

  const linha = coordenadas
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  const area = `${linha} L ${LARGURA} ${ALTURA} L 0 ${ALTURA} Z`;

  // Quatro marcas de grade, do topo ao zero. Sem eixo numérico completo: os
  // valores exatos vivem no resumo acima e na tabela abaixo, e uma escala densa
  // sobre 30 pontos viraria ruído.
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((fracao) => ({
    fracao,
    y: MARGEM_TOPO + (ALTURA - MARGEM_TOPO) * fracao,
    valor: escala * (1 - fracao),
  }));

  // Cinco marcas no eixo do tempo, distribuídas pelo período. Trinta rótulos
  // se sobreporiam; dois (só as pontas) não deixam localizar o pico.
  const QUANTIDADE_DE_MARCAS = 5;
  const marcasDoEixo =
    pontos.length === 0
      ? []
      : Array.from({ length: QUANTIDADE_DE_MARCAS }, (_, indice) => {
          const posicao = Math.round(
            (indice * (pontos.length - 1)) / (QUANTIDADE_DE_MARCAS - 1),
          );
          return pontos[posicao]!.date;
        });

  return (
    <section
      aria-labelledby="titulo-faturamento"
      className="flex flex-col rounded-2xl border border-border bg-card/80 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 id="titulo-faturamento" className="text-base font-semibold">
            Faturamento
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Últimos {periodo}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl leading-none font-semibold tracking-tight tabular-nums">
            {formatCurrency(total)}
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-[var(--panel-lavender)]"
            />
            Faturamento no período
          </p>
        </div>
      </div>

      <div className="relative mt-6 flex-1">
        {/* Grade atrás do traço, em SVG separado para não esticar junto com o
            `preserveAspectRatio="none"` do gráfico — linhas horizontais não
            distorcem, mas a espessura delas distorceria. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col justify-between"
        >
          {marcas.map((marca) => (
            <div key={marca.fracao} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-right font-mono text-[10px] text-muted-foreground/55 tabular-nums">
                {escalaCompacta(marca.valor)}
              </span>
              <span className="h-px flex-1 bg-border/45" />
            </div>
          ))}
        </div>

        <div className="ml-[4.25rem] overflow-hidden">
          <svg
            viewBox={`0 0 ${LARGURA} ${ALTURA}`}
            preserveAspectRatio="none"
            role="presentation"
            aria-hidden="true"
            className="h-52 w-full sm:h-64"
          >
            <defs>
              <linearGradient id="gradiente-faturamento" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
              </linearGradient>
            </defs>

            <path d={area} fill="url(#gradiente-faturamento)" />
            <path
              d={linha}
              fill="none"
              stroke="#a78bfa"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>

      <div className="mt-3 ml-[4.25rem] flex items-center justify-between text-[10px] text-muted-foreground/70">
        {marcasDoEixo.map((dia, indice) => (
          <span key={`${dia}-${indice}`}>{formatarDia(dia)}</span>
        ))}
      </div>

      <p className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        {maximo === 0
          ? "Nenhuma venda registrada no período."
          : `Maior dia do período: ${formatCurrency(maximo)}.`}
      </p>
    </section>
  );
}

/** `YYYY-MM-DD` → `DD/MM`. A chave já vem normalizada para Brasília. */
function formatarDia(chave: string): string {
  const [, mes, dia] = chave.split("-");
  return `${dia}/${mes}`;
}

/**
 * Rótulo curto para a régua vertical.
 *
 * `formatCurrency` completo repetia centavos em cinco linhas empilhadas
 * ("R$ 233,80 / R$ 175,35 / R$ 116,90…") e a régua competia com o traço. Aqui
 * o número é referência de altura, não valor a conferir — o total exato está no
 * cabeçalho do cartão e na tabela.
 */
function escalaCompacta(valor: number): string {
  if (valor >= 1000) return `R$ ${Math.round(valor / 1000)}k`;
  return `R$ ${Math.round(valor)}`;
}
