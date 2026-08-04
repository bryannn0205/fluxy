import { describe, expect, it } from "vitest";

import { fitsWithinLimit, limitFor } from "@/lib/plan-limits";
import type { Plan } from "@/lib/generated/prisma/client";

function buildPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan-1",
    slug: "standard",
    name: "Padrão",
    priceMonthly: { toString: () => "99" } as Plan["priceMonthly"],
    priceYearly: { toString: () => "990" } as Plan["priceYearly"],
    modules: [],
    maxUsers: null,
    maxOrdersPerMonth: null,
    maxProducts: null,
    maxCustomers: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("leitura do teto", () => {
  it("null é ilimitado", () => {
    expect(limitFor(buildPlan({ maxUsers: null }), "users")).toBeNull();
  });

  it("zero é um teto legítimo, não ausência de teto", () => {
    // A distinção importa: `0` bloqueia o recurso, `null` libera. Um `??` mal
    // colocado transformaria "bloqueado" em "ilimitado" — a falha mais cara
    // possível num controle de cota.
    expect(limitFor(buildPlan({ maxProducts: 0 }), "products")).toBe(0);
  });

  it("lê o valor positivo", () => {
    expect(limitFor(buildPlan({ maxCustomers: 2000 }), "customers")).toBe(2000);
  });

  // Durante o trial não há Plan vinculado. Travar quem está avaliando o
  // produto seria o oposto do que o trial existe para fazer.
  it("empresa sem plano é ilimitada", () => {
    expect(limitFor(null, "users")).toBeNull();
    expect(limitFor(null, "ordersPerMonth")).toBeNull();
  });
});

describe("cabe mais um?", () => {
  it("sempre cabe quando o teto é null", () => {
    expect(fitsWithinLimit(999_999, null)).toBe(true);
  });

  it("um abaixo do teto cabe", () => {
    expect(fitsWithinLimit(4, 5)).toBe(true);
  });

  it("exatamente no teto cabe", () => {
    expect(fitsWithinLimit(5, 5)).toBe(true);
  });

  it("um acima do teto não cabe", () => {
    expect(fitsWithinLimit(6, 5)).toBe(false);
  });

  it("teto zero bloqueia até o primeiro", () => {
    expect(fitsWithinLimit(1, 0)).toBe(false);
    expect(fitsWithinLimit(0, 0)).toBe(true);
  });
});
