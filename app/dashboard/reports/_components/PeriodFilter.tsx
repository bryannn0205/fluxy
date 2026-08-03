import Link from "next/link";

import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { REPORT_PERIODS, REPORT_PERIOD_LABELS, type ReportPeriod } from "@/types/reports";

/**
 * Controle segmentado de período.
 *
 * É Server Component de propósito: com quatro presets fixos, links comuns dão
 * navegação funcional sem JavaScript, URL compartilhável e histórico do
 * navegador de graça — coisas que um `onValueChange` com `router.push` teria
 * que reimplementar.
 */
export function PeriodFilter({ current }: { current: ReportPeriod }) {
  return (
    <div
      className="inline-flex rounded-lg border border-input p-0.5"
      role="group"
      aria-label="Período do relatório"
    >
      {REPORT_PERIODS.map((period) => {
        const isActive = period === current;

        return (
          <Link
            key={period}
            href={`${ROUTES.REPORTS}?period=${period}`}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {REPORT_PERIOD_LABELS[period]}
          </Link>
        );
      })}
    </div>
  );
}
