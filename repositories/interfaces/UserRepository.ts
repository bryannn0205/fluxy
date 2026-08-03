import type { Role, User } from "@/lib/generated/prisma/client";

export interface CreateMemberData {
  companyId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export interface UserRepository {
  findById(id: string, companyId: string): Promise<User | null>;
  /** Global — necessário para o fluxo de autenticação (login por e-mail). */
  findByEmail(email: string): Promise<User | null>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  updateName(id: string, companyId: string, name: string): Promise<User>;
  markEmailVerified(id: string): Promise<void>;

  listByCompany(companyId: string): Promise<User[]>;
  countByRole(companyId: string, role: Role): Promise<number>;
  createMember(data: CreateMemberData): Promise<User>;
  updateRole(id: string, companyId: string, role: Role): Promise<void>;
  softDelete(id: string, companyId: string): Promise<void>;
}
