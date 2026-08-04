import type { Invitation, Role, User } from "@/lib/generated/prisma/client";
import type { InvitationWithCompany, InvitationWithInviter } from "@/types/team";

/**
 * O que o aceite conhece do estado, lido DENTRO da transação e sob o lock.
 *
 * As contagens vêm prontas em vez de o callback consultá-las por conta
 * própria: uma query pelo client principal enquanto a transação segura o lock
 * trava — o Postgres embutido do ambiente local serializa conexões, e a
 * consulta de fora esperaria a transação que espera por ela. Além disso, ler
 * fora da transação leria um estado que o lock existe justamente para congelar.
 */
export interface AcceptInvitationContext {
  companyId: string;
  email: string;
  /** Usuários ativos da empresa, OWNER incluído. */
  activeUsers: number;
  /** Convites que ainda reservam vaga, incluindo o que está sendo aceito. */
  validPendingInvitations: number;
}

export interface CreateInvitationData {
  companyId: string;
  email: string;
  role: Role;
  token: string;
  invitedById: string;
  expiresAt: Date;
}

export interface InvitationRepository {
  /** Cria ou renova (mesma empresa + e-mail já tinha convite pendente) com novo token/validade. */
  upsert(data: CreateInvitationData): Promise<Invitation>;
  findByToken(token: string): Promise<Invitation | null>;
  /** Inclui o nome da empresa — usado na tela pública de aceite do convite. */
  findByTokenWithCompany(token: string): Promise<InvitationWithCompany | null>;
  listPending(companyId: string): Promise<InvitationWithInviter[]>;
  /**
   * Convites que ainda reservam vaga: `expiresAt > now`.
   *
   * NÃO reutilize `listPending` para cota — ela devolve expirados também,
   * porque a tela quer mostrá-los. Um expirado não segura vaga nenhuma.
   */
  countValidPending(companyId: string, now: Date): Promise<number>;
  findByCompanyAndEmail(companyId: string, email: string): Promise<Invitation | null>;

  /**
   * Consome o convite e cria o usuário ATOMICAMENTE.
   *
   * Antes eram duas chamadas soltas — `createMember` e depois `delete` —, e um
   * erro entre elas deixava convite consumido porém ainda utilizável. Aqui, se
   * qualquer passo falhar, nada acontece: nem usuário criado, nem token
   * gastado, nem convite apagado.
   *
   * O `decidir` roda DENTRO da transação, depois do lock na Company, e é onde
   * a cota é revalidada — o estado pode ter mudado desde o envio do convite.
   * Lançar ali aborta tudo e preserva o convite para uma nova tentativa.
   *
   * A exclusão do convite usa `deleteMany` com o id: se duas tentativas
   * simultâneas chegarem, a segunda encontra zero linhas e recebe erro de
   * convite inválido, em vez de um P2002 cru vindo do e-mail único.
   */
  acceptWithinTransaction(
    token: string,
    decidir: (contexto: AcceptInvitationContext) => {
      name: string;
      passwordHash: string;
      emailVerified: boolean;
    },
  ): Promise<{ user: User; companyId: string; email: string }>;
  delete(id: string, companyId: string): Promise<void>;
}
