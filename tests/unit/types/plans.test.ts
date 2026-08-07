import { describe, expect, it } from "vitest";

import { Prisma, type Plan } from "@/lib/generated/prisma/client";
import { toPublicPlan } from "@/types/plans";

const CHAVES_PUBLICAS = [
  "slug",
  "name",
  "priceMonthly",
  "priceYearly",
  "modules",
  "maxUsers",
  "maxOrdersPerMonth",
  "maxProducts",
  "maxCustomers",
] as const;

function planoDeTeste(sobrescritas: Partial<Plan> = {}): Plan {
  return {
    id: "plan_interno_123",
    slug: "standard",
    name: "Fluxy Standard",
    priceMonthly: new Prisma.Decimal("29.00"),
    priceYearly: new Prisma.Decimal("290.00"),
    modules: ["orders", "customers"],
    maxUsers: 5,
    maxOrdersPerMonth: 500,
    maxProducts: 500,
    maxCustomers: 2000,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...sobrescritas,
  };
}

describe("toPublicPlan", () => {
  it("expõe exatamente as chaves públicas, sem sobra nem falta", () => {
    const dto = toPublicPlan(planoDeTeste());

    expect(Object.keys(dto).sort()).toEqual([...CHAVES_PUBLICAS].sort());
  });

  it("não carrega id nem timestamps no payload", () => {
    const dto = toPublicPlan(planoDeTeste());

    // `in` e não `toBeUndefined`: a chave não pode EXISTIR no objeto
    // serializado. Um campo com valor undefined ainda apareceria numa
    // inspeção do payload e continuaria sendo informação vazada.
    expect("id" in dto).toBe(false);
    expect("createdAt" in dto).toBe(false);
    expect("updatedAt" in dto).toBe(false);
  });

  it("não vaza campo novo do model por ser lista de permissão", () => {
    // Simula uma coluna acrescentada a Plan no futuro. Com DTO por omissão,
    // ela sairia sozinha; por lista de permissão, precisa ser declarada.
    const comColunaNova = {
      ...planoDeTeste(),
      custoInternoDeOperacao: "999.00",
    } satisfies Plan & { custoInternoDeOperacao: string };

    const dto = toPublicPlan(comColunaNova);

    expect("custoInternoDeOperacao" in dto).toBe(false);
    expect(Object.keys(dto)).toHaveLength(CHAVES_PUBLICAS.length);
  });

  it("converte Decimal em string de duas casas", () => {
    const dto = toPublicPlan(planoDeTeste());

    expect(dto.priceMonthly).toBe("29.00");
    expect(dto.priceYearly).toBe("290.00");
    expect(typeof dto.priceMonthly).toBe("string");
  });

  it("normaliza preço inteiro que o Decimal serializaria sem centavos", () => {
    // Decimal("29").toString() devolve "29" — é exatamente o caso que motivou
    // usar toFixed(2) em vez de toString().
    const dto = toPublicPlan(planoDeTeste({ priceMonthly: new Prisma.Decimal("29") }));

    expect(dto.priceMonthly).toBe("29.00");
  });

  it("não devolve instância de Decimal, que não sobrevive à serialização", () => {
    const dto = toPublicPlan(planoDeTeste());

    expect(dto.priceMonthly).not.toBeInstanceOf(Prisma.Decimal);
    // JSON.parse(JSON.stringify(...)) reproduz o que o React faz ao mandar
    // props para um Client Component: o que sobreviver aqui, sobrevive lá.
    expect(JSON.parse(JSON.stringify(dto))).toEqual(dto);
  });

  it("preserva null de limite ilimitado", () => {
    const dto = toPublicPlan(planoDeTeste({ maxUsers: null, maxOrdersPerMonth: null }));

    expect(dto.maxUsers).toBeNull();
    expect(dto.maxOrdersPerMonth).toBeNull();
  });
});
