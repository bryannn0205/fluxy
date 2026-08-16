import Link from "next/link";
import type { Metadata } from "next";
import { Info } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PlanIntentNotice } from "@/components/common/PlanIntentNotice";
import { env } from "@/lib/env";
import { EXPIRED_SESSION_PARAM, EXPIRED_SESSION_VALUE } from "@/lib/constants";
import { buildRegisterUrl, parsePlanIntent } from "@/lib/plan-intent";
import { LoginForm } from "@/app/(auth)/login/_components/LoginForm";
import { GoogleSignInButton } from "@/app/(auth)/login/_components/GoogleSignInButton";

export const metadata: Metadata = { title: "Entrar" };

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const googleEnabled = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
  const sessionExpired = params[EXPIRED_SESSION_PARAM] === EXPIRED_SESSION_VALUE;

  // Revalidada, como em /register: a página anterior não é fonte confiável.
  const intent = parsePlanIntent({ plan: params.plan, billing: params.billing });

  return (
    // `--card-spacing` comanda o padding e o intervalo entre cabeçalho e
    // conteúdo do Card. O padrão são 16px, apertados para uma tela em que o
    // formulário é o único assunto: 28px no celular, 32px acima.
    <Card className="rounded-[1.375rem] border-border bg-card/95 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.9)] ring-1 ring-[var(--auth-glow)] backdrop-blur-sm [--card-spacing:--spacing(7)] sm:[--card-spacing:--spacing(8)]">
      <CardHeader>
        <h1 className="font-heading text-2xl leading-snug font-semibold tracking-tight">
          Entrar
        </h1>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessionExpired && (
          // O âmbar claro de antes vinha de uma tela de fundo branco; sobre o
          // cartão escuro ele virava um bloco luminoso que puxava a atenção
          // para longe do formulário.
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>Sua sessão não é mais válida. Entre novamente para continuar.</span>
          </div>
        )}

        <PlanIntentNotice intent={intent} />

        <LoginForm intent={intent} />

        {googleEnabled && (
          <>
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">ou</span>
              <Separator className="flex-1" />
            </div>
            <GoogleSignInButton />
          </>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link
            href={buildRegisterUrl(intent)}
            className="font-medium text-[var(--auth-lavender)] underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
          >
            Criar conta grátis
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
