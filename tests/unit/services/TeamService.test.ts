import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EmailAlreadyInUseError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { TeamService } from "@/services/TeamService";
import type { AuditService } from "@/services/AuditService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";
import type { InvitationRepository } from "@/repositories/interfaces/InvitationRepository";
import type { UserRepository } from "@/repositories/interfaces/UserRepository";
import type { Company, Invitation, User } from "@/lib/generated/prisma/client";

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  teamInviteEmail: vi.fn().mockReturnValue("<p>convite</p>"),
}));

vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
}));

const activeCompany: Company = {
  id: "company-1",
  name: "Empresa Teste",
  email: "empresa@teste.com",
  cnpj: null,
  phone: null,
  planId: null,
  subscriptionStatus: "ACTIVE",
  trialEndsAt: new Date(),
  asaasCustomerId: null,
  asaasSubscriptionId: null,
  nextOrderNumber: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    companyId: "company-1",
    name: "Usuário Teste",
    email: "usuario@teste.com",
    emailVerified: null,
    image: null,
    passwordHash: "hash",
    role: "MEMBER",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function buildInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "invitation-1",
    companyId: "company-1",
    email: "convidado@teste.com",
    role: "MEMBER",
    token: "token-123",
    invitedById: "owner-1",
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    ...overrides,
  };
}

