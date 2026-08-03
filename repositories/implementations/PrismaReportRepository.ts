import type { PrismaClient } from "@/lib/generated/prisma/client";
import type {
  ReportRepository,
  ReportSummaryRow,
} from "@/repositories/interfaces/ReportRepository";
import type { RankingEntry, RevenuePoint } from "@/types/reports";

/**
 * Recorte comum a todos os agregados: só pedidos vivos, não cancelados, do
 * período. Extraído para que nenhum dos quatro métodos possa divergir dos
 * outros e produzir números que não fecham entre si.
 */
function periodScope(companyId: string, since: Date) {
  return {
    companyId,
    deletedAt: null,
    status: { not: "CANCELLED" },
    createdAt: { gte: since },
  } as const;
}

interface RevenueByDayRow {
  day: string;
  revenue: string;
  orders: bigint;
}

export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(companyId: string, since: Date): Promise<ReportSummaryRow> {
    const agg = await this.prisma.order.aggregate({
      where: periodScope(companyId, since),
      _sum: { total: true },
      _count: true,
    });

    return {
      revenue: Number(agg._sum.total ?? 0),
      orderCount: agg._count,
    };
  }

  /**
   * Única query em SQL cru do projeto, e por um motivo concreto: o Prisma não
   * sabe truncar data dentro de um `groupBy`. A alternativa em Prisma puro
   * seria trazer todos os pedidos do período para agrupar em JS — 365 dias de
   * uma empresa movimentada são dezenas de milhares de linhas carregadas para
   * produzir 365 números. Aqui o banco devolve uma linha por dia.
   *
   * `companyId` e `since` são interpolados pela template tag do Prisma, que os
   * envia como parâmetros do statement — não há concatenação de string, logo
   * não há superfície de injeção.
   *
   * O `- INTERVAL '3 hours'` replica o offset fixo de lib/dates.ts em vez de
   * usar `AT TIME ZONE 'America/Sao_Paulo'`: o resto do sistema assume UTC-3
   * sem horário de verão, e deixar o banco aplicar a tz database faria os
   * limites de dia divergirem dos do restante do app em datas históricas
   * anteriores a 2019.
   */
  async getRevenueByDay(companyId: string, since: Date): Promise<RevenuePoint[]> {
    const rows = await this.prisma.$queryRaw<RevenueByDayRow[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('day', "createdAt" - INTERVAL '3 hours'), 'YYYY-MM-DD') AS day,
        SUM("total")::text AS revenue,
        COUNT(*) AS orders
      FROM "Order"
      WHERE "companyId" = ${companyId}
        AND "deletedAt" IS NULL
        AND "status"::text <> 'CANCELLED'
        AND "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day
    `;

    return rows.map((row) => ({
      date: row.day,
      revenue: Number(row.revenue),
      orderCount: Number(row.orders),
    }));
  }

  /**
   * Agrupa por `productId`, não por `productName`. O nome gravado no item é um
   * snapshot da venda, então agrupar por ele quebraria o ranking de um produto
   * em duas linhas assim que alguém o renomeasse. O nome exibido vem do
   * cadastro atual — mesma entidade, nome de hoje.
   */
  async getTopProducts(
    companyId: string,
    since: Date,
    limit: number,
  ): Promise<RankingEntry[]> {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ["productId"],
      where: { companyId, order: periodScope(companyId, since) },
      _sum: { total: true, quantity: true },
      orderBy: { _sum: { total: "desc" } },
      take: limit,
    });

    if (grouped.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) }, companyId },
      select: { id: true, name: true },
    });
    const nameById = new Map(products.map((p) => [p.id, p.name]));

    return grouped.map((g) => ({
      id: g.productId,
      label: nameById.get(g.productId) ?? "Produto removido",
      revenue: Number(g._sum.total ?? 0),
      count: g._sum.quantity ?? 0,
    }));
  }

  async getTopCustomers(
    companyId: string,
    since: Date,
    limit: number,
  ): Promise<RankingEntry[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ["customerId"],
      where: periodScope(companyId, since),
      _sum: { total: true },
      _count: true,
      orderBy: { _sum: { total: "desc" } },
      take: limit,
    });

    if (grouped.length === 0) return [];

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: grouped.map((g) => g.customerId) }, companyId },
      select: { id: true, name: true },
    });
    const nameById = new Map(customers.map((c) => [c.id, c.name]));

    return grouped.map((g) => ({
      id: g.customerId,
      label: nameById.get(g.customerId) ?? "Cliente removido",
      revenue: Number(g._sum.total ?? 0),
      count: g._count,
    }));
  }
}
