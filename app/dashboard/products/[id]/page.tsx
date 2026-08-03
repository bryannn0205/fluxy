import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StockQuantityBadge } from "@/components/common/StockQuantityBadge";
import { StockMovementHistory } from "@/components/common/StockMovementHistory";
import { formatCurrency } from "@/lib/formatters";
import { ROUTES } from "@/lib/constants";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { productService, stockService } from "@/services";
import {
  toClientProduct,
  toClientProductWithCosts,
  calculateMarginPercent,
} from "@/types/products";
import { ProductFormDialog } from "@/app/dashboard/products/_components/ProductFormDialog";
import { StockAdjustmentDialog } from "@/app/dashboard/products/[id]/_components/StockAdjustmentDialog";

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: "Detalhe do produto" };

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const { companyId, role } = await requireCompany();

  const product = await productService.findById(id, companyId);
  if (!product) {
    notFound();
  }

  const movements = await stockService.listMovements(id, companyId);

  // Só monta o objeto com custo quando o papel pode vê-lo. Para OPERATOR e
  // VIEWER o campo nem existe no que o servidor renderiza — não há número
  // escondido no HTML esperando um Ctrl+U.
  const canViewCosts = can(role, "products", "viewCosts");
  const productWithCosts = canViewCosts ? toClientProductWithCosts(product) : null;
  const clientProduct = productWithCosts ?? toClientProduct(product);
  const marginPercent = productWithCosts
    ? calculateMarginPercent(productWithCosts)
    : null;

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href={ROUTES.PRODUCTS}>Produtos</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <p className="font-mono text-sm text-muted-foreground">{product.sku}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={product.active ? "default" : "secondary"}>
            {product.active ? "Ativo" : "Inativo"}
          </Badge>
          {can(role, "products", "update") && productWithCosts && (
            <ProductFormDialog product={productWithCosts} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Preço
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl font-semibold tabular-nums">
              {formatCurrency(clientProduct.price)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                /{product.unit}
              </span>
            </p>
          </CardContent>
        </Card>

        {productWithCosts && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Custo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xl font-semibold tabular-nums">
                {productWithCosts.costPrice !== null
                  ? formatCurrency(productWithCosts.costPrice)
                  : "—"}
              </p>
            </CardContent>
          </Card>
        )}

        {productWithCosts && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Margem
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xl font-semibold tabular-nums">
                {marginPercent !== null ? `${marginPercent.toFixed(1)}%` : "—"}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Estoque atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">
              <StockQuantityBadge
                quantity={product.stockQuantity}
                lowStockThreshold={product.lowStockThreshold}
              />
            </p>
          </CardContent>
        </Card>
      </div>

      {product.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Descrição</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{product.description}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-medium">
            Movimentações de estoque
          </CardTitle>
          <StockAdjustmentDialog productId={product.id} />
        </CardHeader>
        <CardContent>
          <StockMovementHistory movements={movements} />
        </CardContent>
      </Card>
    </div>
  );
}
