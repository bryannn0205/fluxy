"use server";

import { redirect } from "next/navigation";

import { FORGOT_PASSWORD_SENT_PARAM, FORGOT_PASSWORD_SENT_VALUE } from "@/lib/constants";
import { ROUTES } from "@/lib/constants";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { handleAction } from "@/lib/action-handler";
import { logger } from "@/lib/logger";
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
    //
    // A falha de envio é contida aqui pelo mesmo motivo. Deixá-la subir até
    // `handleAction` faria o formulário responder erro apenas quando a conta
    // existe — e-mail sem conta nunca chega a esta linha —, o que reabriria
    // pela porta dos fundos a enumeração que o parágrafo acima fecha.
    if (user) {
      try {
        const token = await createPasswordResetToken(user.email);
        const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
        await sendEmail(
          user.email,
          "Redefinir senha — Fluxy",
          passwordResetEmail(resetUrl),
        );
      } catch (error) {
        // Sem destinatário nem token no contexto: `lib/email.ts` já registra
        // para quem o envio falhou, e o token de redefinição vale como
        // credencial — não pode existir em log nenhum.
        logger.error("Falha ao enviar e-mail de redefinição de senha", { error });
      }
    }

    return null;
  });
}

/**
 * O caminho do formulário sem JavaScript — ver a action equivalente do login.
 *
 * Sem `action` o <form> submeteria em GET para a própria URL, levando o
 * e-mail digitado para a barra de endereços e para o histórico enquanto o
 * React ainda não hidratou. Com a Server Action declarada, o React emite
 * method="POST" no HTML servido e o campo viaja no corpo.
 *
 * O destino é o mesmo dando certo ou errado, de propósito: é a resposta
 * única que impede a tela de revelar quem tem conta.
 */
export async function forgotPasswordFormAction(formData: FormData): Promise<void> {
  await forgotPasswordAction({ email: formData.get("email") });

  redirect(
    `${ROUTES.FORGOT_PASSWORD}?${FORGOT_PASSWORD_SENT_PARAM}=${FORGOT_PASSWORD_SENT_VALUE}`,
  );
}
