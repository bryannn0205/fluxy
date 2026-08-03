import type { Plan } from "@/lib/generated/prisma/client";

export interface PlanRepository {
  findBySlug(slug: string): Promise<Plan | null>;
}
