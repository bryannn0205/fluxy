import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";
import { decideNavigation, temMarcaDeSessaoExpirada } from "@/lib/navigation";

// Usa a config edge-safe (sem Prisma/adapter/argon2) — o middleware roda em
// Edge Runtime, que não suporta APIs de Node.js nem binários nativos.
// A verificação aqui só precisa decodificar o JWT já existente; a config
// completa (lib/auth.ts) fica para Server Components e API routes.
const { auth } = NextAuth(authConfig);

// A REGRA vive em lib/navigation.ts, pura e testada. O que sobra aqui é o
// acoplamento com o runtime: ler o JWT, montar a URL absoluta, responder.
// Separado assim, a decisão pode ser exercitada em todas as combinações sem
// subir um servidor de Edge.
export default auth((request) => {
  const decisao = decideNavigation({
    pathname: request.nextUrl.pathname,
    isLoggedIn: !!request.auth,
    hasExpiredSessionMark: temMarcaDeSessaoExpirada(request.nextUrl.searchParams),
  });

  if (decisao.tipo === "redirecionar") {
    return NextResponse.redirect(new URL(decisao.destino, request.nextUrl.origin));
  }

  const response = NextResponse.next();
  response.headers.set("x-request-id", crypto.randomUUID());
  return response;
});

// `/` e `/plans` ficam FORA de propósito: sem entrada no matcher, o middleware
// nem roda para elas, e são públicas por ausência de regra. Incluí-las faria a
// regra "rota pública + sessão → dashboard" impedir um usuário autenticado de
// abrir a landing ou a página de planos. Ver lib/navigation.ts.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
};
