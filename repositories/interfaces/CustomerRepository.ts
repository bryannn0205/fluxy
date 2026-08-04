import type { Customer } from "@/lib/generated/prisma/client";
import type { ListOptions, PaginatedResult } from "@/types/common";

export interface CreateCustomerData {
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  document?: string | undefined;
  address?: string | undefined;
  notes?: string | undefined;
}

// Não deriva de Partial<CreateCustomerData>: o Zod .partial() gera
// `campo?: T | undefined` (valor inclui undefined), enquanto o utilitário
// Partial<T> do TypeScript só marca a chave opcional sem alterar o tipo do
// valor — sob exactOptionalPropertyTypes os dois não são compatíveis.
export interface UpdateCustomerData {
  name?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  document?: string | undefined;
  address?: string | undefined;
  notes?: string | undefined;
}

export interface CustomerStats {
  orderCount: number;
  totalSpent: number;
  averageTicket: number;
  lastOrderAt: Date | null;
  favoriteProduct: { id: string; name: string; totalQuantity: number } | null;
}

export interface CustomerRepository {
  create(data: CreateCustomerData, companyId: string): Promise<Customer>;
  findById(id: string, companyId: string): Promise<Customer | null>;
  list(companyId: string, options: ListOptions): Promise<PaginatedResult<Customer>>;
  listActive(companyId: string): Promise<Customer[]>;
  update(id: string, companyId: string, data: UpdateCustomerData): Promise<Customer>;
  softDelete(id: string, companyId: string): Promise<void>;
  /** Clientes que ocupam vaga: `deletedAt IS NULL`. */
  countNotDeleted(companyId: string): Promise<number>;
  /** Agregados de CRM — pedidos cancelados nunca contam como venda. */
  getStats(customerId: string, companyId: string): Promise<CustomerStats>;
}
