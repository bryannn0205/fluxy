"use server";

import { signIn } from "@/lib/auth";
import { handleAction } from "@/lib/action-handler";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { ValidationError, RateLimitError } from "@/lib/errors";
import { stripUndefined } from "@/lib/utils";
import { authService } from "@/services";
import { registerSchema } from "@/schemas/auth.schema";
import type { ActionResult } from "@/types/common";

export async function registerAction(
  input: unknown,
): Promise<ActionResult<{ email: string }> | undefined> {
  const result = await handleAction(async () => {
    const validation = registerSchema.safeParse(input);
    if (!validation.success) {
      throw new ValidationError(validation.error.flatten().fieldErrors);
    }

    const { allowed } = await checkRateLimit({
      identifier: `register:${validation.data.email}`,
      ...RATE_LIMITS.REGISTER,
    });
    if (!allowed) {
      throw new RateLimitError();
    }

    await authService.register(validation.data);

    return { email: validation.data.email, password: validation.data.password };
  });

  if (result.error || !result.data) {
    return stripUndefined({ error: result.error, fields: result.fields });
  }

  // Fora do handleAction: signIn lança um redirect internamente, que não
  // pode ser capturado pelo catch genérico do handler.
  await signIn("credentials", {
    email: result.data.email,
    password: result.data.password,
    redirectTo: "/dashboard",
  });
}
