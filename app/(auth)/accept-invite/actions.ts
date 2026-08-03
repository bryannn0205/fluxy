"use server";

import { signIn } from "@/lib/auth";
import { handleAction } from "@/lib/action-handler";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { stripUndefined } from "@/lib/utils";
import { teamService } from "@/services";
import { acceptInvitationSchema } from "@/schemas/team.schema";
import type { ActionResult } from "@/types/common";

// Sem requireCompany/requireAuth de propósito: quem aceita um convite ainda
// não tem sessão nenhuma — a prova de identidade aqui é o token, não um
// login prévio.
export async function acceptInvitationAction(
  input: unknown,
): Promise<ActionResult<null> | undefined> {
  const result = await handleAction(async () => {
    const validation = acceptInvitationSchema.safeParse(input);
    if (!validation.success) {
      throw new ValidationError(validation.error.flatten().fieldErrors);
    }

    // Por token (não por e-mail, que só é conhecido depois de validar o
    // token): protege contra tentativas repetidas de adivinhar um token.
    const { allowed } = await checkRateLimit({
      identifier: `accept-invite:${validation.data.token}`,
      ...RATE_LIMITS.REGISTER,
    });
    if (!allowed) {
      throw new RateLimitError();
    }

    const { email } = await teamService.acceptInvite(validation.data);

    return { email, password: validation.data.password };
  });

  if (result.error || !result.data) {
    return stripUndefined({ error: result.error, fields: result.fields });
  }

  // Fora do handleAction: signIn lança um redirect internamente, que não
  // pode ser capturado pelo catch genérico do handler — ver registerAction.
  await signIn("credentials", {
    email: result.data.email,
    password: result.data.password,
    redirectTo: "/dashboard",
  });
}
