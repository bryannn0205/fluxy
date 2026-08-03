import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

interface StockQuantityBadgeProps {
  quantity: number;
  lowStockThreshold: number | null;
}

// Ícone + cor, nunca só cor (ver .claude/docs/features/accessibility.md).
// Negativo conta como alerta mesmo sem threshold definido: significa que
// pedidos já consumiram mais do que o estoque tinha, independente de
// qualquer limite configurado.
export function StockQuantityBadge({
  quantity,
  lowStockThreshold,
}: StockQuantityBadgeProps) {
  const isLow =
    quantity < 0 || (lowStockThreshold != null && quantity <= lowStockThreshold);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-sm tabular-nums",
        isLow && "font-medium text-destructive",
      )}
    >
      {isLow && <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />}
      {quantity}
    </span>
  );
}
