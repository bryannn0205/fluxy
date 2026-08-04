import { Undo2, Plus } from "lucide-react";

import type { Payment, Role } from "@/lib/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { isOrderOverdue, remainingAmount } from "@/lib/payment-status";
import type { OrderPaymentStatus } from "@/lib/generated/prisma/client";
import { PaymentDialog } from "@/app/dashboard/orders/[id]/_components/PaymentDialog";

interface PaymentPanelProps {
  order: {
    id: string;
    status: "PENDING" | "PROCESSING" | "READY" | "COMPLETED" | "CANCELLED";
    total: number;
    paidAmount: number;
    paymentStatus: OrderPaymentStatus;
    dueDate: Date | null;
  };
  payments: Payment[];
  role: Role;
}

/**
 * Bloco financeiro do pedido. Server Component: os valores só chegam ao
 * navegador de quem tem `finance:view` — a página nem monta este componente
 * para os demais.
 */
export function PaymentPanel({ order, payments, role }: PaymentPanelProps) {
  const restante = remainingAmount(order);
  const atrasado = isOrderOverdue(order);
  const cancelado = order.status === "CANCELLED";

  const podeReceber =
    can(role, "finance", "registerPayment") && !cancelado && restante > 0;
  const podeEstornar =
    can(role, "finance", "refund") && !cancelado && order.paidAmount > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-medium">Financeiro</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={atrasado ? "destructive" : "secondary"}>
            {atrasado ? "Atrasado" : PAYMENT_STATUS_LABELS[order.paymentStatus]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-mono tabular-nums">{formatCurrency(order.total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Recebido</dt>
            <dd className="font-mono tabular-nums">{formatCurrency(order.paidAmount)}</dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt>Restante</dt>
            <dd className="font-mono tabular-nums">{formatCurrency(restante)}</dd>
          </div>
          {order.dueDate && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Vencimento</dt>
              <dd className={atrasado ? "font-medium text-destructive" : undefined}>
                {formatDate(order.dueDate)}
              </dd>
            </div>
          )}
        </dl>

        {(podeReceber || podeEstornar) && (
          <div className="flex flex-wrap gap-2">
            {podeReceber && (
              <PaymentDialog
                orderId={order.id}
                modo="PAYMENT"
                maximo={restante}
                gatilho={
                  <Button size="sm">
                    <Plus className="size-4" aria-hidden="true" />
                    Registrar pagamento
                  </Button>
                }
              />
            )}
            {podeEstornar && (
              <PaymentDialog
                orderId={order.id}
                modo="REFUND"
                maximo={order.paidAmount}
                gatilho={
                  <Button size="sm" variant="outline">
                    <Undo2 className="size-4" aria-hidden="true" />
                    Estornar
                  </Button>
                }
              />
            )}
          </div>
        )}

        {payments.length > 0 && (
          <div className="border-t pt-3">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              Lançamentos
            </h3>
            <ul className="space-y-2">
              {payments.map((lancamento) => (
                <li
                  key={lancamento.id}
                  className="flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm">
                      {lancamento.type === "REFUND" ? "Estorno" : "Recebimento"} ·{" "}
                      {PAYMENT_METHOD_LABELS[lancamento.method]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(lancamento.paidAt)}
                      {lancamento.note ? ` · ${lancamento.note}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-sm tabular-nums ${
                      lancamento.type === "REFUND" ? "text-destructive" : ""
                    }`}
                  >
                    {lancamento.type === "REFUND" ? "−" : "+"}
                    {formatCurrency(Number(lancamento.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
