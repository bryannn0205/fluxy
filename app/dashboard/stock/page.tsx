import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, PackageSearch } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StockQuantityBadge } from "@/components/common/StockQuantityBadge";
import { StockMovementHistory } from "@/components/common/StockMovementHistory";
import { ROUTES, STOCK_RECENT_MOVEMENTS_LIMIT } from "@/lib/constants";
import { requireCompany } from "@/lib/session";
import { productService, stockService } from "@/services";

export const metadata: Metadata = { title: "Estoque" };

export default async function StockPage() {
  const { companyId } = await requireCompany();

  const [lowStockProducts, recentMovements] = await Promise.all([
    productService.listLowStock(companyId),
    stockService.listRecentMovements(companyId, STOCK_RECENT_MOVEMENTS_LIMIT),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        description="Níveis de estoque e movimentações recentes."
      />

      {lowStockProducts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium text-amber-800">
              <AlertTriangle className="size-4" aria-hidden="true" />
              {lowStockProducts.length === 1
                ? "1 produto com estoque baixo"
                : `${lowStockProducts.length} produtos com estoque baixo`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-amber-200">
              {lowStockProducts.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between gap-4 py-2 text-sm"
                >
                  <Link
                    href={ROUTES.PRODUCT_DETAIL(product.id)}
                    className="font-medium text-amber-900 hover:underline"
                  >
                    {product.name}
                  </Link>
                  <div className="flex items-center gap-3 text-amber-800">
                    <span>Mínimo: {product.lowStockThreshold}</span>
                    <StockQuantityBadge
                      quantity={product.stockQuantity}
                      lowStockThreshold={product.lowStockThreshold}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Movimentações recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentMovements.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Nenhuma movimentação ainda"
              description="Entradas, saídas e ajustes de estoque aparecem aqui."
            />
          ) : (
            <StockMovementHistory movements={recentMovements} showProduct />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
