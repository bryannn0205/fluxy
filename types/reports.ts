/** Um dia do período, já normalizado para horário de Brasília. */
export interface RevenuePoint {
  /** `YYYY-MM-DD` em horário de Brasília. */
  date: string;
  revenue: number;
  orderCount: number;
}

/** Uma linha de ranking (produto ou cliente) dentro do período. */
export interface RankingEntry {
  id: string;
  label: string;
  /** Faturamento acumulado no período, em reais. */
  revenue: number;
  /** Unidades vendidas (produtos) ou nº de pedidos (clientes). */
  count: number;
}

export interface ReportSummary {
  revenue: number;
  orderCount: number;
  /** Zero quando não houve pedidos — evita divisão por zero no consumidor. */
  averageTicket: number;
}

export interface SalesReport {
  summary: ReportSummary;
  /**
   * Um ponto por dia do período, incluindo dias sem venda (`revenue: 0`).
   * Os dias vazios são preenchidos no Service: sem eles o gráfico de linha
   * ligaria os dois dias vizinhos numa reta, desenhando faturamento que não
   * existiu.
   */
  revenueByDay: RevenuePoint[];
  topProducts: RankingEntry[];
  topCustomers: RankingEntry[];
}

/** Períodos oferecidos no filtro do relatório. */
export const REPORT_PERIODS = [7, 30, 90, 365] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const DEFAULT_REPORT_PERIOD: ReportPeriod = 30;

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  7: "7 dias",
  30: "30 dias",
  90: "90 dias",
  365: "12 meses",
};

export function isReportPeriod(value: number): value is ReportPeriod {
  return (REPORT_PERIODS as readonly number[]).includes(value);
}
