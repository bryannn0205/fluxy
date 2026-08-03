import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatCurrency, formatDate, formatOrderNumber } from "@/lib/formatters";
import { ROUTES } from "@/lib/constants";
import type { OrderListItem } from "@/types/orders";
import { toClientOrderListItem } from "@/types/orders";
import { OrderRowActions } from "@/app/dashboard/orders/_components/OrderRowActions";

export function OrderTable({ orders }: { orders: OrderListItem[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Criado em</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id} className="h-12">
                <TableCell className="font-mono text-sm">
                  <Link
                    href={ROUTES.ORDER_DETAIL(order.id)}
                    className="font-medium hover:underline"
                  >
                    {formatOrderNumber(order.orderNumber)}
                  </Link>
                </TableCell>
                <TableCell>{order.customer.name}</TableCell>
                <TableCell>
                  <StatusBadge status={order.status} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {formatDate(order.createdAt)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatCurrency(Number(order.total))}
                </TableCell>
                <TableCell>
                  <OrderRowActions order={toClientOrderListItem(order)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {orders.map((order) => (
          <div key={order.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={ROUTES.ORDER_DETAIL(order.id)}
                className="font-mono text-sm font-medium hover:underline"
              >
                {formatOrderNumber(order.orderNumber)}
              </Link>
              <div className="flex items-center gap-1">
                <StatusBadge status={order.status} />
                <OrderRowActions order={toClientOrderListItem(order)} />
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{order.customer.name}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {formatDate(order.createdAt)}
              </span>
              <span className="font-mono text-sm font-medium tabular-nums">
                {formatCurrency(Number(order.total))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
