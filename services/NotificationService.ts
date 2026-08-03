import { NOTIFICATION_LIST_LIMIT } from "@/lib/constants";
import { NotificationType, type OrderStatus } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import type { NotificationRepository } from "@/repositories/interfaces/NotificationRepository";
import {
  describeNotification,
  notificationDataSchema,
  type ClientNotification,
  type NotificationData,
} from "@/types/notifications";

interface OrderEventContext {
  companyId: string;
  /** Quem causou o evento — não recebe a própria notificação. */
  actorId: string;
  orderId: string;
  orderNumber: string;
}

// Mudar para "em produção" acontece o tempo todo e não pede ação de ninguém;
// notificar cada passo treinaria a equipe a ignorar o sino. Só entram os
// estados em que alguém precisa fazer algo (pronto para entregar) ou saber
// que algo saiu do fluxo normal (cancelado).
const NOTIFIABLE_STATUSES: readonly OrderStatus[] = ["READY", "COMPLETED", "CANCELLED"];

export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  async notifyOrderCreated(
    context: OrderEventContext & { customerName: string },
  ): Promise<void> {
    await this.dispatch(context, NotificationType.ORDER_CREATED, {
      orderNumber: context.orderNumber,
      customerName: context.customerName,
    });
  }

  async notifyOrderStatusChanged(
    context: OrderEventContext & { status: OrderStatus },
  ): Promise<void> {
    if (!NOTIFIABLE_STATUSES.includes(context.status)) return;

    await this.dispatch(context, NotificationType.ORDER_STATUS_CHANGED, {
      orderNumber: context.orderNumber,
      status: context.status,
    });
  }

  async notifyOrderDeleted(context: OrderEventContext): Promise<void> {
    await this.dispatch(context, NotificationType.ORDER_DELETED, {
      orderNumber: context.orderNumber,
    });
  }

  /**
   * Notificar é efeito colateral: se falhar, quem mudou o pedido não pode
   * perder a mudança por causa disso. O erro é registrado, não propagado —
   * a alternativa seria uma fila, que ainda não se justifica aqui.
   */
  private async dispatch(
    { companyId, actorId, orderId }: OrderEventContext,
    type: NotificationType,
    data: NotificationData,
  ): Promise<void> {
    try {
      const recipientIds = await this.repository.findRecipientIds(companyId, actorId);
      if (recipientIds.length === 0) return;

      await this.repository.fanOut(
        { type, data, orderId, actorId, recipientIds },
        companyId,
      );
    } catch (error) {
      logger.error("Falha ao criar notificação", {
        companyId,
        userId: actorId,
        resource: "notification",
        resourceId: orderId,
        type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async listForUser(userId: string, companyId: string): Promise<ClientNotification[]> {
    const rows = await this.repository.listForUser(
      userId,
      companyId,
      NOTIFICATION_LIST_LIMIT,
    );

    return rows.map((row) => {
      const parsed = notificationDataSchema.safeParse(row.data);

      // Linha gravada por uma versão anterior, com outro formato de `data`.
      // Não é descartada: sumir com ela deixaria o badge (que conta linhas,
      // sem abrir o JSON) contando algo que a lista não mostra. E `orderId`
      // é coluna própria, não parte do JSON — então o link continua levando
      // ao lugar certo mesmo sem conseguir montar a frase.
      const { title, description } = parsed.success
        ? describeNotification(row.type, parsed.data, row.actor?.name ?? null)
        : { title: "Atualização em um pedido", description: "" };

      if (!parsed.success) {
        logger.warn("Notificação com data em formato inesperado", {
          companyId,
          userId,
          resource: "notification",
          resourceId: row.id,
        });
      }

      return {
        id: row.id,
        title,
        description,
        orderId: row.orderId,
        read: row.readAt !== null,
        createdAt: row.createdAt,
      };
    });
  }

  async countUnread(userId: string, companyId: string): Promise<number> {
    return this.repository.countUnread(userId, companyId);
  }

  async markAllRead(userId: string, companyId: string): Promise<number> {
    return this.repository.markAllRead(userId, companyId);
  }

  async markRead(id: string, userId: string, companyId: string): Promise<void> {
    await this.repository.markRead(id, userId, companyId);
  }
}
