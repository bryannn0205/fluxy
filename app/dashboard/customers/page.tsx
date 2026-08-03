import type { Metadata } from "next";
import { Users } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { requireCompany } from "@/lib/session";
import { customerService } from "@/services";
import { Pagination } from "@/components/common/Pagination";
import { CustomerTable } from "@/app/dashboard/customers/_components/CustomerTable";
import { CustomerFormDialog } from "@/app/dashboard/customers/_components/CustomerFormDialog";

export const metadata: Metadata = { title: "Clientes" };

interface CustomersPageProps {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const { page, search } = await searchParams;
  const { companyId } = await requireCompany();

  const customers = await customerService.list(companyId, {
    page: page ? Number(page) : 1,
    search,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Gerencie os clientes da sua empresa."
        action={<CustomerFormDialog />}
      />

      {customers.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? "Nenhum resultado" : "Nenhum cliente ainda"}
          description={
            search
              ? "Nenhum cliente corresponde à busca."
              : "Cadastre seu primeiro cliente para começar a criar pedidos."
          }
        />
      ) : (
        <>
          <CustomerTable customers={customers.data} />
          <Pagination
            pagination={customers.pagination}
            itemLabel="cliente"
            itemLabelPlural="clientes"
          />
        </>
      )}
    </div>
  );
}
