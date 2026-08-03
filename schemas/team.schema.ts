import { z } from "zod";

import { emailSchema, passwordSchema } from "@/schemas/common.schema";

// OWNER de propósito fora das opções: conceder posse é uma ação sensível
// demais para caber num convite por e-mail — só é possível depois, via
// updateMemberRoleSchema, e mesmo assim só quem já é OWNER pode fazer isso
// (ver TeamService).
export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(["ADMIN", "MEMBER"]),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2, "Nome é obrigatório").max(200),
  password: passwordSchema,
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const updateMemberRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
