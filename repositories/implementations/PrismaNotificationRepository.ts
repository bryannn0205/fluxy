import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type {
  CreateNotificationData,
  NotificationRepository,
} from "@/repositories/interfaces/NotificationRepository";
import type { NotificationListItem } from "@/types/notifications";

const NOTIFICATION_LIST_SELECT = {
  id: true,
  type: true,
  data: true,
  orderId: true,
  readAt: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} as const;

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async fanOut(
    { type, data, orderId, actorId, recipientIds }: CreateNotificationData,
    companyId: string,
  ): Promise<void> {
    if (recipientIds.length === 0) return;

    await this.prisma.notification.createMany({
      data: recipientIds.map((userId) => ({
        companyId,
        userId,
        actorId: actorId ?? null,
        type,
        data: data as unknown as Prisma.InputJsonObject,
        orderId: orderId ?? null,
      })),
    });
  }

  async findRecipientIds(companyId: string, exceptUserId?: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(exceptUserId && { id: { not: exceptUserId } }),
      },
      select: { id: true },
    });

    return users.map((user) => user.id);
  }

  async listForUser(
    userId: string,
    companyId: string,
    limit: number,
  ): Promise<NotificationListItem[]> {
    // companyId no filtro é redundante com userId (um usuário pertence a uma
    // empresa só), mas mantê-lo garante que uma sessão trocada de empresa
    // nunca leia a caixa de outra — o filtro de tenant não depende de
    // invariante de dado, e sim está escrito na query.
    return this.prisma.notification.findMany({
      where: { userId, companyId },
      select: NOTIFICATION_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async countUnread(userId: string, companyId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, companyId, readAt: null },
    });
  }

  async markAllRead(userId: string, companyId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, companyId, readAt: null },
      data: { readAt: new Date() },
    });

    return count;
  }

  async markRead(id: string, userId: string, companyId: string): Promise<void> {
    // updateMany, não update: `update` por id lançaria se a linha fosse de
    // outro usuário, e o erro em si já revelaria que aquele id existe.
    // Assim, marcar algo que não é seu simplesmente não faz nada.
    await this.prisma.notification.updateMany({
      where: { id, userId, companyId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
