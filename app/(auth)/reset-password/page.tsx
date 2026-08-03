import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "@/app/(auth)/reset-password/_components/ResetPasswordForm";

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Redefinir senha</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Link inválido.{" "}
            <Link
              href="/forgot-password"
              className="font-medium text-foreground underline"
            >
              Solicite um novo
            </Link>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
