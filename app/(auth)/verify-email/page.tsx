import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { consumeEmailVerificationToken } from "@/lib/tokens";

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { token } = await searchParams;

  const email = token ? await consumeEmailVerificationToken(token) : null;

  if (email) {
    await prisma.user.updateMany({
      where: { email, deletedAt: null },
      data: { emailVerified: new Date() },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificação de e-mail</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 py-4 text-center">
        {email ? (
          <>
            <CheckCircle2 className="size-10 text-emerald-600" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              E-mail verificado com sucesso.
            </p>
          </>
        ) : (
          <>
            <XCircle className="size-10 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Este link é inválido ou expirou.
            </p>
          </>
        )}
        <Link href="/dashboard" className={cn(buttonVariants(), "w-full")}>
          Ir para o painel
        </Link>
      </CardContent>
    </Card>
  );
}
