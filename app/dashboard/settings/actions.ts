"use server";

import { revalidatePath } from "next/cache";

import { handleAction } from "@/lib/action-handler";
import { ValidationError } from "@/lib/errors";
import { emptyToNull } from "@/lib/utils";
import { requireCompany } from "@/lib/session";
import { companyRepository, userRepository } from "@/services";
import { updateCompanySchema, updateProfileSchema } from "@/schemas/settings.schema";
import { ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types/common";
import type { Company, User } from "@/lib/generated/prisma/client";

export async function updateProfileAction(input: unknown): Promise<ActionResult<User>> {
  const { userId, companyId } = await requireCompany();

  return handleAction(async () => {
    const validation = updateProfileSchema.safeParse(input);
    if (!validation.success) {
      throw new ValidationError(validation.error.flatten().fieldErrors);
    }

    const user = await userRepository.updateName(userId, companyId, validation.data.name);
    revalidatePath(ROUTES.SETTINGS);
    return user;
  });
}

export async function updateCompanyAction(
  input: unknown,
): Promise<ActionResult<Company>> {
  const { companyId, role } = await requireCompany();

  return handleAction(async () => {
    if (role !== "OWNER" && role !== "ADMIN") {
      throw new ValidationError({
        name: ["Apenas administradores podem editar a empresa"],
      });
    }

    const validation = updateCompanySchema.safeParse(input);
    if (!validation.success) {
      throw new ValidationError(validation.error.flatten().fieldErrors);
    }

    const company = await companyRepository.update(companyId, {
      name: validation.data.name,
      phone: emptyToNull(validation.data.phone),
    });
    revalidatePath(ROUTES.SETTINGS);
    return company;
  });
}
