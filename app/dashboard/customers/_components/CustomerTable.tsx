import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROUTES } from "@/lib/constants";
import type { Customer } from "@/lib/generated/prisma/client";
import { CustomerRowActions } from "@/app/dashboard/customers/_components/CustomerRowActions";

export function CustomerTable({ customers }: { customers: Customer[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden lg:table-cell">E-mail</TableHead>
              <TableHead className="hidden lg:table-cell">Telefone</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id} className="h-12">
                <TableCell>
                  <Link
                    href={ROUTES.CUSTOMER_DETAIL(customer.id)}
                    className="font-medium hover:underline"
                  >
                    {customer.name}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {customer.email ?? "—"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {customer.phone ?? "—"}
                </TableCell>
                <TableCell>
                  <CustomerRowActions customer={customer} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {customers.map((customer) => (
          <div key={customer.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={ROUTES.CUSTOMER_DETAIL(customer.id)}
                className="font-medium hover:underline"
              >
                {customer.name}
              </Link>
              <CustomerRowActions customer={customer} />
            </div>
            {customer.email && (
              <p className="mt-1 text-sm text-muted-foreground">{customer.email}</p>
            )}
            {customer.phone && (
              <p className="text-sm text-muted-foreground">{customer.phone}</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
