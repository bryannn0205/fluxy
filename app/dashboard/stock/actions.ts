"use server";

import { revalidatePath } from "next/cache";

import { handleAction } from "@/lib/action-handler";
import { ValidationError } from "@/lib/errors";
import { requireCompany } from "@/lib/session";
import { stockService } from "@/services";
import { adjustStockSchema } from "@/schemas/stock.schema";
import { ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types/common";

export async function adjustStockAction(input: unknown): Promise<ActionResult<null>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      const validation = adjustStockSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      await stockService.adjust(validation.data, company, company.userId);
      revalidatePath(ROUTES.STOCK);
      revalidatePath(ROUTES.PRODUCTS);
      revalidatePath(ROUTES.PRODUCT_DETAIL(validation.data.productId));
      revalidatePath(ROUTES.DASHBOARD);
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}
