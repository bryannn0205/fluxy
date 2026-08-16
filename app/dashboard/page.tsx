import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Info,
  PackageCheck,
  PackageSearch,
  ShoppingCart,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatCurrency, formatDate, formatOrderNumber } from "@/lib/formatters";
import { DEFAULT_PLAN_SLUG, ROUTES } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { parsePlanIntent } from "@/lib/plan-intent";
import { requireCompany } from "@/lib/session";
import { cn } from "@/lib/utils";
import { orderService, productService } from "@/services";

export const metadata: Metadata = { title: "Painel" };

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  // A autorização vem daqui e SÓ daqui: sessão, empresa e papel. A query
  // string abaixo não participa desta linha nem de nenhuma decisão de acesso.
  const { companyId, role } = await requireCompany();

  // Duas permissões distintas porque são dois dados distintos: o faturamento
  // agregado do mês é indicador de vendas; o total de cada pedido é valor do
  // pedido. Um papel pode ter um sem o outro.
  //
  // Quem barra de fato é o servidor — `orderService.getStats` já devolve
  // `monthRevenue: null` sem `reports:viewSales`, e o total do pedido é
  // removido do objeto antes de virar HTML. As checagens aqui decidem o que
  // renderizar; não são o portão.
  const podeVerFaturamento = can(role, "reports", "viewSales");
  const podeVerValorDoPedido = can(role, "orders", "viewFinancials");

  // Usada exclusivamente para uma mensagem. Revalidada mesmo tendo sido
  // gerada por `buildPostAuthUrl` no passo anterior — a URL é do usuário, e
  // ele pode digitar `?plan=pro` sem nunca ter passado por /plans. Fazer isso
  // não muda nada: o plano real da empresa está no banco, e esta variável não
  // toca em plano, limite nem assinatura.
  const params = await searchParams;
  const planIntent = parsePlanIntent({
    plan: params.plan,
    billing: params.billing,
  });
  const mostrarAvisoDoPro = planIntent !== null && planIntent.plan !== DEFAULT_PLAN_SLUG;

  const [stats, recentOrders, lowStockProducts] = await Promise.all([
    orderService.getStats(companyId, role),
    orderService.list(companyId, { pageSize: 5 }),
    productService.listLowStock(companyId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>

      {mostrarAvisoDoPro && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p>
            <span className="font-medium">Plano Pro selecionado.</span>{" "}
            <span className="text-muted-foreground">
              A cobrança será disponibilizada em breve. Até lá, sua empresa continua no
              teste grátis com os limites do Standard.
            </span>
          </p>
        </div>
      )}

      {stats.overdueCount > 0 && (
        <Link
          href={ROUTES.PRODUCTION}
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {stats.overdueCount === 1
            ? "1 pedido atrasado — a previsão de entrega já passou."
            : `${stats.overdueCount} pedidos atrasados — a previsão de entrega já passou.`}
        </Link>
      )}

      {lowStockProducts.length > 0 && (
        <Link
          href={ROUTES.STOCK}
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {lowStockProducts.length === 1
            ? "1 produto com estoque baixo."
            : `${lowStockProducts.length} produtos com estoque baixo.`}
        </Link>
      )}

      {/* A grade acompanha o número de cartões: com o faturamento oculto,
          quatro colunas mantêm a linha cheia em vez de deixar um vão. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2",
          podeVerFaturamento ? "lg:grid-cols-5" : "lg:grid-cols-4",
        )}
      >
        {/* `monthRevenue` vem `null` do serviço quando o papel não pode vê-lo;
            a comparação abaixo é o que impede um `formatCurrency(null)`. */}
        {podeVerFaturamento && stats.monthRevenue !== null && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Faturamento do mês
              </CardTitle>
              <DollarSign className="size-4 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {formatCurrency(stats.monthRevenue)}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recebidos
            </CardTitle>
            <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold tabular-nums">
              {stats.pendingCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Em produção
            </CardTitle>
            <PackageSearch className="size-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold tabular-nums">
              {stats.processingCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prontos
            </CardTitle>
            <PackageCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold tabular-nums">
              {stats.readyCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pedidos no mês
            </CardTitle>
            <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold tabular-nums">
              {stats.monthOrderCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Pedidos recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentOrders.data.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Nenhum pedido ainda"
              description="Crie seu primeiro pedido para começar a acompanhar suas vendas."
            />
          ) : (
            <div className="divide-y">
              {recentOrders.data.map((order) => (
                <Link
                  key={order.id}
                  href={ROUTES.ORDER_DETAIL(order.id)}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">
                      {formatOrderNumber(order.orderNumber)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {order.customer.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {formatDate(order.createdAt)}
                    </span>
                    <StatusBadge status={order.status} />
                    {podeVerValorDoPedido && (
                      <span className="font-mono text-sm tabular-nums">
                        {formatCurrency(Number(order.total))}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
