import { randomUUID } from "crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaUserRepository } from "@/repositories/implementations/PrismaUserRepository";
import { PrismaInvitationRepository } from "@/repositories/implementations/PrismaInvitationRepository";
import { AuditService } from "@/services/AuditService";
import { SubscriptionGateService } from "@/services/SubscriptionGateService";
import { TeamService } from "@/services/TeamService";
import type { Company } from "@/lib/generated/prisma/client";

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  teamInviteEmail: vi.fn().mockReturnValue("<p>convite</p>"),
}));

import { createTestPrismaClient } from "../helpers/prisma";

const prisma = createTestPrismaClient();

const userRepository = prisma ? new PrismaUserRepository(prisma) : null;
const invitationRepository = prisma ? new PrismaInvitationRepository(prisma) : null;
const auditService = prisma ? new AuditService(prisma) : null;
const subscriptionGate = new SubscriptionGateService();

const teamService =
  userRepository && invitationRepository && auditService
    ? new TeamService(
        userRepository,
        invitationRepository,
        auditService,
        subscriptionGate,
      )
    : null;

// Convites cruzam a fronteira anônima (aceite não tem sessão) e têm uma
// constraint real no banco (@@unique([companyId, email])) — precisa de
// Postgres de verdade, não mock. Ver .claude/docs/development/testing.md.
describe.skipIf(!prisma)("Convites de equipe", () => {
  let companyA: Company;
  let companyB: Company;
  let ownerAId: string;
  let ownerBId: string;

  beforeAll(async () => {
    if (!prisma) return;

    const suffix = randomUUID().slice(0, 8);

    companyA = await prisma.company.create({
      data: {
        name: `Equipe A ${suffix}`,
        email: `equipe-a-${suffix}@teste.com`,
        trialEndsAt: new Date(Date.now() + 86_400_000),
        subscriptionStatus: "ACTIVE",
      },
    });

    companyB = await prisma.company.create({
      data: {
        name: `Equipe B ${suffix}`,
        email: `equipe-b-${suffix}@teste.com`,
        trialEndsAt: new Date(Date.now() + 86_400_000),
        subscriptionStatus: "ACTIVE",
      },
    });

    const ownerA = await prisma.user.create({
      data: {
        companyId: companyA.id,
        name: "Dona A",
        email: `dona-a-${suffix}@teste.com`,
        role: "OWNER",
      },
    });
    ownerAId = ownerA.id;

    const ownerB = await prisma.user.create({
      data: {
        companyId: companyB.id,
        name: "Dona B",
        email: `dona-b-${suffix}@teste.com`,
        role: "OWNER",
      },
    });
    ownerBId = ownerB.id;
  });

  afterAll(async () => {
    if (!prisma) return;

    await prisma.invitation.deleteMany({
      where: { companyId: { in: [companyA.id, companyB.id] } },
    });
    await prisma.auditLog.deleteMany({
      where: { companyId: { in: [companyA.id, companyB.id] } },
    });
    await prisma.user.deleteMany({
      where: { companyId: { in: [companyA.id, companyB.id] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyA.id, companyB.id] } },
    });
    await prisma.$disconnect();
  });

  it("não permite revogar convite de outra empresa", async () => {
    const suffix = randomUUID().slice(0, 8);
    await teamService!.invite(
      { email: `alvo-${suffix}@teste.com`, role: "MEMBER" },
      companyB,
      { id: ownerBId, role: "OWNER" },
    );

    const [invitationB] = await teamService!.listPendingInvitations(companyB.id);
    expect(invitationB).toBeDefined();

    // revokeInvite filtra por companyId — chamar com companyA não deve
    // conseguir apagar o convite de B, mesmo passando o id certo.
    await teamService!.revokeInvite(invitationB!.id, companyA, {
      id: ownerAId,
      role: "OWNER",
    });

    const stillPending = await teamService!.listPendingInvitations(companyB.id);
    expect(stillPending.some((invitation) => invitation.id === invitationB!.id)).toBe(
      true,
    );
  });

  it("não lista convites pendentes de outra empresa", async () => {
    const pendingForA = await teamService!.listPendingInvitations(companyA.id);
    expect(pendingForA).toHaveLength(0);
  });

  it("reenviar convite para o mesmo e-mail renova em vez de duplicar", async () => {
    const suffix = randomUUID().slice(0, 8);
    const email = `renovar-${suffix}@teste.com`;
    const actor = { id: ownerAId, role: "OWNER" as const };

    await teamService!.invite({ email, role: "MEMBER" }, companyA, actor);
    const [first] = await teamService!.listPendingInvitations(companyA.id);
    const firstToken = (await prisma!.invitation.findUnique({
      where: { id: first!.id },
    }))!.token;

    await teamService!.invite({ email, role: "ADMIN" }, companyA, actor);

    const afterSecondInvite = await prisma!.invitation.findMany({
      where: { companyId: companyA.id, email },
    });

    expect(afterSecondInvite).toHaveLength(1);
    expect(afterSecondInvite[0]!.role).toBe("ADMIN");
    expect(afterSecondInvite[0]!.token).not.toBe(firstToken);
  });

  it("aceitar convite cria o usuário na empresa certa, com o papel certo, e consome o convite", async () => {
    const suffix = randomUUID().slice(0, 8);
    const email = `aceite-${suffix}@teste.com`;

    await teamService!.invite({ email, role: "ADMIN" }, companyA, {
      id: ownerAId,
      role: "OWNER",
    });

    const preview = await prisma!.invitation.findFirstOrThrow({
      where: { companyId: companyA.id, email },
    });

    const result = await teamService!.acceptInvite({
      token: preview.token,
      name: "Convidado Aceito",
      password: "Senha@123",
    });

    expect(result).toEqual({ companyId: companyA.id, email });

    const createdUser = await prisma!.user.findUniqueOrThrow({ where: { email } });
    expect(createdUser.companyId).toBe(companyA.id);
    expect(createdUser.role).toBe("ADMIN");
    expect(createdUser.passwordHash).not.toBeNull();

    const consumedInvitation = await prisma!.invitation.findUnique({
      where: { id: preview.id },
    });
    expect(consumedInvitation).toBeNull();

    await prisma!.user.deleteMany({ where: { email } });
  });
});
