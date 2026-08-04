import { randomBytes } from "crypto";

import type { Company, Role, User } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";
import {
  EmailAlreadyInUseError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { can, canAssignRole } from "@/lib/permissions";
import { hashPassword } from "@/lib/password";
import { sendEmail, teamInviteEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import type { InvitationRepository } from "@/repositories/interfaces/InvitationRepository";
import type { UserRepository } from "@/repositories/interfaces/UserRepository";
import type {
  AcceptInvitationInput,
  InviteMemberInput,
  UpdateMemberRoleInput,
} from "@/schemas/team.schema";
import type { InvitationPreview, InvitationWithInviter } from "@/types/team";
import { toInvitationPreview } from "@/types/team";
import type { AuditService } from "@/services/AuditService";
import type { SubscriptionGateService } from "@/services/SubscriptionGateService";
import type { PlanLimitService } from "@/services/PlanLimitService";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

type GateCompany = Pick<Company, "subscriptionStatus" | "trialEndsAt">;
type ActingUser = { id: string; role: Role };

function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export class TeamService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly invitationRepository: InvitationRepository,
    private readonly auditService: AuditService,
    private readonly subscriptionGate: SubscriptionGateService,
    private readonly planLimitService: PlanLimitService,
  ) {}

  /**
   * Recusa e-mail que já pertence a QUALQUER usuário, inclusive removido.
   *
   * `User.email` é único GLOBALMENTE no banco, sem exceção para soft delete.
   * A checagem antiga usava `findByEmail`, que ignora removidos — então
   * convidar o e-mail de um ex-membro passava aqui e só explodia no aceite,
   * com um P2002 cru chegando à interface.
   *
   * A mensagem pública é neutra de propósito: não revela se a conta está ativa
   * ou removida, o que transformaria o formulário de convite num verificador
   * de existência de contas. O detalhe fica no log interno.
   */
  private async assertEmailDisponivel(
    email: string,
    companyId: string,
    invitedById: string,
  ): Promise<void> {
    const existente = await this.userRepository.findByEmailIncludingDeleted(email);
    if (!existente) return;

    logger.warn("Convite recusado: e-mail já associado a uma conta", {
      companyId,
      userId: invitedById,
      resource: "invitation",
      estado: existente.deletedAt ? "removido" : "ativo",
      mesmaEmpresa: existente.companyId === companyId,
      motivo: "e-mail já pertence a um User",
    });

    throw new EmailAlreadyInUseError();
  }

  // Convidar/revogar/mudar papel/remover são ações administrativas — ler a
  // equipe (listMembers) não passa por aqui de propósito: qualquer membro
  // pode ver quem está na empresa, só não pode geri-la.
  private assertCanManageTeam(actingUser: ActingUser): void {
    if (!can(actingUser.role, "team", "invite")) {
      throw new ForbiddenError(
        "Somente proprietários e administradores podem gerenciar a equipe.",
      );
    }
  }

  /**
   * Convida um novo membro por e-mail. Reenviar para o mesmo e-mail renova
   * o convite existente (novo token, nova validade) em vez de duplicar.
   *
   * @throws {ForbiddenError} Quem convida não é OWNER/ADMIN
   * @throws {EmailAlreadyInUseError} E-mail já pertence a um usuário
   */
  async invite(
    input: InviteMemberInput,
    company: GateCompany & { id: string; name: string },
    actingUser: ActingUser,
  ): Promise<void> {
    this.subscriptionGate.assertCanWrite(company);
    this.assertCanManageTeam(actingUser);

    await this.assertEmailDisponivel(input.email, company.id, actingUser.id);

    const inviter = await this.userRepository.findById(actingUser.id, company.id);
    if (!inviter) {
      throw new NotFoundError("Usuário");
    }

    const agora = new Date();

    // Um convite pendente e VÁLIDO já ocupa uma vaga na contagem, então
    // renová-lo não pode cobrar uma segunda. Um EXPIRADO havia saído da conta:
    // ressuscitá-lo consome vaga de verdade e precisa de espaço livre.
    const existente = await this.invitationRepository.findByCompanyAndEmail(
      company.id,
      input.email,
    );
    const jaReservaVaga = existente !== null && existente.expiresAt > agora;

    await this.planLimitService.assertCanInvite(company.id, jaReservaVaga, agora);

    const token = generateInviteToken();
    const expiresAt = new Date(agora.getTime() + INVITATION_TTL_MS);

    // upsert, não create: a mesma linha é renovada (novo token, nova validade)
    // graças ao @@unique([companyId, email]). A constraint não renova nada
    // sozinha — quem renova é este upsert; ela só torna o alvo endereçável.
    await this.invitationRepository.upsert({
      companyId: company.id,
      email: input.email,
      role: input.role,
      token,
      invitedById: actingUser.id,
      expiresAt,
    });

    await this.auditService.log({
      companyId: company.id,
      userId: actingUser.id,
      action: "CREATE",
      resource: "invitation",
      resourceId: input.email,
    });

    // Falha ao enviar o e-mail não deve derrubar o convite — ele já existe
    // no banco e aparece como pendente; pode ser reenviado depois.
    try {
      const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`;
      await sendEmail(
        input.email,
        `${inviter.name} te convidou para o Fluxy`,
        teamInviteEmail(inviteUrl, company.name, inviter.name),
      );
    } catch (error) {
      logger.error("Falha ao enviar e-mail de convite", { error, companyId: company.id });
    }
  }

  async revokeInvite(
    invitationId: string,
    company: { id: string },
    actingUser: ActingUser,
  ): Promise<void> {
    this.assertCanManageTeam(actingUser);
    await this.invitationRepository.delete(invitationId, company.id);
  }

  /**
   * Dados para a tela pública de aceite mostrar "Fulano te convidou para a
   * empresa X" antes de pedir nome/senha. Retorna null para token
   * inválido/expirado — a página trata os dois casos da mesma forma
   * (convite inutilizável), sem precisar saber o motivo exato.
   */
  async getInvitationPreview(token: string): Promise<InvitationPreview | null> {
    const invitation = await this.invitationRepository.findByTokenWithCompany(token);

    if (!invitation || invitation.expiresAt < new Date()) {
      return null;
    }

    return toInvitationPreview(invitation);
  }

  /**
   * Cria a conta do convidado e consome o convite. Chamada pela página
   * pública de aceite — não tem sessão autenticada ainda.
   *
   * @throws {ValidationError} Token inválido ou expirado
   * @throws {EmailAlreadyInUseError} E-mail já foi usado nesse meio-tempo
   */
  async acceptInvite(
    input: AcceptInvitationInput,
  ): Promise<{ companyId: string; email: string }> {
    const preliminar = await this.invitationRepository.findByToken(input.token);

    if (!preliminar || preliminar.expiresAt < new Date()) {
      throw new ValidationError({ token: ["Este convite expirou ou é inválido."] });
    }

    await this.assertEmailDisponivel(
      preliminar.email,
      preliminar.companyId,
      preliminar.invitedById,
    );

    // O hash fica FORA da transação: Argon2 leva centenas de milissegundos por
    // design, e segurar o lock da empresa durante isso serializaria todos os
    // aceites da empresa atrás de um cálculo de senha.
    const passwordHash = await hashPassword(input.password);

    // Um convite válido JÁ reserva vaga. No aceite ele é trocado por um
    // usuário, então o uso total não muda:
    //
    //   projetado = ativos + convitesVálidos − reservaDeste + 1
    //
    // Com reservaDeste = 1, os dois últimos termos se cancelam. Sem esse
    // desconto, uma empresa com 4 usuários, 1 convite e limite 5 recusaria o
    // convidado — apesar de a vaga existir e estar reservada para ele.
    // O plano é lido ANTES da transação: é dado estável (muda por ação
    // comercial, não por concorrência) e consultá-lo lá dentro travaria, já
    // que as contagens sob lock precisam da mesma conexão.
    const plan = await this.planLimitService.getCurrentPlan(preliminar.companyId);

    const { user, companyId, email } =
      await this.invitationRepository.acceptWithinTransaction(input.token, (contexto) => {
        this.planLimitService.assertCanAcceptInvite(plan, contexto);

        return {
          name: input.name,
          passwordHash,
          // E-mail considerado verificado: clicar num link enviado àquela
          // caixa já prova posse dela, diferente do cadastro autônomo.
          emailVerified: true,
        };
      });

    await this.auditService.log({
      companyId,
      userId: user.id,
      action: "CREATE",
      resource: "user",
      resourceId: user.id,
    });

    return { companyId, email };
  }

  /**
   * @throws {ForbiddenError} Sem permissão, ou tentando alterar o próprio papel
   * @throws {ValidationError} Deixaria a empresa sem nenhum proprietário
   */
  async updateMemberRole(
    input: UpdateMemberRoleInput,
    company: { id: string },
    actingUser: ActingUser,
  ): Promise<void> {
    this.assertCanManageTeam(actingUser);

    if (input.userId === actingUser.id) {
      throw new ForbiddenError("Não é possível alterar seu próprio papel.");
    }

    const target = await this.userRepository.findById(input.userId, company.id);
    if (!target) {
      throw new NotFoundError("Usuário");
    }

    // Só quem já é OWNER pode conceder ou revogar posse — ADMIN gerencia os
    // papéis abaixo livremente, mas não mexe em quem é dono da empresa.
    const touchesOwnership = target.role === "OWNER" || input.role === "OWNER";
    if (touchesOwnership && actingUser.role !== "OWNER") {
      throw new ForbiddenError("Somente o proprietário pode conceder ou remover posse.");
    }

    // Trava de escalada: promover alguém acima de si é conquistar por
    // interposta pessoa um poder que não se tem. Hoje o caso concreto já é
    // barrado pela regra de posse acima; esta continua valendo se um papel
    // intermediário ganhar permissão de gerir equipe no futuro.
    if (!canAssignRole(actingUser.role, input.role)) {
      throw new ForbiddenError("Não é possível atribuir um papel superior ao seu.");
    }

    if (target.role === "OWNER" && input.role !== "OWNER") {
      const ownerCount = await this.userRepository.countByRole(company.id, "OWNER");
      if (ownerCount <= 1) {
        throw new ValidationError({
          role: ["A empresa precisa de ao menos um proprietário."],
        });
      }
    }

    await this.userRepository.updateRole(input.userId, company.id, input.role);

    await this.auditService.log({
      companyId: company.id,
      userId: actingUser.id,
      action: "PERMISSION_CHANGE",
      resource: "user",
      resourceId: input.userId,
      changes: { role: { before: target.role, after: input.role } },
    });
  }

  /**
   * @throws {ForbiddenError} Sem permissão, ou tentando remover a si mesmo
   * @throws {ValidationError} Deixaria a empresa sem nenhum proprietário
   */
  async removeMember(
    userId: string,
    company: { id: string },
    actingUser: ActingUser,
  ): Promise<void> {
    this.assertCanManageTeam(actingUser);

    if (userId === actingUser.id) {
      throw new ForbiddenError("Não é possível remover a si mesmo.");
    }

    const target = await this.userRepository.findById(userId, company.id);
    if (!target) {
      throw new NotFoundError("Usuário");
    }

    if (target.role === "OWNER" && actingUser.role !== "OWNER") {
      throw new ForbiddenError("Somente o proprietário pode remover outro proprietário.");
    }

    if (target.role === "OWNER") {
      const ownerCount = await this.userRepository.countByRole(company.id, "OWNER");
      if (ownerCount <= 1) {
        throw new ValidationError({
          userId: ["A empresa precisa de ao menos um proprietário."],
        });
      }
    }

    await this.userRepository.softDelete(userId, company.id);

    await this.auditService.log({
      companyId: company.id,
      userId: actingUser.id,
      action: "DELETE",
      resource: "user",
      resourceId: userId,
    });
  }

  async listMembers(companyId: string): Promise<User[]> {
    return this.userRepository.listByCompany(companyId);
  }

  async listPendingInvitations(companyId: string): Promise<InvitationWithInviter[]> {
    return this.invitationRepository.listPending(companyId);
  }
}
