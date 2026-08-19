import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FORGOT_PASSWORD_SENT_PARAM, FORGOT_PASSWORD_SENT_VALUE } from "@/lib/constants";
import { ForgotPasswordForm } from "@/app/(auth)/forgot-password/_components/ForgotPasswordForm";

interface ForgotPasswordPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams;
  // Confirmação para quem enviou sem JavaScript: ali não há o estado local
  // que troca o formulário pela mensagem. O texto é o mesmo que o caminho
  // hidratado mostra — e o mesmo existindo ou não a conta.
  const enviado = params[FORGOT_PASSWORD_SENT_PARAM] === FORGOT_PASSWORD_SENT_VALUE;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>
          Informe seu e-mail e enviaremos um link para redefinir sua senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {enviado ? (
          <p role="status" className="py-6 text-center text-sm text-muted-foreground">
            Se existir uma conta com este e-mail, enviamos um link para redefinir a senha.
          </p>
        ) : (
          <ForgotPasswordForm />
        )}
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Voltar para o login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