describe("TeamService", () => {
  let userRepository: UserRepository;
  let invitationRepository: InvitationRepository;
  let auditService: AuditService;
  let service: TeamService;

  beforeEach(() => {
    vi.clearAllMocks();

    userRepository = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      updatePassword: vi.fn(),
      updateName: vi.fn(),
      markEmailVerified: vi.fn(),
      listByCompany: vi.fn(),
      countByRole: vi.fn(),
      createMember: vi.fn(),
      updateRole: vi.fn(),
      softDelete: vi.fn(),
    };

    invitationRepository = {
      upsert: vi.fn(),
      findByToken: vi.fn(),
      findByTokenWithCompany: vi.fn(),
      listPending: vi.fn(),
      delete: vi.fn(),
    };

    auditService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    service = new TeamService(
      userRepository,
      invitationRepository,
      auditService,
      new SubscriptionGateService(),
    );
  });

  describe("invite", () => {
    const input = { email: "novo@teste.com", role: "MEMBER" as const };
    const ownerActor = { id: "owner-1", role: "OWNER" as const };

    it("rejeita quando quem convida é MEMBER", async () => {
      await expect(
        service.invite(input, activeCompany, { id: "member-1", role: "MEMBER" }),
      ).rejects.toThrow(ForbiddenError);

      expect(invitationRepository.upsert).not.toHaveBeenCalled();
    });

    it("rejeita quando o e-mail já pertence a um usuário", async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(buildUser());

      await expect(service.invite(input, activeCompany, ownerActor)).rejects.toThrow(
        EmailAlreadyInUseError,
      );

      expect(invitationRepository.upsert).not.toHaveBeenCalled();
    });

    it("cria o convite e envia o e-mail quando OWNER convida", async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
      vi.mocked(userRepository.findById).mockResolvedValueOnce(
        buildUser({ id: "owner-1", name: "Dona Ana", role: "OWNER" }),
      );
      vi.mocked(invitationRepository.upsert).mockResolvedValueOnce(buildInvitation());

      await service.invite(input, activeCompany, ownerActor);

      expect(invitationRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: "company-1",
          email: "novo@teste.com",
          role: "MEMBER",
        }),
      );
      const { sendEmail } = await import("@/lib/email");
      expect(sendEmail).toHaveBeenCalledWith(
        "novo@teste.com",
        expect.stringContaining("Dona Ana"),
        expect.any(String),
      );
    });

    it("permite ADMIN convidar", async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
      vi.mocked(userRepository.findById).mockResolvedValueOnce(
        buildUser({ role: "ADMIN" }),
      );
      vi.mocked(invitationRepository.upsert).mockResolvedValueOnce(buildInvitation());

      await expect(
        service.invite(input, activeCompany, { id: "admin-1", role: "ADMIN" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("acceptInvite", () => {
    const input = { token: "token-123", name: "Novo Membro", password: "Senha@123" };

    it("rejeita token inexistente", async () => {
      vi.mocked(invitationRepository.findByToken).mockResolvedValueOnce(null);

      await expect(service.acceptInvite(input)).rejects.toThrow(ValidationError);
      expect(userRepository.createMember).not.toHaveBeenCalled();
    });

    it("rejeita token expirado", async () => {
      vi.mocked(invitationRepository.findByToken).mockResolvedValueOnce(
        buildInvitation({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.acceptInvite(input)).rejects.toThrow(ValidationError);
      expect(userRepository.createMember).not.toHaveBeenCalled();
    });

    it("rejeita quando o e-mail já foi usado nesse meio-tempo", async () => {
      vi.mocked(invitationRepository.findByToken).mockResolvedValueOnce(
        buildInvitation(),
      );
      vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(buildUser());

      await expect(service.acceptInvite(input)).rejects.toThrow(EmailAlreadyInUseError);
      expect(userRepository.createMember).not.toHaveBeenCalled();
    });

    it("cria o usuário com o papel do convite e apaga o convite", async () => {
      const invitation = buildInvitation({ role: "ADMIN" });
      vi.mocked(invitationRepository.findByToken).mockResolvedValueOnce(invitation);
      vi.mocked(userRepository.findByEmail).mockResolvedValueOnce(null);
      vi.mocked(userRepository.createMember).mockResolvedValueOnce(
        buildUser({ id: "new-user", email: invitation.email, role: "ADMIN" }),
      );

      const result = await service.acceptInvite(input);

      expect(userRepository.createMember).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: "company-1",
          email: "convidado@teste.com",
          role: "ADMIN",
          passwordHash: "hashed-password",
        }),
      );
      expect(invitationRepository.delete).toHaveBeenCalledWith(
        "invitation-1",
        "company-1",
      );
      expect(result).toEqual({ companyId: "company-1", email: "convidado@teste.com" });
    });
  });

  describe("updateMemberRole", () => {
    const ownerActor = { id: "owner-1", role: "OWNER" as const };
    const adminActor = { id: "admin-1", role: "ADMIN" as const };

    it("rejeita quando o usuário-alvo não existe nesta empresa", async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(null);

      await expect(
        service.updateMemberRole(
          { userId: "user-2", role: "ADMIN" },
          activeCompany,
          ownerActor,
        ),
      ).rejects.toThrow(NotFoundError);

      expect(userRepository.updateRole).not.toHaveBeenCalled();
    });

    it("rejeita quando quem altera é MEMBER", async () => {
      await expect(
        service.updateMemberRole({ userId: "user-2", role: "ADMIN" }, activeCompany, {
          id: "member-1",
          role: "MEMBER",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("rejeita alterar o próprio papel", async () => {
      await expect(
        service.updateMemberRole(
          { userId: "owner-1", role: "ADMIN" },
          activeCompany,
          ownerActor,
        ),
      ).rejects.toThrow(ForbiddenError);

      expect(userRepository.updateRole).not.toHaveBeenCalled();
    });

    it("rejeita ADMIN promovendo alguém a OWNER", async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(
        buildUser({ role: "MEMBER" }),
      );

      await expect(
        service.updateMemberRole(
          { userId: "user-2", role: "OWNER" },
          activeCompany,
          adminActor,
        ),
      ).rejects.toThrow(ForbiddenError);

      expect(userRepository.updateRole).not.toHaveBeenCalled();
    });

    it("rejeita ADMIN rebaixando um OWNER", async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(
        buildUser({ role: "OWNER" }),
      );

      await expect(
        service.updateMemberRole(
          { userId: "user-2", role: "ADMIN" },
          activeCompany,
          adminActor,
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it("rejeita rebaixar o último OWNER", async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(
        buildUser({ id: "user-2", role: "OWNER" }),
      );
      vi.mocked(userRepository.countByRole).mockResolvedValueOnce(1);

      await expect(
        service.updateMemberRole(
          { userId: "user-2", role: "ADMIN" },
          activeCompany,
          ownerActor,
        ),
      ).rejects.toThrow(ValidationError);

      expect(userRepository.updateRole).not.toHaveBeenCalled();
    });

    it("permite rebaixar um OWNER quando existe outro", async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(
        buildUser({ id: "user-2", role: "OWNER" }),
      );
      vi.mocked(userRepository.countByRole).mockResolvedValueOnce(2);

      await service.updateMemberRole(
        { userId: "user-2", role: "ADMIN" },
        activeCompany,
        ownerActor,
      );

      expect(userRepository.updateRole).toHaveBeenCalledWith(
        "user-2",
        "company-1",
        "ADMIN",
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "PERMISSION_CHANGE", resource: "user" }),
      );
    });

    it("permite OWNER promover MEMBER a OWNER", async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(
        buildUser({ id: "user-2", role: "MEMBER" }),
      );

      await service.updateMemberRole(
        { userId: "user-2", role: "OWNER" },
        activeCompany,
        ownerActor,
      );

      expect(userRepository.updateRole).toHaveBeenCalledWith(
        "user-2",
        "company-1",
        "OWNER",
      );
    });

    it("permite ADMIN alterar papel de outro MEMBER/ADMIN", async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(
        buildUser({ id: "user-2", role: "MEMBER" }),
      );

      await service.updateMemberRole(
        { userId: "user-2", role: "ADMIN" },
        activeCompany,
        adminActor,
      );

      expect(userRepository.updateRole).toHaveBeenCalledWith(
        "user-2",
        "company-1",
        "ADMIN",
      );
    });
  });

  describe("removeMember", () => {
    const ownerActor = { id: "owner-1", role: "OWNER" as const };
    const adminActor = { id: "admin-1", role: "ADMIN" as const };

    it("rejeita remover a si mesmo", async () => {
      await expect(
        service.removeMember("owner-1", activeCompany, ownerActor),
      ).rejects.toThrow(ForbiddenError);

      expect(userRepository.softDelete).not.toHaveBeenCalled();
    });

    it("rejeita ADMIN removendo um OWNER", async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(
        buildUser({ role: "OWNER" }),
      );

      await expect(
        service.removeMember("user-2", activeCompany, adminActor),
      ).rejects.toThrow(ForbiddenError);
    });

    it("rejeita remover o último OWNER", async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(
        buildUser({ id: "user-2", role: "OWNER" }),
      );
      vi.mocked(userRepository.countByRole).mockResolvedValueOnce(1);

      await expect(
        service.removeMember("user-2", activeCompany, ownerActor),
      ).rejects.toThrow(ValidationError);

      expect(userRepository.softDelete).not.toHaveBeenCalled();
    });

    it("remove um MEMBER normalmente e registra auditoria", async () => {
      vi.mocked(userRepository.findById).mockResolvedValueOnce(
        buildUser({ id: "user-2", role: "MEMBER" }),
      );

      await service.removeMember("user-2", activeCompany, ownerActor);

      expect(userRepository.softDelete).toHaveBeenCalledWith("user-2", "company-1");
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DELETE",
          resource: "user",
          resourceId: "user-2",
        }),
      );
    });
  });

  describe("getInvitationPreview", () => {
    it("retorna null para token inválido ou expirado", async () => {
      vi.mocked(invitationRepository.findByTokenWithCompany).mockResolvedValueOnce(null);
      expect(await service.getInvitationPreview("bad-token")).toBeNull();

      vi.mocked(invitationRepository.findByTokenWithCompany).mockResolvedValueOnce({
        ...buildInvitation({ expiresAt: new Date(Date.now() - 1000) }),
        company: { name: "Empresa X" },
      });
      expect(await service.getInvitationPreview("expired-token")).toBeNull();
    });

    it("retorna os dados do convite quando o token é válido", async () => {
      vi.mocked(invitationRepository.findByTokenWithCompany).mockResolvedValueOnce({
        ...buildInvitation({ role: "ADMIN" }),
        company: { name: "Empresa X" },
      });

      expect(await service.getInvitationPreview("token-123")).toEqual({
        email: "convidado@teste.com",
        companyName: "Empresa X",
        role: "ADMIN",
      });
    });
  });
});
