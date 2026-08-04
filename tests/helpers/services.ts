import type { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaCompanyRepository } from "@/repositories/implementations/PrismaCompanyRepository";
import { PrismaCustomerRepository } from "@/repositories/implementations/PrismaCustomerRepository";
import { PrismaInvitationRepository } from "@/repositories/implementations/PrismaInvitationRepository";
import { PrismaOrderRepository } from "@/repositories/implementations/PrismaOrderRepository";
import { PrismaProductRepository } from "@/repositories/implementations/PrismaProductRepository";
import { PrismaUserRepository } from "@/repositories/implementations/PrismaUserRepository";
import { PlanLimitService } from "@/services/PlanLimitService";

/**
 * PlanLimitService real, ligado ao banco de teste.
 *
 * Os testes de integração usam o de verdade, não um duplo: a cota depende de
 * contagem no banco e do lock da empresa, e nenhum dos dois existe num mock.
 * Como os planos nascem com limites `null`, ele não barra nada até um teste
 * preencher um teto de propósito.
 */
export function buildPlanLimitService(prisma: PrismaClient): PlanLimitService {
  return new PlanLimitService(
    new PrismaCompanyRepository(prisma),
    new PrismaUserRepository(prisma),
    new PrismaInvitationRepository(prisma),
    new PrismaProductRepository(prisma),
    new PrismaCustomerRepository(prisma),
    new PrismaOrderRepository(prisma),
  );
}
