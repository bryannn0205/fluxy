"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { handleAction } from "@/lib/action-handler";
import { ValidationError } from "@/lib/errors";
import { requireCompany } from "@/lib/session";
import { notificationService } from "@/services";
import type { ActionResult } from "@/types/common";

const markReadSchema = z.object({ id: z.string().min(1).max(50) });

/**
 * O destinatário nunca vem do input: é sempre o usuário da sessão. Marcar
 * como lida é uma escrita, e aceitar um `userId` do cliente permitiria zerar
 * o sino de outra pessoa.
 */
export async function markNotificationReadAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      const validation = markReadSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      await notificationService.markRead(validation.data.id, company.userId, company.id);

      // O sino vive no layout, então revalidar a raiz do dashboard é o que
      // atualiza o contador em qualquer página onde a ação foi disparada.
      revalidatePath("/dashboard", "layout");
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<null>> {
  const company = await requireCompany();

  return handleAction(
    async () => {
      await notificationService.markAllRead(company.userId, company.id);

      revalidatePath("/dashboard", "layout");
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}
