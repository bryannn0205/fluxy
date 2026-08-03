"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PaginatedResult } from "@/types/common";

interface PaginationProps {
  pagination: PaginatedResult<unknown>["pagination"];
  itemLabel: string;
  itemLabelPlural: string;
}

export function Pagination({ pagination, itemLabel, itemLabelPlural }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pagination.totalPages <= 1) return null;

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Página {pagination.page} de {pagination.totalPages} · {pagination.total}{" "}
        {pagination.total === 1 ? itemLabel : itemLabelPlural}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pagination.page <= 1}
          onClick={() => goToPage(pagination.page - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => goToPage(pagination.page + 1)}
        >
          Próxima
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
