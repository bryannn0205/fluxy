import Link from "next/link";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";
import { teamService } from "@/services";
import { AcceptInviteForm } from "@/app/(auth)/accept-invite/_components/AcceptInviteForm";

interface AcceptInvitePageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function AcceptInvitePage({ searchParams }: AcceptInvitePageProps) {
  const { token } = await searchParams;

  const preview = token ? await teamService.getInvitationPreview(token) : null;

  if (!token || !preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Convite inválido</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Este link de convite é inválido ou expirou. Peça para quem te convidou enviar
            um novo.{" "}
            <Link href="/login" className="font-medium text-foreground underline">
              Ir para o login
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Você foi convidado para {preview.companyName}</CardTitle>
        <CardDescription>
          {preview.email} · {ROLE_LABELS[preview.role]}. Crie sua senha para entrar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInviteForm token={token} />
      </CardContent>
    </Card>
  );
}
