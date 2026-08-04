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
  /**
   * Busca o e-mail SEM filtrar soft delete.
   *
   * `findByEmail` ignora removidos, o que é certo para login — mas errado
   * para convite: `User.email` é único GLOBALMENTE no banco, sem exceção para
   * deletedAt. Convidar um e-mail de ex-membro passaria na checagem e
   * explodiria com P2002 cru só na hora do aceite.
   */
  findByEmailIncludingDeleted(email: string): Promise<User | null>;
  /** Membros ativos da empresa, para a cota de usuários. OWNER incluído. */
  countActive(companyId: string): Promise<number>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  updateName(id: string, companyId: string, name: string): Promise<User>;
  markEmailVerified(id: string): Promise<void>;

  listByCompany(companyId: string): Promise<User[]>;
  countByRole(companyId: string, role: Role): Promise<number>;
  createMember(data: CreateMemberData): Promise<User>;
  updateRole(id: string, companyId: string, role: Role): Promise<void>;
  softDelete(id: string, companyId: string): Promise<void>;
}
