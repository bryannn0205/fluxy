import { Resend } from "resend";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  if (!resend) {
    logger.warn("RESEND_API_KEY não configurado — e-mail não enviado, apenas logado", {
      to,
      subject,
    });
    return;
  }

  const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html });

  if (error) {
    logger.error("Falha ao enviar e-mail", { to, subject, error });
    throw new Error(`Email send failed: ${error.message}`);
  }
}

export function passwordResetEmail(resetUrl: string): string {
  return `
    <p>Recebemos um pedido para redefinir sua senha no Fluxy.</p>
    <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a></p>
    <p>Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.</p>
    <p>O link expira em 1 hora.</p>
  `;
}

export function verifyEmailEmail(verifyUrl: string): string {
  return `
    <p>Bem-vindo ao Fluxy! Confirme seu e-mail para concluir o cadastro.</p>
    <p><a href="${verifyUrl}">Clique aqui para verificar seu e-mail</a></p>
  `;
}

export function teamInviteEmail(
  inviteUrl: string,
  companyName: string,
  inviterName: string,
): string {
  return `
    <p>${inviterName} convidou você para fazer parte da equipe de <strong>${companyName}</strong> no Fluxy.</p>
    <p><a href="${inviteUrl}">Clique aqui para aceitar o convite</a></p>
    <p>Se você não esperava este convite, pode ignorar este e-mail.</p>
    <p>O link expira em 7 dias.</p>
  `;
}
