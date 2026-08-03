import type { Metadata } from "next";
import { ChartLine } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { requireCompany } from "@/lib/session";
import { reportService } from "@/services";
import {
  DEFAULT_REPORT_PERIOD,
  REPORT_PERIOD_LABELS,
  isReportPeriod,
  type ReportPeriod,
} from "@/types/reports";
import { PeriodFilter } from "@/app/dashboard/reports/_components/PeriodFilter";
import { RevenueChart } from "@/app/dashboard/reports/_components/RevenueChart";
import {
  RankingBars,
  ordersLabel,
  unitsLabel,
} from "@/app/dashboard/reports/_components/RankingBars";

export const metadata: Metadata = { title: "Relatórios" };

interface ReportsPageProps {
  searchParams: Promise<{ period?: string }>;
}

/**
 * `period` vem da URL, então é entrada de usuário: qualquer valor fora da lista
 * cai no padrão em vez de virar uma janela arbitrária de dias.
 */
function parsePeriod(raw: string | undefined): ReportPeriod {
  const parsed = Number(raw);
  return isReportPeriod(parsed) ? parsed : DEFAULT_REPORT_PERIOD;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const { period: rawPeriod } = await searchParams;
  const period = parsePeriod(rawPeriod);

  const { companyId, role } = await requireCompany();

  // O guard vive no service e lança ForbiddenError; a página não repete a
  // regra, só passa o papel. Quem não pode ver nem chega aqui — o item some
  // da navegação —, mas quem digitar a URL bate no mesmo portão.
  const report = await reportService.getSalesReport(companyId, period, role);

  const periodLabel = REPORT_PERIOD_LABELS[period].toLowerCase();
  const hasSales = report.summary.orderCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Acompanhe a evolução das vendas da sua empresa."
      />

      <PeriodFilter current={period} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryTile
          label={`Faturamento · ${periodLabel}`}
          value={formatCurrency(report.summary.revenue)}
        />
        <SummaryTile label="Pedidos" value={formatNumber(report.summary.orderCount)} />
        <SummaryTile
          label="Ticket médio"
          value={formatCurrency(report.summary.averageTicket)}
        />
      </div>

      {!hasSales ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={ChartLine}
              title="Sem vendas no período"
              description="Assim que houver pedidos, a evolução do faturamento aparece aqui."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Faturamento por dia</CardTitle>
            </CardHeader>
            <CardContent>
              <RevenueChart points={report.revenueByDay} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  Produtos mais vendidos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankingBars
                  entries={report.topProducts}
                  countLabel={unitsLabel}
                  emptyMessage="Nenhum produto vendido no período."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  Clientes que mais compraram
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankingBars
                  entries={report.topCustomers}
                  countLabel={ordersLabel}
                  emptyMessage="Nenhum cliente com compras no período."
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Sem tabular-nums: em número grande e isolado, dígitos de largura
            igual deixam o valor com espaçamento frouxo. */}
        <p className="font-mono text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
