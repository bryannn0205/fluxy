import type { PrismaClient, Role, User } from "@/lib/generated/prisma/client";
import { NotFoundError } from "@/lib/errors";
import type {
  CreateMemberData,
  UserRepository,
} from "@/repositories/interfaces/UserRepository";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string, companyId: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
  }

  async findByEmailIncludingDeleted(email: string): Promise<User | null> {
    // Sem filtro de deletedAt, de propósito — ver a doc na interface.
    return this.prisma.user.findUnique({ where: { email } });
  }

  async countActive(companyId: string): Promise<number> {
    return this.prisma.user.count({ where: { companyId, deletedAt: null } });
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async updateName(id: string, companyId: string, name: string): Promise<User> {
    const result = await this.prisma.user.updateMany({
      where: { id, companyId },
      data: { name },
    });

    if (result.count === 0) {
      throw new NotFoundError("User");
    }

    const user = await this.findById(id, companyId);
    if (!user) {
      throw new NotFoundError("User");
    }

    return user;
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { emailVerified: new Date() },
    });
  }

  async listByCompany(companyId: string): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  async countByRole(companyId: string, role: Role): Promise<number> {
    return this.prisma.user.count({
      where: { companyId, role, deletedAt: null },
    });
  }

  async createMember(data: CreateMemberData): Promise<User> {
    return this.prisma.user.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
        emailVerified: new Date(),
      },
    });
  }

  async updateRole(id: string, companyId: string, role: Role): Promise<void> {
    const result = await this.prisma.user.updateMany({
      where: { id, companyId },
      data: { role },
    });

    if (result.count === 0) {
      throw new NotFoundError("User");
    }
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    });
  }
}
