import Link from "next/link";
import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { PlanIntentNotice } from "@/components/common/PlanIntentNotice";
import {
  REGISTER_ERROR_MESSAGE,
  REGISTER_ERROR_PARAM,
  REGISTER_ERROR_VALUE,
  TRIAL_DURATION_DAYS,
} from "@/lib/constants";
import { buildLoginUrl, parsePlanIntent } from "@/lib/plan-intent";
import { RegisterForm } from "@/app/(auth)/register/_components/RegisterForm";

export const metadata: Metadata = { title: "Criar conta" };

interface RegisterPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;

  // Falha de cadastro de quem enviou sem JavaScript: ali não há toast. Só o
  // valor previsto exibe algo, então a query não escreve texto na página.
  const falhouOCadastro = params[REGISTER_ERROR_PARAM] === REGISTER_ERROR_VALUE;

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

        {falhouOCadastro && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {REGISTER_ERROR_MESSAGE}
          </div>
        )}

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
