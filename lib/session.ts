import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { EXPIRED_SESSION_LOGIN_URL } from "@/lib/constants";
import { UnauthorizedError } from "@/lib/errors";
import { resolveCompanySession } from "@/lib/session-resolver";
import type { CompanySession } from "@/lib/session-resolver";

export type { AuthenticatedSession, CompanySession } from "@/lib/session-resolver";

async function resolveSession(): Promise<CompanySession | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.companyId) return null;

  return resolveCompanySession(session.user.id, session.user.companyId);
}

/**
 * Para Server Components e Server Actions.
 *
 * Manda para o login quando a sessão não é mais resolvível, em vez de lançar
 * erro: sessão órfã não é falha da página, é sessão que precisa ser refeita.
 * Lançando, o usuário via "Algo deu errado" em todas as telas, sem nenhuma
 * saída além de limpar cookies na mão.
 */
export async function requireCompany(): Promise<CompanySession> {
  const resolved = await resolveSession();
  if (!resolved) {
    redirect(EXPIRED_SESSION_LOGIN_URL);
  }
  return resolved;
}

/**
 * Para Route Handlers, onde redirecionar para uma página HTML não faz sentido
 * — quem chama espera JSON. Lança UnauthorizedError, que handleApiError
 * converte em 401.
 */
export async function requireCompanyForApi(): Promise<CompanySession> {
  const resolved = await resolveSession();
  if (!resolved) {
    throw new UnauthorizedError();
  }
  return resolved;
}
