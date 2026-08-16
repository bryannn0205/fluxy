import Link from "next/link";
import { ArrowRight, ShoppingCart } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ROUTES } from "@/lib/constants";
import { formatCurrency, formatDate, formatOrderNumber } from "@/lib/formatters";
import type { OrderStatus } from "@/lib/generated/prisma/client";

/**
 * Linha já pronta para a tela.
 *
 * `valor` é `string | null`, e não o total cru: quem monta esta lista decide
 * uma vez se o papel pode ver dinheiro, e a linha que chega aqui já não tem o
 * número quando não pode. O componente não recebe o valor para depois escondê-
 * lo — ele nunca o recebe.
 */
export interface LinhaDePedido {
  id: string;
  numero: string;
  cliente: string;
  status: OrderStatus;
  criadoEm: Date;
  valor: string | null;
}

export function RecentOrders({ pedidos }: { pedidos: LinhaDePedido[] }) {
  const mostrarValor = pedidos.some((pedido) => pedido.valor !== null);

  return (
    <section
      aria-labelledby="titulo-pedidos-recentes"
      className="rounded-2xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5 sm:px-6">
        <h2 id="titulo-pedidos-recentes" className="text-base font-semibold">
          Pedidos recentes
        </h2>
        <Link
          href={ROUTES.ORDERS}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-[var(--panel-lavender)] transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Ver todos os pedidos
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {pedidos.length === 0 ? (
        <div className="p-5 sm:p-6">
          <EmptyState
            icon={ShoppingCart}
            title="Nenhum pedido ainda"
            description="Crie seu primeiro pedido para começar a acompanhar suas vendas."
          />
        </div>
      ) : (
        <>
          {/* Tabela a partir de sm. No celular ela viraria rolagem horizontal
              ou colunas espremidas a ponto de truncar o nome do cliente — ali
              a mesma informação vai como lista, logo abaixo. */}
          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-6 py-3 font-medium text-muted-foreground">
                    Pedido
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium text-muted-foreground">
                    Cliente
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium text-muted-foreground">
                    Etapa
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium text-muted-foreground">
                    Data
                  </th>
                  {mostrarValor && (
                    <th
                      scope="col"
                      className="px-6 py-3 text-right font-medium text-muted-foreground"
                    >
                      Valor
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {pedidos.map((pedido) => (
                  <tr
                    key={pedido.id}
                    className="border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-6 py-3.5">
                      <Link
                        href={ROUTES.ORDER_DETAIL(pedido.id)}
                        className="font-mono font-medium tabular-nums underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {formatOrderNumber(pedido.numero)}
                      </Link>
                    </td>
                    <td className="max-w-[16rem] truncate px-6 py-3.5">
                      {pedido.cliente}
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusBadge status={pedido.status} />
                    </td>
                    <td className="px-6 py-3.5 text-muted-foreground tabular-nums">
                      {formatDate(pedido.criadoEm)}
                    </td>
                    {mostrarValor && (
                      <td className="px-6 py-3.5 text-right font-mono tabular-nums">
                        {pedido.valor}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border/60 sm:hidden">
            {pedidos.map((pedido) => (
              <li key={pedido.id}>
                <Link
                  href={ROUTES.ORDER_DETAIL(pedido.id)}
                  className="flex flex-col gap-2 p-4 transition-colors duration-150 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm font-medium tabular-nums">
                      {formatOrderNumber(pedido.numero)}
                    </span>
                    {pedido.valor && (
                      <span className="font-mono text-sm tabular-nums">
                        {pedido.valor}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {pedido.cliente}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge status={pedido.status} />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(pedido.criadoEm)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Monta a linha da tela decidindo, uma vez só, se o valor acompanha. */
export function toLinhaDePedido(
  pedido: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    createdAt: Date;
    total: unknown;
    customer: { name: string };
  },
  podeVerValor: boolean,
): LinhaDePedido {
  return {
    id: pedido.id,
    numero: pedido.orderNumber,
    cliente: pedido.customer.name,
    status: pedido.status,
    criadoEm: pedido.createdAt,
    valor: podeVerValor ? formatCurrency(Number(pedido.total)) : null,
  };
}
