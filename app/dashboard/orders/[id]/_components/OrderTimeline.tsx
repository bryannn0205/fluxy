import { Circle, FileEdit, PackagePlus, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatDateTime } from "@/lib/formatters";
import type { AuditAction } from "@/lib/generated/prisma/client";
import type { OrderWithRelations } from "@/types/orders";

const ACTION_ICONS: Record<AuditAction, LucideIcon> = {
  CREATE: PackagePlus,
  UPDATE: FileEdit,
  DELETE: Trash2,
  LOGIN: Circle,
  LOGOUT: Circle,
  EXPORT: Circle,
  PERMISSION_CHANGE: Circle,
};

type AuditLogEntry = OrderWithRelations["auditLogs"][number];

// changes é Json? no schema — a forma { campo: { before, after } } é uma
// convenção deste código (ver OrderService), não garantida pelo tipo. A
// asserção fica contida aqui, num componente só de leitura/exibição.
function describeChange(auditLog: AuditLogEntry): string {
  if (auditLog.action === "CREATE") return "criou o pedido";
  if (auditLog.action === "DELETE") return "excluiu o pedido";

  const changes = auditLog.changes as unknown as Record<string, unknown> | null;
  if (changes && "status" in changes) return "alterou o status";
  if (
    changes &&
    ("priority" in changes ||
      "paymentMethod" in changes ||
      "expectedDeliveryDate" in changes)
  ) {
    return "atualizou os detalhes do pedido";
  }
  return "atualizou o pedido";
}

export function OrderTimeline({ auditLogs }: { auditLogs: AuditLogEntry[] }) {
  if (auditLogs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
    );
  }

  return (
    <ol className="space-y-4">
      {auditLogs.map((log) => {
        const Icon = ACTION_ICONS[log.action];
        return (
          <li key={log.id} className="flex gap-3">
            <Icon
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="text-sm">
              <p>
                <span className="font-medium">{log.user?.name ?? "Sistema"}</span>{" "}
                {describeChange(log)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(log.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
