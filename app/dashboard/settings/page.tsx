import Link from "next/link";
import type { Metadata } from "next";
import { Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/formatters";
import { ROUTES } from "@/lib/constants";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { ProfileForm } from "@/app/dashboard/settings/_components/ProfileForm";
import { CompanyForm } from "@/app/dashboard/settings/_components/CompanyForm";

export const metadata: Metadata = { title: "Configurações" };

const SUBSCRIPTION_LABELS: Record<string, string> = {
  TRIALING: "Em teste grátis",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento pendente",
  CANCELED: "Cancelada",
  EXPIRED: "Expirada",
};

export default async function SettingsPage() {
  const company = await requireCompany();
  const session = await auth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie seu perfil e sua empresa."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Perfil</CardTitle>
            <CardDescription>Seus dados pessoais.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              name={session?.user?.name ?? ""}
              email={session?.user?.email ?? ""}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Empresa</CardTitle>
            <CardDescription>Dados da sua empresa no Fluxy.</CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyForm name={company.name} phone={company.phone} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Assinatura</CardTitle>
            <CardDescription>Status do seu plano no Fluxy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge
                variant={
                  company.subscriptionStatus === "ACTIVE" ? "default" : "secondary"
                }
              >
                {SUBSCRIPTION_LABELS[company.subscriptionStatus]}
              </Badge>
            </div>
            {company.subscriptionStatus === "TRIALING" && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Teste grátis até</span>
                <span>{formatDate(company.trialEndsAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {can(company.role, "team", "view") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Equipe</CardTitle>
              <CardDescription>
                Convide pessoas e gerencie papéis de acesso.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={ROUTES.TEAM} className={buttonVariants({ variant: "outline" })}>
                <Users className="size-4" aria-hidden="true" />
                Gerenciar equipe
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
