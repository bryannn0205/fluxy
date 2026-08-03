import type { Role } from "@/lib/generated/prisma/client";
import { assertPermission } from "@/lib/permissions";
import { startOfDaysAgoBrazil, toBrazilDateKey } from "@/lib/dates";
import { REPORT_RANKING_SIZE } from "@/lib/constants";
import type { ReportRepository } from "@/repositories/interfaces/ReportRepository";
import type { ReportPeriod, RevenuePoint, SalesReport } from "@/types/reports";

export class ReportService {
  constructor(private readonly repository: ReportRepository) {}

  /**
   * Monta o relatório de vendas do período.
   *
   * Não passa pelo SubscriptionGateService: o gate barra escrita, e relatório
   * é leitura pura — mesma regra das outras listagens.
   *
   * Passa, sim, pelo guard de permissão: todo número daqui é dinheiro, e
   * OPERATOR e VIEWER não veem faturamento.
   *
   * @throws {ForbiddenError} Papel sem `reports:viewSales`
   */
  async getSalesReport(
    companyId: string,
    period: ReportPeriod,
    role: Role,
  ): Promise<SalesReport> {
    assertPermission(role, "reports", "viewSales");

    // period - 1: o período inclui hoje, então "30 dias" vai do início do dia
    // de 29 dias atrás até agora. Usar `period` cheio devolveria 31 dias.
    const since = startOfDaysAgoBrazil(period - 1);

    const [summary, revenueRows, topProducts, topCustomers] = await Promise.all([
      this.repository.getSummary(companyId, since),
      this.repository.getRevenueByDay(companyId, since),
      this.repository.getTopProducts(companyId, since, REPORT_RANKING_SIZE),
      this.repository.getTopCustomers(companyId, since, REPORT_RANKING_SIZE),
    ]);

    return {
      summary: {
        revenue: summary.revenue,
        orderCount: summary.orderCount,
        // Ticket médio de zero pedido é zero, não NaN.
        averageTicket:
          summary.orderCount === 0 ? 0 : summary.revenue / summary.orderCount,
      },
      revenueByDay: fillMissingDays(revenueRows, period),
      topProducts,
      topCustomers,
    };
  }
}

/**
 * Devolve um ponto por dia do período, do mais antigo ao mais recente,
 * completando com zero os dias em que não houve venda.
 *
 * Sem isto o gráfico de linha ligaria 10/03 a 14/03 numa reta ascendente,
 * desenhando faturamento nos quatro dias sem venda no meio.
 */
function fillMissingDays(rows: RevenuePoint[], period: number): RevenuePoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));

  return Array.from({ length: period }, (_, index) => {
    const date = toBrazilDateKey(startOfDaysAgoBrazil(period - 1 - index));
    return byDate.get(date) ?? { date, revenue: 0, orderCount: 0 };
  });
}
