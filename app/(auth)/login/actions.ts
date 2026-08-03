"use server";

import { headers } from "next/headers";

import { signIn } from "@/lib/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { loginSchema } from "@/schemas/auth.schema";
import type { ActionResult } from "@/types/common";

export async function loginAction(input: unknown): Promise<ActionResult<never>> {
  const validation = loginSchema.safeParse(input);
  if (!validation.success) {
    return {
      error: "E-mail ou senha inválidos",
      fields: validation.error.flatten().fieldErrors,
    };
  }

  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";

  const { allowed } = await checkRateLimit({
    identifier: `login:${ip}`,
    ...RATE_LIMITS.LOGIN,
  });

  if (!allowed) {
    return { error: "Muitas tentativas. Tente novamente em 15 minutos." };
  }

  try {
    await signIn("credentials", {
      email: validation.data.email,
      password: validation.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "CredentialsSignin") {
      return { error: "E-mail ou senha incorretos" };
    }
    // NEXT_REDIRECT é lançado pelo signIn em caso de sucesso — precisa
    // propagar, não é uma falha real.
    throw error;
  }

  return {};
}
