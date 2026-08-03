import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";
import { EXPIRED_SESSION_PARAM, EXPIRED_SESSION_VALUE } from "@/lib/constants";

// Usa a config edge-safe (sem Prisma/adapter/argon2) — o middleware roda em
// Edge Runtime, que não suporta APIs de Node.js nem binários nativos.
// A verificação aqui só precisa decodificar o JWT já existente; a config
// completa (lib/auth.ts) fica para Server Components e API routes.
const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

export default auth((request) => {
  const isLoggedIn = !!request.auth;
  const { pathname } = request.nextUrl;

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  const isDashboardRoute = pathname.startsWith("/dashboard");

  if (isDashboardRoute && !isLoggedIn) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // O middleware roda no Edge e só consegue conferir se existe um JWT válido —
  // não tem como saber se ele ainda corresponde a um usuário ativo (isso exige
  // banco, e requireCompany() faz essa checagem). Quando requireCompany()
  // detecta uma sessão órfã, ele manda para o login com esta marca; sem a
  // exceção abaixo, o `isLoggedIn` ainda seria true e a pessoa voltaria para o
  // dashboard num laço infinito.
  const isExpiredSessionRedirect =
    request.nextUrl.searchParams.get(EXPIRED_SESSION_PARAM) === EXPIRED_SESSION_VALUE;

  if (isPublicRoute && isLoggedIn && !isExpiredSessionRedirect) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  }

  const response = NextResponse.next();
  response.headers.set("x-request-id", crypto.randomUUID());
  return response;
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ],
};
