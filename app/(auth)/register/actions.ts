"use server";

import { signIn } from "@/lib/auth";
import { handleAction } from "@/lib/action-handler";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { ValidationError, RateLimitError } from "@/lib/errors";
import { stripUndefined } from "@/lib/utils";
import { authService } from "@/services";
import { buildPostAuthUrl, parsePlanIntent } from "@/lib/plan-intent";
import { registerSchema } from "@/schemas/auth.schema";
import type { ActionResult } from "@/types/common";

/**
 * @param input Dados do cadastro — validados por `registerSchema`.
 * @param intentInput Intenção comercial, **em parâmetro separado de propósito**.
 *
 * Manter a intenção fora de `input` é o que impede, no compilador, que ela
 * alcance a persistência: `registerSchema` não a declara, `RegisterInput` não
 * a tem, e `authService.register` só aceita `RegisterInput`. Não existe
 * caminho por onde `plan=pro` chegue a `Company.planId` — não é uma checagem
 * que se possa esquecer, é a ausência de rota.
 *
 * O que a intenção decide é uma coisa só: para onde redirecionar depois.
 */
export async function registerAction(
  input: unknown,
  intentInput?: { plan?: unknown; billing?: unknown },
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

  // Revalidada no servidor, sem confiar no que o cliente mandou. O navegador
  // pode enviar qualquer coisa neste parâmetro; só os quatro pares conhecidos
  // sobrevivem, e o destino sai de um conjunto fechado no código.
  const intent = parsePlanIntent(intentInput ?? {});

  // Fora do handleAction: signIn lança um redirect internamente, que não
  // pode ser capturado pelo catch genérico do handler.
  await signIn("credentials", {
    email: result.data.email,
    password: result.data.password,
    redirectTo: buildPostAuthUrl(intent),
  });
}
