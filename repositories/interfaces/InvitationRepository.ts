import type { Invitation, Role } from "@/lib/generated/prisma/client";
import type { InvitationWithCompany, InvitationWithInviter } from "@/types/team";

export interface CreateInvitationData {
  companyId: string;
  email: string;
  role: Role;
  token: string;
  invitedById: string;
  expiresAt: Date;
}

export interface InvitationRepository {
  /** Cria ou renova (mesma empresa + e-mail já tinha convite pendente) com novo token/validade. */
  upsert(data: CreateInvitationData): Promise<Invitation>;
  findByToken(token: string): Promise<Invitation | null>;
  /** Inclui o nome da empresa — usado na tela pública de aceite do convite. */
  findByTokenWithCompany(token: string): Promise<InvitationWithCompany | null>;
  listPending(companyId: string): Promise<InvitationWithInviter[]>;
  delete(id: string, companyId: string): Promise<void>;
}
