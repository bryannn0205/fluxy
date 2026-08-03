import type { Metadata } from "next";
import { Package } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { orderService, customerService, productService } from "@/services";
import type { OrderStatus } from "@/lib/generated/prisma/client";
import { toClientProduct } from "@/types/products";
import { Pagination } from "@/components/common/Pagination";
import { OrderTable } from "@/app/dashboard/orders/_components/OrderTable";
import { OrderFilters } from "@/app/dashboard/orders/_components/OrderFilters";
import { CreateOrderDialog } from "@/app/dashboard/orders/_components/CreateOrderDialog";
import { ExportOrdersButton } from "@/app/dashboard/orders/_components/ExportOrdersButton";

export const metadata: Metadata = { title: "Pedidos" };

interface OrdersPageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const { page, search, status } = await searchParams;
  const company = await requireCompany();

  const [orders, customers, products] = await Promise.all([
    orderService.list(company.id, {
      page: page ? Number(page) : 1,
      search,
      status: status as OrderStatus | undefined,
    }),
    customerService.listActive(company.id),
    productService.listActive(company.id),
  ]);

  const hasFilters = Boolean(search || status);
  const canViewFinancials = can(company.role, "orders", "viewFinancials");
  const canCreate = can(company.role, "orders", "create");
  const canExport = can(company.role, "orders", "export");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        description="Acompanhe e gerencie os pedidos da sua empresa."
        action={
          <div className="flex items-center gap-2">
            {canExport && <ExportOrdersButton search={search} status={status} />}
            {canCreate && (
              <CreateOrderDialog
                customers={customers}
                products={products.map(toClientProduct)}
              />
            )}
          </div>
        }
      />

      <OrderFilters />

      {orders.data.length === 0 ? (
        <EmptyState
          icon={Package}
          title={hasFilters ? "Nenhum resultado" : "Nenhum pedido ainda"}
          description={
            hasFilters
              ? "Nenhum pedido corresponde aos filtros aplicados."
              : "Crie seu primeiro pedido para começar a acompanhar suas vendas."
          }
        />
      ) : (
        <>
          <OrderTable orders={orders.data} canViewFinancials={canViewFinancials} />
          <Pagination
            pagination={orders.pagination}
            itemLabel="pedido"
            itemLabelPlural="pedidos"
          />
        </>
      )}
    </div>
  );
}
