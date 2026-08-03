import type { Company, Role } from "@/lib/generated/prisma/client";

/**
 * Empresa + papel, no formato que os services esperam receber.
 *
 * Os services recebem o `CompanySession` de `requireCompany()`, que é a empresa
 * com `role` acoplado — é dele que sai o papel usado pelo guard de permissão.
 * Montar isso à mão em cada arquivo de teste espalharia quinze campos por onze
 * arquivos, e um campo novo no model quebraria todos de uma vez.
 */
export type ActingCompany = Company & { role: Role };

export function buildCompany(overrides: Partial<ActingCompany> = {}): ActingCompany {
  return {
    id: "company-1",
    name: "Empresa Teste",
    email: "empresa@teste.com",
    cnpj: null,
    phone: null,
    planId: null,
    subscriptionStatus: "ACTIVE",
    trialEndsAt: new Date(),
    asaasCustomerId: null,
    asaasSubscriptionId: null,
    nextOrderNumber: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    // OWNER por padrão: o teste que não fala de permissão não deveria ser
    // barrado por ela. Quem testa permissão passa o papel explicitamente, e
    // aí a intenção fica visível na chamada.
    role: "OWNER",
    ...overrides,
  };
}

/**
 * Acopla um papel à empresa vinda do banco, no formato que os services esperam.
 *
 * Nos testes de integração a empresa nasce de `prisma.company.create()`, que
 * devolve só as colunas de Company — papel é do usuário, não da empresa. Quem
 * junta os dois em produção é `requireCompany()`; aqui, isto.
 */
export function withRole<T extends Company>(
  company: T,
  role: Role = "OWNER",
): T & { role: Role } {
  return { ...company, role };
}

/** Todos os papéis, para varrer a matriz num `it.each`. */
export const ALL_ROLES: Role[] = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "OPERATOR",
  "FINANCE",
  "VIEWER",
];
