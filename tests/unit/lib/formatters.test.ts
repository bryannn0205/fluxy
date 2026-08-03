import { describe, expect, it } from "vitest";

import {
  formatCurrency,
  formatDate,
  formatDocument,
  formatOrderNumber,
} from "@/lib/formatters";

describe("formatCurrency", () => {
  it("formata valor em reais", () => {
    expect(formatCurrency(1234.56)).toBe("R$ 1.234,56");
  });

  it("formata zero", () => {
    expect(formatCurrency(0)).toBe("R$ 0,00");
  });

  it("formata valor negativo", () => {
    expect(formatCurrency(-100)).toBe("-R$ 100,00");
  });
});

describe("formatDate", () => {
  it("formata data no padrão brasileiro", () => {
    expect(formatDate(new Date("2026-08-01T12:00:00Z"))).toBe("01/08/2026");
  });
});

describe("formatOrderNumber", () => {
  it("prefixa com #", () => {
    expect(formatOrderNumber("0007")).toBe("#0007");
  });
});

describe("formatDocument", () => {
  it("formata CPF (11 dígitos)", () => {
    expect(formatDocument("11144477735")).toBe("111.444.777-35");
  });

  it("formata CNPJ (14 dígitos)", () => {
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("retorna o valor original se não tiver 11 ou 14 dígitos", () => {
    expect(formatDocument("123")).toBe("123");
  });
});
