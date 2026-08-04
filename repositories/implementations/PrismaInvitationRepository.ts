import type { Invitation, PrismaClient } from "@/lib/generated/prisma/client";
import type {
  AcceptInvitationContext,
  CreateInvitationData,
  InvitationRepository,
} from "@/repositories/interfaces/InvitationRepository";
import type { InvitationWithCompany, InvitationWithInviter } from "@/types/team";
import { ValidationError } from "@/lib/errors";

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

  async acceptWithinTransaction(
    token: string,
    decidir: (contexto: AcceptInvitationContext) => {
      name: string;
      passwordHash: string;
      emailVerified: boolean;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const convite = await tx.invitation.findUnique({ where: { token } });

      if (!convite || convite.expiresAt < new Date()) {
        throw new ValidationError({ token: ["Este convite expirou ou é inválido."] });
      }

      // Trava a empresa: dois aceites simultâneos ficam em fila aqui, e o
      // segundo só recalcula a cota depois de o primeiro ter commitado.
      await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${convite.companyId} FOR UPDATE`;

      const agora = new Date();
      // Contadas com `tx`, sob o lock. Fazer isso pelo client principal
      // travaria — ver a doc de AcceptInvitationContext.
      const [activeUsers, validPendingInvitations] = await Promise.all([
        tx.user.count({ where: { companyId: convite.companyId, deletedAt: null } }),
        tx.invitation.count({
          where: { companyId: convite.companyId, expiresAt: { gt: agora } },
        }),
      ]);

      const dados = decidir({
        companyId: convite.companyId,
        email: convite.email,
        activeUsers,
        validPendingInvitations,
      });

      // Consome o convite ANTES de criar o usuário: `deleteMany` devolve
      // count 0 se outra transação já o levou, e aí abortamos com erro de
      // convite inválido — em vez de deixar o `create` estourar P2002 no
      // e-mail único, que chegaria cru à interface.
      const consumido = await tx.invitation.deleteMany({ where: { id: convite.id } });
      if (consumido.count === 0) {
        throw new ValidationError({ token: ["Este convite já foi utilizado."] });
      }

      const user = await tx.user.create({
        data: {
          companyId: convite.companyId,
          name: dados.name,
          email: convite.email,
          passwordHash: dados.passwordHash,
          role: convite.role,
          emailVerified: dados.emailVerified ? new Date() : null,
        },
      });

      return { user, companyId: convite.companyId, email: convite.email };
    });
  }

  async countValidPending(companyId: string, now: Date): Promise<number> {
    return this.prisma.invitation.count({
      where: { companyId, expiresAt: { gt: now } },
    });
  }

  async findByCompanyAndEmail(companyId: string, email: string) {
    return this.prisma.invitation.findUnique({
      where: { companyId_email: { companyId, email } },
    });
  }

  async delete(id: string, companyId: string): Promise<void> {
    await this.prisma.invitation.deleteMany({ where: { id, companyId } });
  }
}
