import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StockQuantityBadge } from "@/components/common/StockQuantityBadge";
import { formatCurrency } from "@/lib/formatters";
import { ROUTES } from "@/lib/constants";
import type { Product } from "@/lib/generated/prisma/client";
import { toClientProduct } from "@/types/products";
import { ProductRowActions } from "@/app/dashboard/products/_components/ProductRowActions";

export function ProductTable({ products }: { products: Product[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden lg:table-cell">Status</TableHead>
              <TableHead className="text-right">Estoque</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id} className="h-12">
                <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={ROUTES.PRODUCT_DETAIL(product.id)}
                    className="hover:underline"
                  >
                    {product.name}
                  </Link>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Badge variant={product.active ? "default" : "secondary"}>
                    {product.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <StockQuantityBadge
                    quantity={product.stockQuantity}
                    lowStockThreshold={product.lowStockThreshold}
                  />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatCurrency(Number(product.price))}
                  <span className="ml-1 text-xs text-muted-foreground">
                    /{product.unit}
                  </span>
                </TableCell>
                <TableCell>
                  <ProductRowActions product={toClientProduct(product)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {products.map((product) => (
          <div key={product.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  href={ROUTES.PRODUCT_DETAIL(product.id)}
                  className="font-medium hover:underline"
                >
                  {product.name}
                </Link>
                <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
              </div>
              <ProductRowActions product={toClientProduct(product)} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Badge variant={product.active ? "default" : "secondary"}>
                {product.active ? "Ativo" : "Inativo"}
              </Badge>
              <StockQuantityBadge
                quantity={product.stockQuantity}
                lowStockThreshold={product.lowStockThreshold}
              />
              <span className="font-mono text-sm font-medium tabular-nums">
                {formatCurrency(Number(product.price))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
