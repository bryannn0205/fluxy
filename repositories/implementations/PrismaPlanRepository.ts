import type { Plan, PrismaClient } from "@/lib/generated/prisma/client";
import { PUBLIC_PLAN_SLUGS } from "@/lib/constants";
import type { PlanRepository } from "@/repositories/interfaces/PlanRepository";

export class PrismaPlanRepository implements PlanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySlug(slug: string): Promise<Plan | null> {
    return this.prisma.plan.findUnique({ where: { slug } });
  }

  async listPublic(): Promise<Plan[]> {
    const encontrados = await this.prisma.plan.findMany({
      where: { slug: { in: [...PUBLIC_PLAN_SLUGS] } },
    });

    // Percorrer a lista canônica — em vez de ordenar o resultado do banco —
    // resolve as duas exigências de uma vez e sem `orderBy` possível:
    // a ordem sai correta por construção, e um plano que não esteja na lista
    // não tem por onde entrar, mesmo que alguém o crie no banco com um slug
    // parecido. O Postgres não sabe ordenar por posição num array, e ordenar
    // por nome ou preço faria o posicionamento comercial depender de dado.
    return PUBLIC_PLAN_SLUGS.map((slug) =>
      encontrados.find((plano) => plano.slug === slug),
    ).filter((plano): plano is Plan => plano !== undefined);
  }
}
