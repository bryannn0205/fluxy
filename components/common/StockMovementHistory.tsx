import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/formatters";
import { ROUTES, STOCK_MOVEMENT_REASON_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { StockMovementWithProduct } from "@/repositories/interfaces/StockRepository";

interface StockMovementHistoryProps {
  movements: StockMovementWithProduct[];
  // true na página de Estoque (feed de vários produtos); false na página de
  // um produto específico, onde a coluna seria redundante.
  showProduct?: boolean;
  emptyMessage?: string;
}

export function StockMovementHistory({
  movements,
  showProduct = false,
  emptyMessage = "Nenhuma movimentação registrada ainda.",
}: StockMovementHistoryProps) {
  if (movements.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            {showProduct && <TableHead>Produto</TableHead>}
            <TableHead>Motivo</TableHead>
            <TableHead className="text-right">Quantidade</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead>Quem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((movement) => {
            const isEntry = movement.quantityDelta > 0;
            return (
              <TableRow key={movement.id}>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(movement.createdAt)}
                </TableCell>
                {showProduct && (
                  <TableCell>
                    <Link
                      href={ROUTES.PRODUCT_DETAIL(movement.product.id)}
                      className="font-medium hover:underline"
                    >
                      {movement.product.name}
                    </Link>
                  </TableCell>
                )}
                <TableCell>
                  <p>{STOCK_MOVEMENT_REASON_LABELS[movement.reason]}</p>
                  {movement.note && (
                    <p className="text-xs text-muted-foreground">{movement.note}</p>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono tabular-nums",
                    isEntry ? "text-emerald-700" : "text-destructive",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {isEntry ? (
                      <ArrowUpCircle className="size-3.5" aria-hidden="true" />
                    ) : (
                      <ArrowDownCircle className="size-3.5" aria-hidden="true" />
                    )}
                    {isEntry ? "+" : ""}
                    {movement.quantityDelta}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {movement.balanceAfter}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {movement.createdBy.name}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
