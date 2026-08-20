import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { authService } from "@/services";
import { loginSchema } from "@/schemas/auth.schema";

const googleProvider =
  env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
    ? [
        Google({
          clientId: env.AUTH_GOOGLE_ID,
          clientSecret: env.AUTH_GOOGLE_SECRET,
          // O e-mail do Google já é verificado pelo próprio Google — permitir
          // vincular a uma conta existente com o mesmo e-mail é seguro aqui,
          // diferente do caso genérico (onde um provedor não verificado
          // poderia sequestrar uma conta alheia).
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : [];

/**
 * Reexportada aqui porque este módulo é o ponto único de contato do projeto
 * com o Auth.js — quem trata o erro do `signIn` acima precisa da classe para
 * reconhecê-lo por `instanceof`, e não por nome (que a minificação reescreve).
 */
export { CredentialsSignin } from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await authService.verifyCredentials(
          parsed.data.email,
          parsed.data.password,
        );
        if (!user) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          companyId: user.companyId,
          role: user.role,
        };
      },
    }),
    ...googleProvider,
  ],
  callbacks: {
    ...authConfig.callbacks,

    // Login social só é aceito para contas que já existem — cadastro cria
    // Company + User (OWNER) juntos via /register, e o adapter do Google
    // sozinho não tem de onde tirar um companyId para um usuário novo.
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      if (!user.email) return false;

      const existing = await prisma.user.findFirst({
        where: { email: user.email, deletedAt: null },
      });

      if (!existing) {
        logger.warn("Tentativa de login via Google sem cadastro prévio", {
          email: user.email,
        });
        return false;
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.companyId = user.companyId as string;
        token.role = user.role as (typeof token)["role"];
      } else if (token.email && !token.companyId) {
        // Primeiro JWT emitido após login via Google: o `user` do adapter
        // não carrega companyId/role, então busca do banco.
        const dbUser = await prisma.user.findFirst({
          where: { email: token.email, deletedAt: null },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.companyId = dbUser.companyId;
          token.role = dbUser.role;
        }
      }

      return token;
    },
  },
});
