import type { Company, Plan } from "@/lib/generated/prisma/client";
import type { RegisterInput } from "@/schemas/auth.schema";

export interface CreateCompanyWithOwnerData {
  register: RegisterInput;
  passwordHash: string;
  trialEndsAt: Date;
  planId: string | null;
}

export interface CompanyRepository {
  findById(id: string): Promise<Company | null>;
  findByEmail(email: string): Promise<Company | null>;
  /** Cria a empresa e o usuário OWNER em uma única transação atômica. */
  createWithOwner(data: CreateCompanyWithOwnerData): Promise<Company>;
  update(id: string, data: Partial<Pick<Company, "name" | "phone">>): Promise<Company>;
  /** Incrementa e retorna o próximo número de pedido, de forma atômica. */
  incrementOrderNumber(id: string): Promise<number>;
  /**
   * Plano vinculado à empresa, ou `null` quando não há — o caso do trial.
   * Sem plano significa sem teto: travar quem está avaliando o produto seria
   * o oposto do que o trial existe para fazer.
   */
  findPlanByCompany(companyId: string): Promise<Plan | null>;
}
