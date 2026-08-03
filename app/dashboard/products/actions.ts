"use server";

import { revalidatePath } from "next/cache";

import { handleAction } from "@/lib/action-handler";
import { ValidationError } from "@/lib/errors";
import { requireCompany } from "@/lib/session";
import { productService } from "@/services";
import { createProductSchema, updateProductSchema } from "@/schemas/product.schema";
import { ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types/common";
import { toClientProduct, type ClientProduct } from "@/types/products";

// Retorna ClientProduct (price: number), nunca o Product do Prisma direto:
// Server Actions serializam o retorno pela mesma fronteira RSC que rejeita
// Decimal em props de Client Component. Ver types/products.ts.
export async function createProductAction(
  input: unknown,
): Promise<ActionResult<ClientProduct>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      const validation = createProductSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      const product = await productService.create(
        validation.data,
        company,
        company.userId,
      );
      revalidatePath(ROUTES.PRODUCTS);
      return toClientProduct(product);
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function updateProductAction(
  id: string,
  input: unknown,
): Promise<ActionResult<ClientProduct>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      const validation = updateProductSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      const product = await productService.update(
        id,
        validation.data,
        company,
        company.userId,
      );
      revalidatePath(ROUTES.PRODUCTS);
      return toClientProduct(product);
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function deleteProductAction(id: string): Promise<ActionResult<null>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      await productService.delete(id, company, company.userId);
      revalidatePath(ROUTES.PRODUCTS);
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}
