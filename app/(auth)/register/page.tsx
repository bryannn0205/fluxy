import Link from "next/link";
import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { PlanIntentNotice } from "@/components/common/PlanIntentNotice";
import { TRIAL_DURATION_DAYS } from "@/lib/constants";
import { buildLoginUrl, parsePlanIntent } from "@/lib/plan-intent";
import { RegisterForm } from "@/app/(auth)/register/_components/RegisterForm";

export const metadata: Metadata = { title: "Criar conta" };

interface RegisterPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;

  // Revalidada aqui, mesmo tendo passado por /plans. A página anterior não é
  // uma fonte confiável: entre uma e outra está a barra de endereços. Qualquer
  // coisa fora dos quatro pares válidos vira null e o cadastro segue sem
  // intenção — nunca com uma inventada.
  const intent = parsePlanIntent({ plan: params.plan, billing: params.billing });

  return (
    <Card>
      <CardHeader>
        {/* h1 explícito: CardTitle renderiza uma div, e esta é uma página
            autônoma — precisa do seu próprio título de primeiro nível. */}
        <h1 className="font-heading text-xl leading-snug font-semibold tracking-tight">
          Criar conta
        </h1>
        <CardDescription>
          {TRIAL_DURATION_DAYS} dias grátis para conhecer o Fluxy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PlanIntentNotice intent={intent} />

        <RegisterForm intent={intent} />

        <p className="text-center text-sm text-muted-foreground">
          Já tem uma conta?{" "}
          <Link
            href={buildLoginUrl(intent)}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
