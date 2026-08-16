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

  return (
    <section
      aria-labelledby="titulo-faturamento"
      className="rounded-2xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-faturamento" className="text-base font-semibold">
            Faturamento
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Últimos {periodo}</p>
        </div>
        <p className="font-mono text-xl font-semibold tabular-nums">
          {formatCurrency(total)}
        </p>
      </div>

      <div className="-mx-1 mt-5 overflow-hidden">
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          preserveAspectRatio="none"
          role="presentation"
          aria-hidden="true"
          className="h-40 w-full sm:h-48"
        >
          <defs>
            <linearGradient id="gradiente-faturamento" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={area} fill="url(#gradiente-faturamento)" />
          <path
            d={linha}
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {maximo === 0
          ? "Nenhuma venda registrada no período."
          : `Maior dia do período: ${formatCurrency(maximo)}.`}
      </p>
    </section>
  );
}
