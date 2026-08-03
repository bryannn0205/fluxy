import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  PackageCheck,
  PackageSearch,
  ShoppingCart,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatCurrency, formatDate, formatOrderNumber } from "@/lib/formatters";
import { ROUTES } from "@/lib/constants";
import { requireCompany } from "@/lib/session";
import { orderService, productService } from "@/services";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage() {
  const { companyId } = await requireCompany();

  const [stats, recentOrders, lowStockProducts] = await Promise.all([
    orderService.getStats(companyId),
    orderService.list(companyId, { pageSize: 5 }),
    productService.listLowStock(companyId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
                    <span className="font-mono text-sm tabular-nums">
                      {formatCurrency(Number(order.total))}
                    </span>
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
