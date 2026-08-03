import type { NextAuthConfig } from "next-auth";

import { env } from "@/lib/env";

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// Config "edge-safe": usada pelo middleware, que roda no Edge Runtime por
// padrão (sem Node.js APIs). Não pode importar nada que puxe Prisma
// (precisa de node:crypto/node:fs) ou @node-rs/argon2 (binário nativo) —
// mesmo que o código não seja executado, o bundler tenta empacotar tudo
// que é importado no módulo. A config completa (com providers, adapter e
// lógica que toca o banco) vive em lib/auth.ts, usada pelo resto do app,
// que roda em Node.js runtime.
export const authConfig = {
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    session({ session, token }) {
      session.user.id = token.id;
      session.user.companyId = token.companyId;
      session.user.role = token.role;
      return session;
    },
  },
  secret: env.AUTH_SECRET,
  trustHost: true,
} satisfies NextAuthConfig;
