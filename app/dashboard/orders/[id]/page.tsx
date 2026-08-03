import { notFound } from "next/navigation";
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
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatCurrency, formatDateTime, formatOrderNumber } from "@/lib/formatters";
import { ROUTES } from "@/lib/constants";
import { requireCompany } from "@/lib/session";
import { orderService } from "@/services";
import { isR2Configured } from "@/lib/r2";
import { OrderDetailsForm } from "@/app/dashboard/orders/[id]/_components/OrderDetailsForm";
import { OrderTimeline } from "@/app/dashboard/orders/[id]/_components/OrderTimeline";
import { OrderAttachments } from "@/app/dashboard/orders/[id]/_components/OrderAttachments";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: OrderDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Pedido #${id}` };
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  const { companyId } = await requireCompany();

  const order = await orderService.findById(id, companyId);
  if (!order) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href={ROUTES.ORDERS}>Pedidos</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{formatOrderNumber(order.orderNumber)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {formatOrderNumber(order.orderNumber)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Criado em {formatDateTime(order.createdAt)} por {order.createdBy.name}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-medium">Itens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Preço unit.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatCurrency(Number(item.unitPrice))}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatCurrency(Number(item.total))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 space-y-1 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(Number(order.subtotal))}
                </span>
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Desconto</span>
                  <span className="font-mono tabular-nums">
                    -{formatCurrency(Number(order.discount))}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-medium">
                <span>Total</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(Number(order.total))}
                </span>
              </div>
            </div>

            {order.notes && (
              <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
                {order.notes}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{order.customer.name}</p>
              {order.customer.email && (
                <p className="text-muted-foreground">{order.customer.email}</p>
              )}
              {order.customer.phone && (
                <p className="text-muted-foreground">{order.customer.phone}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Detalhes</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderDetailsForm
                orderId={order.id}
                priority={order.priority}
                expectedDeliveryDate={order.expectedDeliveryDate}
                paymentMethod={order.paymentMethod}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Anexos</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderAttachments
                orderId={order.id}
                attachments={order.attachments}
                isUploadAvailable={isR2Configured()}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Linha do tempo</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderTimeline auditLogs={order.auditLogs} />
        </CardContent>
      </Card>
    </div>
  );
}
