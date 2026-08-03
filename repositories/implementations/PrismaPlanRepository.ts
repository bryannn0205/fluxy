import type { Plan, PrismaClient } from "@/lib/generated/prisma/client";
import type { PlanRepository } from "@/repositories/interfaces/PlanRepository";

export class PrismaPlanRepository implements PlanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySlug(slug: string): Promise<Plan | null> {
    return this.prisma.plan.findUnique({ where: { slug } });
  }
}
