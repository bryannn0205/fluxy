import { Flag } from "lucide-react";

import { cn } from "@/lib/utils";
import { ORDER_PRIORITY_LABELS, ORDER_PRIORITY_STYLES } from "@/lib/constants";
import type { OrderPriority } from "@/lib/generated/prisma/client";

export function PriorityBadge({ priority }: { priority: OrderPriority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        ORDER_PRIORITY_STYLES[priority],
      )}
    >
      <Flag className="size-3" aria-hidden="true" />
      {ORDER_PRIORITY_LABELS[priority]}
    </span>
  );
}
