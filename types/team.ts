import type { Invitation, Role, User } from "@/lib/generated/prisma/client";

export type InvitationWithInviter = Invitation & {
  invitedBy: { id: string; name: string };
};

export type InvitationWithCompany = Invitation & { company: { name: string } };

// Exibido na tela pública de aceite antes do login existir — só o
// necessário para "Fulano te convidou para a empresa X", nunca o token
// (ele já está na URL da própria página, não precisa voltar no payload).
export interface InvitationPreview {
  email: string;
  companyName: string;
  role: Role;
}

export function toInvitationPreview(
  invitation: InvitationWithCompany,
): InvitationPreview {
  return {
    email: invitation.email,
    companyName: invitation.company.name,
    role: invitation.role,
  };
}

// User bruto do Prisma tem passwordHash — nunca pode cruzar a fronteira
// Server -> Client Component. Client Components sempre recebem este tipo.
export interface ClientTeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}

export function toClientTeamMember(user: User): ClientTeamMember {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

// Invitation bruto do Prisma tem o token secreto do link de aceite — nunca
// pode cruzar a fronteira Server -> Client Component (viraria payload
// legível no navegador de quem estiver vendo a lista de convites).
export interface ClientPendingInvitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  invitedBy: { name: string };
}

export function toClientPendingInvitation(
  invitation: InvitationWithInviter,
): ClientPendingInvitation {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    invitedBy: { name: invitation.invitedBy.name },
  };
}
