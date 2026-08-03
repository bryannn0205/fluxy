import type { RankingEntry, RevenuePoint } from "@/types/reports";

export interface ReportSummaryRow {
  revenue: number;
  orderCount: number;
}

/**
 * Leituras agregadas para a página de Relatórios.
 *
 * Fica separado do OrderRepository porque é um concern só de leitura, que
 * cruza Order e OrderItem e não participa de nenhuma transação de escrita —
 * misturá-lo ali engordaria um arquivo já grande com queries que nenhuma
 * regra de negócio de pedido usa.
 *
 * Todo método recebe `companyId` e filtra por ele. Pedidos CANCELLED e
 * soft-deleted ficam fora de todos os agregados: não são faturamento.
 */
export interface ReportRepository {
  /** Totais exatos do período (Decimal do Prisma, sem passar por float). */
  getSummary(companyId: string, since: Date): Promise<ReportSummaryRow>;
  /**
   * Faturamento por dia, agrupado em horário de Brasília.
   * Retorna **apenas dias com pedidos** — quem consome precisa preencher os
   * buracos (ver SalesReport.revenueByDay).
   */
  getRevenueByDay(companyId: string, since: Date): Promise<RevenuePoint[]>;
  getTopProducts(companyId: string, since: Date, limit: number): Promise<RankingEntry[]>;
  getTopCustomers(companyId: string, since: Date, limit: number): Promise<RankingEntry[]>;
}
