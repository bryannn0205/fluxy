import { Eye, LayoutGrid, ShieldCheck, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Valor {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
}

/**
 * Afirmações que descrevem o que o produto faz hoje.
 *
 * Nenhum número de clientes, percentual de ganho, avaliação ou depoimento:
 * não existem, e inventá-los seria propaganda enganosa antes da primeira
 * venda. Cada linha aqui corresponde a uma funcionalidade que já está no ar.
 */
const VALORES: Valor[] = [
  {
    icone: LayoutGrid,
    titulo: "Uma base só",
    descricao: "Clientes, produtos, pedidos e pagamentos no mesmo lugar.",
  },
  {
    icone: Eye,
    titulo: "Situação sempre visível",
    descricao: "Cada pedido tem status, prazo e histórico de alterações.",
  },
  {
    icone: Wallet,
    titulo: "Recebimentos controlados",
    descricao: "Pagamentos registrados um a um, com saldo por pedido.",
  },
  {
    icone: ShieldCheck,
    titulo: "Acesso por papel",
    descricao: "Cada pessoa vê o que o papel dela permite — valores inclusive.",
  },
];

export function ValueStrip() {
  return (
    <section className="border-b border-border bg-background">
      <h2 className="sr-only">Por que usar o Fluxy</h2>
      <ul className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {VALORES.map((valor) => (
          <li key={valor.titulo} className="flex gap-3">
            <valor.icone
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div>
              <h3 className="text-sm font-semibold">{valor.titulo}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{valor.descricao}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
