import type { Invitation, PrismaClient } from "@/lib/generated/prisma/client";
import type {
  CreateInvitationData,
  InvitationRepository,
} from "@/repositories/interfaces/InvitationRepository";
import type { InvitationWithCompany, InvitationWithInviter } from "@/types/team";

export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(data: CreateInvitationData): Promise<Invitation> {
    return this.prisma.invitation.upsert({
      where: { companyId_email: { companyId: data.companyId, email: data.email } },
      create: {
        companyId: data.companyId,
        email: data.email,
        role: data.role,
        token: data.token,
        invitedById: data.invitedById,
        expiresAt: data.expiresAt,
      },
      update: {
        role: data.role,
        token: data.token,
        invitedById: data.invitedById,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findByToken(token: string): Promise<Invitation | null> {
    return this.prisma.invitation.findUnique({ where: { token } });
  }

  async findByTokenWithCompany(token: string): Promise<InvitationWithCompany | null> {
    return this.prisma.invitation.findUnique({
      where: { token },
      include: { company: { select: { name: true } } },
    });
  }

  async listPending(companyId: string): Promise<InvitationWithInviter[]> {
    return this.prisma.invitation.findMany({
      where: { companyId },
      include: { invitedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async delete(id: string, companyId: string): Promise<void> {
    await this.prisma.invitation.deleteMany({ where: { id, companyId } });
  }
}
