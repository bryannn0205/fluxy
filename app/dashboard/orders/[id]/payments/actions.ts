"use server";

import { revalidatePath } from "next/cache";

import { handleAction } from "@/lib/action-handler";
import { ValidationError } from "@/lib/errors";
import { requireCompany } from "@/lib/session";
import { financeService } from "@/services";
import { refundPaymentSchema, registerPaymentSchema } from "@/schemas/payment.schema";
import { ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types/common";

// Devolve só o id, pelo mesmo motivo das actions de pedido: os campos Decimal
// de Payment não cruzam a fronteira RSC de volta ao Client Component.
export async function registerPaymentAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      const validation = registerPaymentSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      const payment = await financeService.registerPayment(
        validation.data,
        company,
        company.userId,
      );

      revalidatePath(ROUTES.ORDER_DETAIL(validation.data.orderId));
      revalidatePath(ROUTES.ORDERS);
      return { id: payment.id };
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function refundPaymentAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      const validation = refundPaymentSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      const payment = await financeService.refundPayment(
        validation.data,
        company,
        company.userId,
      );

      revalidatePath(ROUTES.ORDER_DETAIL(validation.data.orderId));
      revalidatePath(ROUTES.ORDERS);
      return { id: payment.id };
    },
    { companyId: company.id, userId: company.userId },
  );
}
