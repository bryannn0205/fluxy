import { prisma } from "@/lib/db";
import type { Company, Role } from "@/lib/generated/prisma/client";

// Separado de lib/session.ts de propósito: aqui vive só a resolução contra o
// banco, sem tocar em next-auth. É este arquivo que decide acesso e papel a
// cada request, então precisa ser testável isoladamente — importar
// lib/session.ts num teste puxaria next-auth junto (e com ele `next/server`,
// que não resolve fora do runtime do Next). Mesma motivação do split
// auth.ts / auth.config.ts.

export interface AuthenticatedSession {
  userId: string;
  companyId: string;
  role: Role;
}

export type CompanySession = Company & AuthenticatedSession;

/**
 * Resolve a sessão contra o BANCO, não apenas contra o JWT.
 *
 * O token guarda companyId e role no momento do login e vale por até 7 dias.
 * Sozinho ele não percebe que o usuário foi removido da equipe, que teve o
 * papel alterado, ou que a empresa deixou de existir — reler User + Company a
 * cada request faz remoção e troca de papel valerem na hora, em vez de só
 * quando o token expirar.
 *
 * @returns null quando o token não corresponde mais a um usuário ativo.
 */
export async function resolveCompanySession(
  userId: string,
  companyId: string,
): Promise<CompanySession | null> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      // Amarra o usuário à empresa do token: se o companyId do token não
      // bater com o vínculo real do usuário, nada resolve.
      companyId,
      deletedAt: null,
    },
    select: { id: true, role: true, company: true },
  });

  if (!user || user.company.deletedAt) return null;

  // role sai do banco, nunca do token.
  return {
    ...user.company,
    userId: user.id,
    companyId: user.company.id,
    role: user.role,
  };
}
