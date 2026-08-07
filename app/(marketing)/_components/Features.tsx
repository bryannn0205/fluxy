import {
  Boxes,
  ChartLine,
  Factory,
  Package,
  ShoppingCart,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface Recurso {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
}

// Mesmos ícones da navegação do painel (components/layout/NavContent.tsx):
// quem vê a landing e depois entra reconhece o que já tinha visto.
const RECURSOS: Recurso[] = [
  {
    icone: ShoppingCart,
    titulo: "Pedidos",
    descricao:
      "Numeração automática, itens, prazo, prioridade e histórico de cada alteração.",
  },
  {
    icone: Users,
    titulo: "Clientes",
    descricao: "Cadastro com documento e contato, e o histórico de compras junto.",
  },
  {
    icone: Package,
    titulo: "Produtos",
    descricao: "Preço de venda, custo, unidade e SKU, com margem calculada.",
  },
  {
    icone: Factory,
    titulo: "Produção",
    descricao: "Quadro por etapa para acompanhar o que está em andamento.",
  },
  {
    icone: Boxes,
    titulo: "Estoque",
    descricao:
      "Baixa automática ao vender, devolução ao cancelar e ajuste manual registrado.",
  },
  {
    icone: Wallet,
    titulo: "Contas a receber",
    descricao: "Pagamentos parciais, saldo por pedido e o que está em atraso.",
  },
  {
    icone: ChartLine,
    titulo: "Relatórios",
    descricao: "Faturamento, ticket médio e ranking de produtos e clientes.",
  },
  {
    icone: UserCog,
    titulo: "Equipe e permissões",
    descricao:
      "Seis papéis: quem vê valores, quem cria pedidos e quem administra a conta.",
  },
];

export function Features() {
  return (
    <section id="recursos" className="scroll-mt-16 border-b border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Tudo que a operação precisa, sem trocar de planilha
          </h2>
          <p className="mt-3 text-muted-foreground">
            Os módulos conversam entre si: um pedido baixa o estoque, gera o recebimento e
            aparece na produção.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RECURSOS.map((recurso) => (
            <li key={recurso.titulo}>
              <Card className="h-full transition-colors duration-150 hover:border-primary/30">
                <CardContent className="space-y-2.5">
                  <recurso.icone className="size-5 text-primary" aria-hidden="true" />
                  <h3 className="text-base font-semibold">{recurso.titulo}</h3>
                  <p className="text-sm text-muted-foreground">{recurso.descricao}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
