"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/formatters";
import type { Role } from "@/lib/generated/prisma/client";
import type { ClientTeamMember } from "@/types/team";
import {
  removeMemberAction,
  updateMemberRoleAction,
} from "@/app/dashboard/settings/team/actions";

const ROLE_OPTIONS: Role[] = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "OPERATOR",
  "FINANCE",
  "VIEWER",
];

interface MembersTableProps {
  members: ClientTeamMember[];
  currentUserId: string;
  canManage: boolean;
}

export function MembersTable({ members, currentUserId, canManage }: MembersTableProps) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRoleChange(userId: string, role: Role) {
    const result = await updateMemberRoleAction({ userId, role });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Papel atualizado");
    router.refresh();
  }

  async function handleRemove(userId: string) {
    const result = await removeMemberAction(userId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Membro removido");
    router.refresh();
  }

  const removingMember = members.find((member) => member.id === removingId);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead className="hidden lg:table-cell">Desde</TableHead>
            {canManage && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const isSelf = member.id === currentUserId;

            return (
              <TableRow key={member.id} className="h-12">
                <TableCell className="font-medium">
                  {member.name}{" "}
                  {isSelf && <span className="text-muted-foreground">(você)</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">{member.email}</TableCell>
                <TableCell>
                  <Badge variant={member.role === "OWNER" ? "default" : "secondary"}>
                    {ROLE_LABELS[member.role]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {formatDate(member.createdAt)}
                </TableCell>
                {canManage && (
                  <TableCell>
                    {!isSelf && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Ações para ${member.name}`}
                            >
                              <MoreHorizontal className="size-4" aria-hidden="true" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel>Alterar papel</DropdownMenuLabel>
                            {ROLE_OPTIONS.filter((role) => role !== member.role).map(
                              (role) => (
                                <DropdownMenuItem
                                  key={role}
                                  onClick={() => void handleRoleChange(member.id, role)}
                                >
                                  {ROLE_LABELS[role]}
                                </DropdownMenuItem>
                              ),
                            )}
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setRemovingId(member.id)}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                            Remover da equipe
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={removingId !== null}
        onOpenChange={(open) => !open && setRemovingId(null)}
        title={`Remover ${removingMember?.name}?`}
        description="A pessoa perde acesso imediatamente. Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        onConfirm={async () => {
          if (removingId) await handleRemove(removingId);
        }}
      />
    </div>
  );
}
