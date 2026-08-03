"use server";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { handleAction } from "@/lib/action-handler";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { createPasswordResetToken } from "@/lib/tokens";
import { sendEmail, passwordResetEmail } from "@/lib/email";
import { forgotPasswordSchema } from "@/schemas/auth.schema";
import type { ActionResult } from "@/types/common";

export async function forgotPasswordAction(input: unknown): Promise<ActionResult<null>> {
  return handleAction(async () => {
    const validation = forgotPasswordSchema.safeParse(input);
    if (!validation.success) {
      throw new ValidationError(validation.error.flatten().fieldErrors);
    }

    const { allowed } = await checkRateLimit({
      identifier: `password-reset:${validation.data.email}`,
      ...RATE_LIMITS.PASSWORD_RESET,
    });
    if (!allowed) {
      throw new RateLimitError();
    }

    const user = await prisma.user.findFirst({
      where: { email: validation.data.email, deletedAt: null },
    });

    // Sempre retorna sucesso, exista ou não o e-mail — evita que alguém
    // descubra quais e-mails têm conta no Fluxy testando este formulário.
    if (user) {
      const token = await createPasswordResetToken(user.email);
      const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
      await sendEmail(
        user.email,
        "Redefinir senha — Fluxy",
        passwordResetEmail(resetUrl),
      );
    }

    return null;
  });
}
