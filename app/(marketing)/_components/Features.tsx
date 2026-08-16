import { Boxes, Factory, History, ShoppingCart, UserCog, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Reveal } from "@/app/(marketing)/_components/Reveal";

interface Recurso {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
}

/**
 * Cada cartão descreve um módulo que já existe no produto — os mesmos ícones
 * da navegação do painel, para quem vê a landing e depois entra reconhecer o
 * que já tinha visto. Nada aqui antecipa funcionalidade não construída.
 */
const RECURSOS: Recurso[] = [
  {
    icone: ShoppingCart,
    titulo: "Pedidos organizados",
    descricao:
      "Numeração automática, itens, prazo e prioridade. Cada pedido caminha pelos status até a entrega.",
  },
  {
    icone: Users,
    titulo: "Clientes centralizados",
    descricao:
      "Cadastro com documento e contato, e o histórico de compras de cada um junto do registro.",
  },
  {
    icone: Boxes,
    titulo: "Controle de estoque",
    descricao:
      "Baixa automática ao vender, devolução ao cancelar e ajuste manual sempre registrado.",
  },
  {
    icone: Factory,
    titulo: "Produção visual",
    descricao:
      "Quadro por etapa para acompanhar o que está em andamento e o que já ficou pronto.",
  },
  {
    icone: UserCog,
    titulo: "Gestão de equipe",
    descricao:
      "Seis papéis definem quem cria pedidos, quem enxerga valores e quem administra a conta.",
  },
  {
    icone: History,
    titulo: "Histórico da operação",
    descricao:
      "Cada alteração relevante fica registrada, com autor e data, para consulta depois.",
  },
];

export function Features() {
  return (
    <section id="recursos" className="relative scroll-mt-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Por que escolher o Fluxy?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Os módulos conversam entre si: um pedido baixa o estoque, gera o recebimento e
            aparece na produção.
          </p>
        </Reveal>

        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {RECURSOS.map((recurso, indice) => (
            <Reveal as="li" key={recurso.titulo} delay={indice * 60}>
              <article className="group h-full rounded-2xl border border-border bg-card/70 p-6 transition-colors duration-200 hover:border-primary/45 hover:bg-card">
                <span className="inline-flex size-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-[var(--mkt-lavender)] transition-colors duration-200 group-hover:border-primary/45 group-hover:bg-primary/15">
                  <recurso.icone className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-base font-semibold">{recurso.titulo}</h3>
                <p className="mt-2 text-sm text-pretty text-muted-foreground">
                  {recurso.descricao}
                </p>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
