"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { ClientProduct } from "@/types/products";
import { ProductFormDialog } from "@/app/dashboard/products/_components/ProductFormDialog";
import { deleteProductAction } from "@/app/dashboard/products/actions";

export function ProductRowActions({ product }: { product: ClientProduct }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    const result = await deleteProductAction(product.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Produto excluído");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <ProductFormDialog product={product} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Excluir ${product.name}`}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Excluir ${product.name}?`}
        description="Esta ação não pode ser desfeita. Pedidos já criados com este produto serão mantidos."
        onConfirm={handleDelete}
      />
    </div>
  );
}
