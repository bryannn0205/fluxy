import { randomBytes } from "crypto";

import { prisma } from "@/lib/db";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// VerificationToken é a tabela exigida pelo contrato do @auth/prisma-adapter.
// Como o Auth.js só a usa automaticamente com o provider de e-mail (não é o
// nosso caso, usamos Credentials), ela fica livre para os nossos próprios
// fluxos de token de uso único: recuperação de senha e verificação de e-mail.
export async function createPasswordResetToken(email: string): Promise<string> {
  const token = generateToken();

  await prisma.verificationToken.create({
    data: {
      identifier: `reset:${email}`,
      token,
      expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  return token;
}

export async function consumePasswordResetToken(token: string): Promise<string | null> {
  const record = await prisma.verificationToken.findUnique({ where: { token } });

  if (!record || record.expires < new Date() || !record.identifier.startsWith("reset:")) {
    return null;
  }

  await prisma.verificationToken.delete({ where: { token } });

  return record.identifier.replace("reset:", "");
}

export async function createEmailVerificationToken(email: string): Promise<string> {
  const token = generateToken();

  await prisma.verificationToken.create({
    data: {
      identifier: `verify:${email}`,
      token,
      expires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    },
  });

  return token;
}

export async function consumeEmailVerificationToken(
  token: string,
): Promise<string | null> {
  const record = await prisma.verificationToken.findUnique({ where: { token } });

  if (
    !record ||
    record.expires < new Date() ||
    !record.identifier.startsWith("verify:")
  ) {
    return null;
  }

  await prisma.verificationToken.delete({ where: { token } });

  return record.identifier.replace("verify:", "");
}
