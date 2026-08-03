"use server";

import { revalidatePath } from "next/cache";

import { handleAction } from "@/lib/action-handler";
import { ValidationError } from "@/lib/errors";
import { requireCompany } from "@/lib/session";
import { customerService } from "@/services";
import { createCustomerSchema, updateCustomerSchema } from "@/schemas/customer.schema";
import { ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types/common";
import type { Customer } from "@/lib/generated/prisma/client";

export async function createCustomerAction(
  input: unknown,
): Promise<ActionResult<Customer>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      const validation = createCustomerSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      const customer = await customerService.create(
        validation.data,
        company,
        company.userId,
      );
      revalidatePath(ROUTES.CUSTOMERS);
      return customer;
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function updateCustomerAction(
  id: string,
  input: unknown,
): Promise<ActionResult<Customer>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      const validation = updateCustomerSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      const customer = await customerService.update(
        id,
        validation.data,
        company,
        company.userId,
      );
      revalidatePath(ROUTES.CUSTOMERS);
      return customer;
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function deleteCustomerAction(id: string): Promise<ActionResult<null>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      await customerService.delete(id, company, company.userId);
      revalidatePath(ROUTES.CUSTOMERS);
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}
