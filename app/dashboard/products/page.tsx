import type { Metadata } from "next";
import { Package } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { productService } from "@/services";
import { ProductTable } from "@/app/dashboard/products/_components/ProductTable";
import { ProductFormDialog } from "@/app/dashboard/products/_components/ProductFormDialog";

export const metadata: Metadata = { title: "Produtos" };

interface ProductsPageProps {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { page, search } = await searchParams;
  const { companyId, role } = await requireCompany();
  const canManage = can(role, "products", "create");

  const products = await productService.list(companyId, {
    page: page ? Number(page) : 1,
    search,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos"
        description="Gerencie o catálogo de produtos e serviços."
        action={canManage ? <ProductFormDialog /> : undefined}
      />

      {products.data.length === 0 ? (
        <EmptyState
          icon={Package}
          title={search ? "Nenhum resultado" : "Nenhum produto ainda"}
          description={
            search
              ? "Nenhum produto corresponde à busca."
              : "Cadastre seu primeiro produto para começar a criar pedidos."
          }
        />
      ) : (
        <>
          <ProductTable products={products.data} canManage={canManage} />
          <Pagination
            pagination={products.pagination}
            itemLabel="produto"
            itemLabelPlural="produtos"
          />
        </>
      )}
    </div>
  );
}
