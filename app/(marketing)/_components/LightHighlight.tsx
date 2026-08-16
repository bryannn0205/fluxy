import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Reveal } from "@/app/(marketing)/_components/Reveal";

const BENEFICIOS = [
  "Informação centralizada, em vez de espalhada em arquivos soltos",
  "Acompanhamento da operação pelo status de cada pedido",
  "Menos retrabalho: o dado é lançado uma vez e circula entre os módulos",
  "Acesso rápido aos dados de clientes, produtos e estoque",
];

/**
 * Estados reais pelos quais um pedido passa no Fluxy. As quantidades são
 * fictícias e servem só para dar forma — daí o bloco ser `aria-hidden`, com a
 * descrição textual ao lado.
 */
const STATUS = [
  { rotulo: "Recebido", qtd: "12", cor: "bg-amber-500", texto: "text-amber-700" },
  { rotulo: "Em produção", qtd: "17", cor: "bg-sky-500", texto: "text-sky-700" },
  { rotulo: "Pronto", qtd: "8", cor: "bg-violet-500", texto: "text-violet-700" },
  { rotulo: "Entregue", qtd: "91", cor: "bg-emerald-500", texto: "text-emerald-700" },
];

/**
 * Ilha clara no meio da página escura.
 *
 * `marketing-light` redeclara os mesmos tokens de cor com valores claros — o
 * conteúdo aqui dentro usa `bg-card`, `text-muted-foreground` e afins como em
 * qualquer outra seção, sem saber que está numa exceção. Ver app/globals.css.
 */
export function LightHighlight() {
  return (
    <section className="marketing-light bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="inline-flex items-center rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              Organização
            </p>

            <h2 className="mt-5 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Menos planilhas. Mais controle.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Quando cada informação vive num arquivo diferente, alguém sempre trabalha
              com a versão errada. O Fluxy guarda tudo em um lugar só e mostra a situação
              real da operação.
            </p>

            <ul className="mt-8 space-y-3.5">
              {BENEFICIOS.map((beneficio) => (
                <li key={beneficio} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check className="size-3 text-primary" aria-hidden="true" />
                  </span>
                  <span className="text-sm text-pretty">{beneficio}</span>
                </li>
              ))}
            </ul>

            <Link
              href={ROUTES.PLANS}
              className={cn(buttonVariants({ size: "lg" }), "mt-9 w-full sm:w-auto")}
            >
              Começar grátis
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Reveal>

          <Reveal delay={100}>
            {/* Cartões de status, e não a mesma peça de painel usada no hero e
                no bloco de produto. Repetir a terceira cópia da mesma janela
                fazia a página parecer ter um print só; aqui o assunto é outro —
                a operação vista por situação — e a composição acompanha. */}
            <p className="sr-only">
              Ilustração da distribuição de pedidos por situação no Fluxy: recebidos, em
              produção, prontos e entregues. As quantidades mostradas são fictícias.
            </p>

            <div
              aria-hidden="true"
              className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-primary/10 sm:p-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Pedidos por situação</p>
                <span className="text-xs text-muted-foreground">Este mês</span>
              </div>

              <ul className="mt-5 space-y-3">
                {STATUS.map((status) => (
                  <li
                    key={status.rotulo}
                    className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 px-4 py-3"
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", status.cor)} />
                    <span className="flex-1 text-sm">{status.rotulo}</span>
                    <span
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        status.texto,
                      )}
                    >
                      {status.qtd}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-5 border-t border-border/70 pt-4 text-xs text-muted-foreground">
                Cada pedido muda de situação sozinho conforme a operação anda.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
