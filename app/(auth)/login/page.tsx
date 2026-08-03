import Link from "next/link";
import { Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { env } from "@/lib/env";
import { EXPIRED_SESSION_PARAM, EXPIRED_SESSION_VALUE } from "@/lib/constants";
import { LoginForm } from "@/app/(auth)/login/_components/LoginForm";
import { GoogleSignInButton } from "@/app/(auth)/login/_components/GoogleSignInButton";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const googleEnabled = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
  const sessionExpired = params[EXPIRED_SESSION_PARAM] === EXPIRED_SESSION_VALUE;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessionExpired && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>Sua sessão não é mais válida. Entre novamente para continuar.</span>
          </div>
        )}

        <LoginForm />

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
            href="/register"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Criar conta grátis
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
