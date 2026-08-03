"use server";

import { prisma } from "@/lib/db";
import { handleAction } from "@/lib/action-handler";
import { ValidationError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { consumePasswordResetToken } from "@/lib/tokens";
import { resetPasswordSchema } from "@/schemas/auth.schema";
import type { ActionResult } from "@/types/common";

export async function resetPasswordAction(input: unknown): Promise<ActionResult<null>> {
  return handleAction(async () => {
    const validation = resetPasswordSchema.safeParse(input);
    if (!validation.success) {
      throw new ValidationError(validation.error.flatten().fieldErrors);
    }

    const email = await consumePasswordResetToken(validation.data.token);
    if (!email) {
      throw new ValidationError({
        token: ["Este link expirou ou já foi usado. Solicite um novo."],
      });
    }

    const passwordHash = await hashPassword(validation.data.password);

    await prisma.user.updateMany({
      where: { email, deletedAt: null },
      data: { passwordHash },
    });

    return null;
  });
}
