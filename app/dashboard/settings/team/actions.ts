"use server";

import { revalidatePath } from "next/cache";

import { handleAction } from "@/lib/action-handler";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireCompany } from "@/lib/session";
import { teamService } from "@/services";
import { inviteMemberSchema, updateMemberRoleSchema } from "@/schemas/team.schema";
import { ROUTES } from "@/lib/constants";
import type { ActionResult } from "@/types/common";

export async function inviteMemberAction(input: unknown): Promise<ActionResult<null>> {
  const company = await requireCompany();
  const actingUser = { id: company.userId, role: company.role };

  return handleAction(
    async () => {
      const validation = inviteMemberSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      // Por empresa (não por usuário): mesmo se outro ADMIN também convida,
      // o limite protege contra a empresa toda virar fonte de spam.
      const { allowed } = await checkRateLimit({
        identifier: `invite:${company.id}`,
        ...RATE_LIMITS.INVITE,
      });
      if (!allowed) {
        throw new RateLimitError();
      }

      await teamService.invite(validation.data, company, actingUser);
      revalidatePath(ROUTES.TEAM);
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function revokeInvitationAction(
  invitationId: string,
): Promise<ActionResult<null>> {
  const company = await requireCompany();
  const actingUser = { id: company.userId, role: company.role };

  return handleAction(
    async () => {
      await teamService.revokeInvite(invitationId, company, actingUser);
      revalidatePath(ROUTES.TEAM);
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function updateMemberRoleAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const company = await requireCompany();
  const actingUser = { id: company.userId, role: company.role };

  return handleAction(
    async () => {
      const validation = updateMemberRoleSchema.safeParse(input);
      if (!validation.success) {
        throw new ValidationError(validation.error.flatten().fieldErrors);
      }

      await teamService.updateMemberRole(validation.data, company, actingUser);
      revalidatePath(ROUTES.TEAM);
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}

export async function removeMemberAction(userId: string): Promise<ActionResult<null>> {
  const company = await requireCompany();
  const actingUser = { id: company.userId, role: company.role };

  return handleAction(
    async () => {
      await teamService.removeMember(userId, company, actingUser);
      revalidatePath(ROUTES.TEAM);
      return null;
    },
    { companyId: company.id, userId: company.userId },
  );
}
