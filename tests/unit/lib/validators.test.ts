import { describe, expect, it } from "vitest";

import { isValidCnpj, isValidCpf, isValidDocument } from "@/lib/validators";

describe("isValidCpf", () => {
  it("aceita CPF válido com máscara", () => {
    expect(isValidCpf("111.444.777-35")).toBe(true);
  });

  it("rejeita CPF com dígito verificador inválido", () => {
    expect(isValidCpf("111.444.777-34")).toBe(false);
  });

  it("rejeita CPF com todos os dígitos iguais", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });

  it("rejeita CPF com tamanho incorreto", () => {
    expect(isValidCpf("123")).toBe(false);
  });
});

describe("isValidCnpj", () => {
  it("aceita CNPJ válido com máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("rejeita CNPJ com dígito verificador inválido", () => {
    expect(isValidCnpj("11.222.333/0001-00")).toBe(false);
  });

  it("rejeita CNPJ com todos os dígitos iguais", () => {
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
  });
});

describe("isValidDocument", () => {
  it("aceita CPF válido", () => {
    expect(isValidDocument("11144477735")).toBe(true);
  });

  it("aceita CNPJ válido", () => {
    expect(isValidDocument("11222333000181")).toBe(true);
  });

  it("rejeita tamanho que não é nem CPF nem CNPJ", () => {
    expect(isValidDocument("12345")).toBe(false);
  });
});
