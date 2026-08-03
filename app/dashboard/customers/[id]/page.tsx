import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ShoppingCart } from "lucide-react";
import {
  formatCurrency,
  formatDate,
  formatDocument,
  formatOrderNumber,
} from "@/lib/formatters";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { requireCompany } from "@/lib/session";
import { customerService, orderService } from "@/services";

function StatCard({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "truncate text-xl font-semibold",
            mono && "font-mono tabular-nums",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Detalhe do cliente" };

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;
  const { companyId } = await requireCompany();

  const customer = await customerService.findById(id, companyId);
  if (!customer) {
    notFound();
  }

  const [orders, stats] = await Promise.all([
    orderService.list(companyId, { customerId: id, pageSize: 50 }),
    customerService.getStats(id, companyId),
  ]);

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href={ROUTES.CUSTOMERS}>Clientes</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{customer.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total gasto" value={formatCurrency(stats.totalSpent)} />
        <StatCard label="Pedidos" value={String(stats.orderCount)} />
        <StatCard label="Ticket médio" value={formatCurrency(stats.averageTicket)} />
        <StatCard
          label="Produto favorito"
          value={stats.favoriteProduct ? stats.favoriteProduct.name : "—"}
          mono={false}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Dados de contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              E-mail: <span className="text-foreground">{customer.email ?? "—"}</span>
            </p>
            <p className="text-muted-foreground">
              Telefone: <span className="text-foreground">{customer.phone ?? "—"}</span>
            </p>
            <p className="text-muted-foreground">
              CPF/CNPJ:{" "}
              <span className="text-foreground">
                {customer.document ? formatDocument(customer.document) : "—"}
              </span>
            </p>
            <p className="text-muted-foreground">
              Endereço: <span className="text-foreground">{customer.address ?? "—"}</span>
            </p>
            {customer.notes && (
              <p className="pt-2 text-muted-foreground">{customer.notes}</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-medium">Pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.data.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="Nenhum pedido ainda"
                description="Este cliente ainda não tem pedidos."
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.data.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Link
                            href={ROUTES.ORDER_DETAIL(order.id)}
                            className="font-mono text-sm font-medium hover:underline"
                          >
                            {formatOrderNumber(order.orderNumber)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(order.createdAt)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatCurrency(Number(order.total))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
