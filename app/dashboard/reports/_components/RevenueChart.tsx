"use client";

import { useId, useMemo, useState } from "react";

import { formatCurrency } from "@/lib/formatters";
import type { RevenuePoint } from "@/types/reports";

// Coordenadas do viewBox. O SVG escala para a largura do container; a espessura
// dos traços é mantida com `vector-effect="non-scaling-stroke"`, senão a linha
// engrossaria junto em telas largas.
const VIEW_W = 800;
const VIEW_H = 240;
const PAD = { top: 12, right: 10, bottom: 28, left: 62 } as const;
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

const GRID_STEPS = 4;
const MAX_X_LABELS = 6;

const compactCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Teto "redondo" do eixo Y, para os rótulos caírem em números legíveis. */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** `YYYY-MM-DD` → `DD/MM`, por manipulação de string: converter para Date aqui
 * reintroduziria o deslocamento de fuso que a chave já resolveu. */
function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${day}/${month}`;
}

function longDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const gradientId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const maxY = niceCeil(Math.max(...points.map((p) => p.revenue), 0));
    const lastIndex = points.length - 1;

    const x = (index: number) =>
      lastIndex === 0 ? PAD.left + PLOT_W / 2 : PAD.left + (index / lastIndex) * PLOT_W;
    const y = (value: number) => PAD.top + PLOT_H - (value / maxY) * PLOT_H;

    const coords = points.map((point, index) => ({ x: x(index), y: y(point.revenue) }));
    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
    const baseline = PAD.top + PLOT_H;
    const area =
      coords.length > 0
        ? `${line} L ${coords[coords.length - 1]!.x} ${baseline} L ${coords[0]!.x} ${baseline} Z`
        : "";

    // Espaça os rótulos do eixo X para nunca passarem de MAX_X_LABELS, senão
    // 365 pontos escreveriam as datas umas por cima das outras.
    const labelStride = Math.max(1, Math.ceil(points.length / MAX_X_LABELS));

    return { maxY, coords, line, area, baseline, labelStride };
  }, [points]);

  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeCoord = activeIndex === null ? null : geometry.coords[activeIndex];

  function moveActive(delta: number) {
    setActiveIndex((current) => {
      const next = (current ?? 0) + delta;
      return Math.min(Math.max(next, 0), points.length - 1);
    });
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;

    const xInView = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const ratio = (xInView - PAD.left) / PLOT_W;
    const index = Math.round(ratio * (points.length - 1));

    setActiveIndex(Math.min(Math.max(index, 0), points.length - 1));
  }

  function handleKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    const actions: Record<string, () => void> = {
      ArrowRight: () => moveActive(1),
      ArrowLeft: () => moveActive(-1),
      Home: () => setActiveIndex(0),
      End: () => setActiveIndex(points.length - 1),
      Escape: () => setActiveIndex(null),
    };

    const action = actions[event.key];
    if (!action) return;

    event.preventDefault();
    action();
  }

  const total = points.reduce((sum, point) => sum + point.revenue, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full touch-none"
          style={{ height: "auto" }}
          role="img"
          tabIndex={0}
          aria-label={`Faturamento por dia ao longo de ${points.length} dias, totalizando ${formatCurrency(total)}. Use as setas para percorrer os dias.`}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setActiveIndex(null)}
          onKeyDown={handleKeyDown}
          onBlur={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grade: hairlines sólidas, um tom acima da superfície. */}
          {Array.from({ length: GRID_STEPS + 1 }, (_, step) => {
            const value = (geometry.maxY / GRID_STEPS) * step;
            const y = PAD.top + PLOT_H - (step / GRID_STEPS) * PLOT_H;

            return (
              <g key={step}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={VIEW_W - PAD.right}
                  y2={y}
                  className="stroke-border"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={PAD.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {compactCurrency.format(value)}
                </text>
              </g>
            );
          })}

          {points.map((point, index) =>
            index % geometry.labelStride === 0 ? (
              <text
                key={point.date}
                x={geometry.coords[index]!.x}
                y={VIEW_H - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {shortDate(point.date)}
              </text>
            ) : null,
          )}

          <path d={geometry.area} fill={`url(#${gradientId})`} className="text-primary" />
          <path
            d={geometry.line}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-primary"
          />

          {activeCoord && (
            <g>
              <line
                x1={activeCoord.x}
                y1={PAD.top}
                x2={activeCoord.x}
                y2={geometry.baseline}
                className="stroke-muted-foreground"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {/* Anel na cor da superfície separa o marcador da linha sem
                  desenhar uma borda escura em volta dele. */}
              <circle
                cx={activeCoord.x}
                cy={activeCoord.y}
                r={5}
                className="fill-primary stroke-card"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </svg>

        {activePoint && activeCoord && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-sm"
            style={{
              left: `${(activeCoord.x / VIEW_W) * 100}%`,
              // Cola o balão nas bordas quando o ponto ativo está nos extremos,
              // senão ele vaza para fora do card.
              marginLeft:
                activeCoord.x / VIEW_W < 0.12
                  ? "3rem"
                  : activeCoord.x / VIEW_W > 0.88
                    ? "-3rem"
                    : 0,
            }}
          >
            <p className="text-xs text-muted-foreground">{longDate(activePoint.date)}</p>
            <p className="font-mono text-sm font-medium tabular-nums">
              {formatCurrency(activePoint.revenue)}
            </p>
            <p className="text-xs text-muted-foreground">
              {activePoint.orderCount === 1
                ? "1 pedido"
                : `${activePoint.orderCount} pedidos`}
            </p>
          </div>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {activePoint
          ? `${longDate(activePoint.date)}: ${formatCurrency(activePoint.revenue)}, ${activePoint.orderCount} pedidos`
          : ""}
      </p>

      {/* O equivalente acessível do gráfico: o balão de hover enriquece, mas
          nunca é o único caminho até o número. */}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Ver dados em tabela
        </summary>
        <div className="mt-3 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Faturamento e número de pedidos por dia</caption>
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-1.5 font-medium">
                  Dia
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Faturamento
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Pedidos
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date} className="border-b last:border-0">
                  <td className="py-1.5 tabular-nums">{longDate(point.date)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {formatCurrency(point.revenue)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{point.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
