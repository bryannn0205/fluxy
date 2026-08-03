import { redirect } from "next/navigation";
import type { Metadata } from "next";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/common/PageHeader";
import { ROUTES } from "@/lib/constants";
import { requireCompany } from "@/lib/session";
import { can } from "@/lib/permissions";
import { teamService } from "@/services";
import { toClientPendingInvitation, toClientTeamMember } from "@/types/team";
import { MembersTable } from "@/app/dashboard/settings/team/_components/MembersTable";
import { PendingInvitationsList } from "@/app/dashboard/settings/team/_components/PendingInvitationsList";
import { InviteMemberDialog } from "@/app/dashboard/settings/team/_components/InviteMemberDialog";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const company = await requireCompany();

  // Gerenciar equipe é ação de OWNER/ADMIN — a mesma regra é aplicada de novo
  // dentro do TeamService, que é o portão de verdade. Aqui é só para não
  // mostrar uma página vazia a quem não deveria chegar nela.
  if (!can(company.role, "team", "view")) {
    redirect(ROUTES.SETTINGS);
  }

  const [rawMembers, rawInvitations] = await Promise.all([
    teamService.listMembers(company.id),
    teamService.listPendingInvitations(company.id),
  ]);

  // User traz passwordHash e Invitation traz o token secreto do link de
  // convite — nenhum dos dois pode cruzar a fronteira Server -> Client
  // Component (viraria payload RSC visível no navegador). Ver types/team.ts.
  const members = rawMembers.map(toClientTeamMember);
  const pendingInvitations = rawInvitations.map(toClientPendingInvitation);

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href={ROUTES.SETTINGS}>Configurações</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Equipe</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="Equipe"
        description="Convide pessoas e gerencie papéis de acesso."
        action={<InviteMemberDialog />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Membros</CardTitle>
          <CardDescription>
            {members.length === 1 ? "1 pessoa" : `${members.length} pessoas`} com acesso a
            esta empresa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MembersTable members={members} currentUserId={company.userId} canManage />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Convites pendentes</CardTitle>
          <CardDescription>Ainda não aceitos — expiram em 7 dias.</CardDescription>
        </CardHeader>
        <CardContent>
          <PendingInvitationsList invitations={pendingInvitations} />
        </CardContent>
      </Card>
    </div>
  );
}
