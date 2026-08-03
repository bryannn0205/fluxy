"use server";

import { revalidatePath } from "next/cache";

import { handleAction } from "@/lib/action-handler";
import { ValidationError } from "@/lib/errors";
import { requireCompany } from "@/lib/session";
import { orderAttachmentService, orderService } from "@/services";
import {
  createOrderSchema,
  updateOrderDetailsSchema,
  updateOrderStatusSchema,
} from "@/schemas/order.schema";
import { ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types/common";

// Retorna só o id, não o Order/OrderItem completos do Prisma: os campos
// Decimal (subtotal, total, unitPrice...) não podem cruzar a fronteira RSC
// de volta ao Client Component — e nenhum chamador usa mais que o id hoje.
export async function createOrderAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      const validation = createOrderSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      const order = await orderService.create(validation.data, company, company.userId);
      revalidatePath(ROUTES.ORDERS);
      return { id: order.id };
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function updateOrderStatusAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      const validation = updateOrderStatusSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      await orderService.updateStatus(
        validation.data.orderId,
        validation.data.status,
        company,
        company.userId,
      );
      revalidatePath(ROUTES.ORDERS);
      revalidatePath(ROUTES.ORDER_DETAIL(validation.data.orderId));
      revalidatePath(ROUTES.PRODUCTION);
      revalidatePath(ROUTES.DASHBOARD);
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function updateOrderDetailsAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      const validation = updateOrderDetailsSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      await orderService.updateDetails(validation.data, company, company.userId);
      revalidatePath(ROUTES.ORDER_DETAIL(validation.data.orderId));
      revalidatePath(ROUTES.PRODUCTION);
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function deleteOrderAction(orderId: string): Promise<ActionResult<null>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      await orderService.delete(orderId, company, company.userId);
      revalidatePath(ROUTES.ORDERS);
      revalidatePath(ROUTES.PRODUCTION);
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function deleteOrderAttachmentAction(
  orderId: string,
  attachmentId: string,
): Promise<ActionResult<null>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      await orderAttachmentService.delete(attachmentId, company, company.userId);
      revalidatePath(ROUTES.ORDER_DETAIL(orderId));
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}
