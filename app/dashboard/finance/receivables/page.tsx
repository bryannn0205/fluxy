import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { isOrderOverdue, remainingAmount } from "@/lib/payment-status";
import { formatCurrency, formatDate, formatOrderNumber } from "@/lib/formatters";
import { PAYMENT_STATUS_LABELS, ROUTES } from "@/lib/constants";

export const metadata: Metadata = { title: "Contas a receber" };

export default async function ReceivablesPage() {
  const { companyId, role } = await requireCompany();

  // Gate da página, complementar ao dos services — quem digitar a URL sem
  // permissão volta ao painel em vez de ver uma tela vazia.
  if (!can(role, "finance", "view")) {
    redirect(ROUTES.DASHBOARD);
  }

  // Consulta direta: é uma listagem de leitura sem regra de negócio própria,
  // e criar um Service só para repassar um findMany seria cerimônia — mesma
  // razão pela qual companyRepository é exportado direto em services/index.
  const pedidos = await prisma.order.findMany({
    where: {
      companyId,
      deletedAt: null,
      // PAID e CANCELLED não são conta a receber: não há o que cobrar.
      paymentStatus: { in: ["PENDING", "PARTIAL"] },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      paidAmount: true,
      paymentStatus: true,
      dueDate: true,
      customer: { select: { name: true } },
    },
    // Vencimento mais próximo primeiro; sem vencimento vai ao fim.
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 200,
  });

  const linhas = pedidos.map((pedido) => {
    const valores = {
      total: Number(pedido.total),
      paidAmount: Number(pedido.paidAmount),
    };
    return {
      ...pedido,
      ...valores,
      restante: remainingAmount(valores),
      // Derivado aqui pela mesma função que a tela do pedido usa — nenhuma
      // tela decide sozinha o que é "atrasado".
      atrasado: isOrderOverdue({
        ...valores,
        status: pedido.status,
        dueDate: pedido.dueDate,
      }),
    };
  });

  const totalAReceber = linhas.reduce((soma, linha) => soma + linha.restante, 0);
  const totalAtrasado = linhas
    .filter((linha) => linha.atrasado)
    .reduce((soma, linha) => soma + linha.restante, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas a receber"
        description="Pedidos com valor pendente, do vencimento mais próximo ao mais distante."
      />

      {linhas.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nada a receber"
          description="Todos os pedidos estão quitados ou não têm valor pendente."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total a receber</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {formatCurrency(totalAReceber)}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Em atraso</p>
              <p
                className={`font-mono text-2xl font-semibold tabular-nums ${
                  totalAtrasado > 0 ? "text-destructive" : ""
                }`}
              >
                {formatCurrency(totalAtrasado)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">Restante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((linha) => (
                  <TableRow key={linha.id}>
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={ROUTES.ORDER_DETAIL(linha.id)}
                        className="font-medium hover:underline"
                      >
                        {formatOrderNumber(linha.orderNumber)}
                      </Link>
                    </TableCell>
                    <TableCell>{linha.customer.name}</TableCell>
                    <TableCell
                      className={
                        linha.atrasado ? "font-medium text-destructive" : undefined
                      }
                    >
                      {linha.dueDate ? formatDate(linha.dueDate) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={linha.atrasado ? "destructive" : "secondary"}>
                        {linha.atrasado
                          ? "Atrasado"
                          : PAYMENT_STATUS_LABELS[linha.paymentStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatCurrency(linha.total)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatCurrency(linha.paidAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium tabular-nums">
                      {formatCurrency(linha.restante)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
