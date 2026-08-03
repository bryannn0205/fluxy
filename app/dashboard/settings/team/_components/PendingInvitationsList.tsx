"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/formatters";
import type { ClientPendingInvitation } from "@/types/team";
import { revokeInvitationAction } from "@/app/dashboard/settings/team/actions";

export function PendingInvitationsList({
  invitations,
}: {
  invitations: ClientPendingInvitation[];
}) {
  const router = useRouter();

  async function handleRevoke(id: string) {
    const result = await revokeInvitationAction(id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Convite cancelado");
    router.refresh();
  }

  if (invitations.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum convite pendente.</p>;
  }

  return (
    <ul className="divide-y">
      {invitations.map((invitation) => (
        <li
          key={invitation.id}
          className="flex items-center justify-between gap-3 py-3 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{invitation.email}</p>
            <p className="text-xs text-muted-foreground">
              Convidado por {invitation.invitedBy.name} · Expira em{" "}
              {formatDate(invitation.expiresAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary">{ROLE_LABELS[invitation.role]}</Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Cancelar convite para ${invitation.email}`}
              onClick={() => void handleRevoke(invitation.id)}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
