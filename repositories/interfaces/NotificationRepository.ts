import type { NotificationType } from "@/lib/generated/prisma/client";
import type { NotificationData, NotificationListItem } from "@/types/notifications";

export interface CreateNotificationData {
  type: NotificationType;
  data: NotificationData;
  orderId?: string | undefined;
  actorId?: string | undefined;
  /** Destinatários já resolvidos pelo Service — ver `fanOut`. */
  recipientIds: string[];
}

export interface NotificationRepository {
  /**
   * Grava uma linha por destinatário, em `createMany`. A alternativa —
   * um `create` por pessoa — faria N idas ao banco dentro do caminho de uma
   * mutação de pedido, que é síncrona para quem clicou.
   */
  fanOut(data: CreateNotificationData, companyId: string): Promise<void>;
  /**
   * Destinatários de um evento: todos os membros ativos da empresa menos
   * quem o causou. Vive no repositório porque é uma query, não uma regra.
   */
  findRecipientIds(companyId: string, exceptUserId?: string): Promise<string[]>;
  listForUser(
    userId: string,
    companyId: string,
    limit: number,
  ): Promise<NotificationListItem[]>;
  countUnread(userId: string, companyId: string): Promise<number>;
  /** Devolve quantas foram marcadas — zero significa que nada era do usuário. */
  markAllRead(userId: string, companyId: string): Promise<number>;
  markRead(id: string, userId: string, companyId: string): Promise<void>;
}
