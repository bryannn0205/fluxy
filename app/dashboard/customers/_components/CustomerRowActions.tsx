"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { Customer } from "@/lib/generated/prisma/client";
import { CustomerFormDialog } from "@/app/dashboard/customers/_components/CustomerFormDialog";
import { deleteCustomerAction } from "@/app/dashboard/customers/actions";

export function CustomerRowActions({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    const result = await deleteCustomerAction(customer.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Cliente excluído");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <CustomerFormDialog customer={customer} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Excluir ${customer.name}`}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Excluir ${customer.name}?`}
        description="Esta ação não pode ser desfeita. Pedidos já criados para este cliente serão mantidos."
        onConfirm={handleDelete}
      />
    </div>
  );
}
