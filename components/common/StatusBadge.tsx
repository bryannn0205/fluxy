import { CheckCircle2, Clock, PackageCheck, PackageSearch, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from "@/lib/constants";
import type { OrderStatus } from "@/lib/generated/prisma/client";

const ORDER_STATUS_ICONS: Record<OrderStatus, LucideIcon> = {
  PENDING: Clock,
  PROCESSING: PackageSearch,
  READY: PackageCheck,
  COMPLETED: CheckCircle2,
  CANCELLED: XCircle,
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const Icon = ORDER_STATUS_ICONS[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        ORDER_STATUS_STYLES[status],
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
