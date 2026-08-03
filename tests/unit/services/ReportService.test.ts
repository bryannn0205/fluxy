import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportService } from "@/services/ReportService";
import type { ReportRepository } from "@/repositories/interfaces/ReportRepository";
import type { RevenuePoint } from "@/types/reports";

function buildRepository(overrides: Partial<ReportRepository> = {}): ReportRepository {
  return {
    getSummary: vi.fn().mockResolvedValue({ revenue: 0, orderCount: 0 }),
    getRevenueByDay: vi.fn().mockResolvedValue([]),
    getTopProducts: vi.fn().mockResolvedValue([]),
    getTopCustomers: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("ReportService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 12:00 em Brasília de 03/08/2026 — bem longe da virada do dia, para que
    // este caso base não dependa da conversão de fuso.
    vi.setSystemTime(new Date("2026-08-03T15:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("janela do período", () => {
    it("inclui hoje, então 7 dias vão de 28/07 a 03/08", async () => {
      const repository = buildRepository();
      const service = new ReportService(repository);

      const report = await service.getSalesReport("company-1", 7, "OWNER");

      expect(report.revenueByDay).toHaveLength(7);
      expect(report.revenueByDay[0]?.date).toBe("2026-07-28");
      expect(report.revenueByDay[6]?.date).toBe("2026-08-03");
    });

    it("consulta o repositório a partir da meia-noite de Brasília, não de 'agora menos N×24h'", async () => {
      const repository = buildRepository();
      const service = new ReportService(repository);

      await service.getSalesReport("company-1", 30, "OWNER");

      // 00:00 de 05/07 em Brasília (UTC-3) é 03:00 UTC do mesmo dia.
      const expectedSince = new Date("2026-07-05T03:00:00Z");
      expect(repository.getSummary).toHaveBeenCalledWith("company-1", expectedSince);
      expect(repository.getRevenueByDay).toHaveBeenCalledWith("company-1", expectedSince);
    });

    it("usa o dia de Brasília quando em UTC já virou a data", async () => {
      // 01:00 UTC de 04/08 ainda é 22:00 de 03/08 no Brasil. Se o corte usasse
      // UTC, o relatório mostraria um dia 04/08 que ainda não começou para o
      // usuário, e descartaria o começo do período.
      vi.setSystemTime(new Date("2026-08-04T01:00:00Z"));

      const service = new ReportService(buildRepository());
      const report = await service.getSalesReport("company-1", 7, "OWNER");

      expect(report.revenueByDay.at(-1)?.date).toBe("2026-08-03");
      expect(report.revenueByDay[0]?.date).toBe("2026-07-28");
    });
  });

  describe("preenchimento de dias sem venda", () => {
    it("insere zero nos dias ausentes, preservando a ordem cronológica", async () => {
      const rows: RevenuePoint[] = [
        { date: "2026-07-30", revenue: 150, orderCount: 2 },
        { date: "2026-08-02", revenue: 80, orderCount: 1 },
      ];
      const service = new ReportService(
        buildRepository({ getRevenueByDay: vi.fn().mockResolvedValue(rows) }),
      );

      const report = await service.getSalesReport("company-1", 7, "OWNER");

      expect(report.revenueByDay.map((point) => point.date)).toEqual([
        "2026-07-28",
        "2026-07-29",
        "2026-07-30",
        "2026-07-31",
        "2026-08-01",
        "2026-08-02",
        "2026-08-03",
      ]);
      expect(report.revenueByDay.map((point) => point.revenue)).toEqual([
        0, 0, 150, 0, 0, 80, 0,
      ]);
      expect(report.revenueByDay[2]?.orderCount).toBe(2);
      expect(report.revenueByDay[3]?.orderCount).toBe(0);
    });

    it("ignora linhas fora da janela em vez de deslocar a série", async () => {
      const rows: RevenuePoint[] = [{ date: "2020-01-01", revenue: 999, orderCount: 9 }];
      const service = new ReportService(
        buildRepository({ getRevenueByDay: vi.fn().mockResolvedValue(rows) }),
      );

      const report = await service.getSalesReport("company-1", 7, "OWNER");

      expect(report.revenueByDay).toHaveLength(7);
      expect(report.revenueByDay.every((point) => point.revenue === 0)).toBe(true);
    });
  });

  describe("ticket médio", () => {
    it("é zero — não NaN — quando não houve pedidos", async () => {
      const service = new ReportService(
        buildRepository({
          getSummary: vi.fn().mockResolvedValue({ revenue: 0, orderCount: 0 }),
        }),
      );

      const report = await service.getSalesReport("company-1", 30, "OWNER");

      expect(report.summary.averageTicket).toBe(0);
      expect(Number.isNaN(report.summary.averageTicket)).toBe(false);
    });

    it("divide faturamento por número de pedidos", async () => {
      const service = new ReportService(
        buildRepository({
          getSummary: vi.fn().mockResolvedValue({ revenue: 1250, orderCount: 5 }),
        }),
      );

      const report = await service.getSalesReport("company-1", 30, "OWNER");

      expect(report.summary.averageTicket).toBe(250);
    });
  });

  it("repassa companyId a todas as consultas — nenhum agregado escapa do filtro de tenant", async () => {
    const repository = buildRepository();
    const service = new ReportService(repository);

    await service.getSalesReport("company-42", 90, "OWNER");

    for (const query of [
      repository.getSummary,
      repository.getRevenueByDay,
      repository.getTopProducts,
      repository.getTopCustomers,
    ]) {
      const [companyId, since] = vi.mocked(query).mock.calls[0] ?? [];
      expect(companyId).toBe("company-42");
      expect(since).toBeInstanceOf(Date);
    }
  });
});
