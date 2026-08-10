import type { Plan } from "@/lib/generated/prisma/client";

export interface PlanRepository {
  findById(id: string): Promise<Plan | null>;
  findBySlug(slug: string): Promise<Plan | null>;
  /**
   * Planos comercializáveis, na ordem de PUBLIC_PLAN_SLUGS.
   *
   * Devolve só os que existem: um slug da lista sem linha correspondente é
   * omitido, nunca preenchido com valor inventado. Quem chama decide o que
   * fazer com a ausência — ver PlanCatalogService.
   */
  listPublic(): Promise<Plan[]>;
}
