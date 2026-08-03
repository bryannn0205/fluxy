import type { Company, PrismaClient } from "@/lib/generated/prisma/client";
import type {
  CompanyRepository,
  CreateCompanyWithOwnerData,
} from "@/repositories/interfaces/CompanyRepository";

export class PrismaCompanyRepository implements CompanyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Company | null> {
    return this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findByEmail(email: string): Promise<Company | null> {
    return this.prisma.company.findFirst({
      where: { email, deletedAt: null },
    });
  }

  async createWithOwner({
    register,
    passwordHash,
    trialEndsAt,
    planId,
  }: CreateCompanyWithOwnerData): Promise<Company> {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: register.companyName,
          email: register.email,
          trialEndsAt,
          planId,
        },
      });

      await tx.user.create({
        data: {
          companyId: company.id,
          name: register.name,
          email: register.email,
          passwordHash,
          role: "OWNER",
        },
      });

      return company;
    });
  }

  async update(
    id: string,
    data: Partial<Pick<Company, "name" | "phone">>,
  ): Promise<Company> {
    return this.prisma.company.update({ where: { id }, data });
  }

  async incrementOrderNumber(id: string): Promise<number> {
    const company = await this.prisma.company.update({
      where: { id },
      data: { nextOrderNumber: { increment: 1 } },
      select: { nextOrderNumber: true },
    });

    // O número usado no pedido é o valor anterior ao incremento.
    return company.nextOrderNumber - 1;
  }
}
