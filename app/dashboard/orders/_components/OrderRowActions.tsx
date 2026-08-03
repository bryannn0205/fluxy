"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ORDER_STATUS_LABELS, VALID_ORDER_STATUS_TRANSITIONS } from "@/lib/constants";
import type { ClientOrderListItem } from "@/types/orders";
import {
  deleteOrderAction,
  updateOrderStatusAction,
} from "@/app/dashboard/orders/actions";

export function OrderRowActions({ order }: { order: ClientOrderListItem }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const nextStatuses = VALID_ORDER_STATUS_TRANSITIONS[order.status] ?? [];

  async function handleStatusChange(status: string) {
    const result = await updateOrderStatusAction({ orderId: order.id, status });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Pedido #${order.orderNumber} atualizado`);
    router.refresh();
  }

  async function handleDelete() {
    const result = await deleteOrderAction(order.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Pedido excluído");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Ações do pedido #${order.orderNumber}`}
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {nextStatuses.map((status) => (
            <DropdownMenuItem
              key={status}
              onClick={() => void handleStatusChange(status)}
            >
              Marcar como {ORDER_STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Excluir pedido #${order.orderNumber}?`}
        description="Esta ação não pode ser desfeita."
        onConfirm={handleDelete}
      />
    </>
  );
}
