import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ROUTES } from "@/lib/constants";

interface Etapa {
  rotulo: string;
  quantidade: number;
  cor: string;
}

interface PipelineDonutProps {
  recebidos: number;
  emProducao: number;
  prontos: number;
}

const RAIO = 54;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

/**
 * Distribuição dos pedidos em aberto por etapa.
 *
 * **Cobre três etapas, não cinco, e o título diz isso.** `getStats` conta
 * `PENDING`, `PROCESSING` e `READY` — exatamente as etapas em que um pedido
 * ainda está em curso. Não existem contagens de `COMPLETED` e `CANCELLED` no
 * serviço, e somar as duas exigiria uma query nova no repositório, isto é,
 * mexer no backend. Chamar o cartão de "Pedidos por etapa" mostrando três de
 * cinco daria a entender que a empresa não tem pedidos entregues.
 *
 * Em SVG, pelos mesmos motivos do gráfico de faturamento: sem biblioteca, sem
 * canvas, renderizado no servidor.
 *
 * A legenda repete os números em texto — a rosca sozinha comunicaria só por
 * cor, e a leitura não pode depender disso.
 */
export function PipelineDonut({ recebidos, emProducao, prontos }: PipelineDonutProps) {
  const etapas: Etapa[] = [
    { rotulo: "Recebidos", quantidade: recebidos, cor: "#fbbf24" },
    { rotulo: "Em produção", quantidade: emProducao, cor: "#38bdf8" },
    { rotulo: "Prontos", quantidade: prontos, cor: "#a78bfa" },
  ];

  const total = etapas.reduce((soma, etapa) => soma + etapa.quantidade, 0);

  // Cada arco começa onde o anterior terminou. Com total zero, nenhum arco é
  // desenhado e sobra só o anel de fundo.
  let deslocamento = 0;
  const arcos = etapas.map((etapa) => {
    const fracao = total > 0 ? etapa.quantidade / total : 0;
    const arco = {
      ...etapa,
      tamanho: fracao * CIRCUNFERENCIA,
      inicio: deslocamento,
      percentual: Math.round(fracao * 100),
    };
    deslocamento += arco.tamanho;
    return arco;
  });

  return (
    <section
      aria-labelledby="titulo-pipeline"
      className="flex h-full flex-col rounded-2xl border border-border bg-card/80 p-5 sm:p-6"
    >
      <h2 id="titulo-pipeline" className="text-base font-semibold">
        Pedidos em aberto
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Distribuição por etapa da operação
      </p>

      <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-7 sm:flex-row sm:gap-8">
        <div className="relative shrink-0">
          <svg
            viewBox="0 0 128 128"
            className="size-36"
            role="presentation"
            aria-hidden="true"
          >
            <circle
              cx="64"
              cy="64"
              r={RAIO}
              fill="none"
              stroke="currentColor"
              strokeWidth="16"
              className="text-muted"
            />
            {arcos.map((arco) =>
              arco.tamanho > 0 ? (
                <circle
                  key={arco.rotulo}
                  cx="64"
                  cy="64"
                  r={RAIO}
                  fill="none"
                  stroke={arco.cor}
                  strokeWidth="16"
                  strokeDasharray={`${arco.tamanho} ${CIRCUNFERENCIA - arco.tamanho}`}
                  strokeDashoffset={-arco.inicio}
                  // Gira o início do primeiro arco para o topo do círculo.
                  transform="rotate(-90 64 64)"
                />
              ) : null,
            )}
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
              {total}
            </span>
            <span className="text-[11px] text-muted-foreground">Total</span>
          </div>
        </div>

        <ul className="w-full space-y-3">
          {arcos.map((arco) => (
            <li key={arco.rotulo} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: arco.cor }}
              />
              <span className="flex-1 text-muted-foreground">{arco.rotulo}</span>
              <span className="font-mono font-medium tabular-nums">
                {arco.quantidade}
              </span>
              <span className="w-9 text-right font-mono text-xs text-muted-foreground tabular-nums">
                {arco.percentual}%
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href={ROUTES.PRODUCTION}
        className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition-colors duration-150 hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Ver produção
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
