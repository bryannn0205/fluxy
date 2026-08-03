import { z } from "zod";

import { ORDER_STATUS_LABELS } from "@/lib/constants";
import type { Prisma } from "@/lib/generated/prisma/client";
// Ver nota em schemas/order.schema.ts sobre importar de enums, não de client.
import { NotificationType, OrderStatus } from "@/lib/generated/prisma/enums";

/**
 * Forma do snapshot gravado em `Notification.data`.
 *
 * O Prisma devolve `Json` como `JsonValue` — um tipo sem forma conhecida.
 * Validar na leitura é o que permite renderizar sem `any` e sem confiar que
 * uma linha gravada meses atrás tenha o formato de hoje; se o schema evoluir,
 * a linha antiga é descartada em vez de quebrar a lista inteira.
 *
 * Todos os campos além de `orderNumber` são opcionais porque cada tipo de
 * notificação preenche um subconjunto — quem renderiza sabe o que esperar do
 * seu próprio tipo.
 */
export const notificationDataSchema = z.object({
  orderNumber: z.string(),
  customerName: z.string().optional(),
  status: z.enum(OrderStatus).optional(),
});

export type NotificationData = z.infer<typeof notificationDataSchema>;

export type NotificationListItem = Prisma.NotificationGetPayload<{
  select: {
    id: true;
    type: true;
    data: true;
    orderId: true;
    readAt: true;
    createdAt: true;
    actor: { select: { id: true; name: true } };
  };
}>;

/**
 * Item já pronto para a interface: `data` validado e o texto resolvido.
 * O Client Component recebe isto, nunca a linha crua — `Json` não atravessa
 * a fronteira Server → Client com tipo útil.
 */
export interface ClientNotification {
  id: string;
  title: string;
  description: string;
  orderId: string | null;
  read: boolean;
  createdAt: Date;
}

/**
 * Texto de cada tipo. Fica aqui, e não gravado no banco, para que corrigir
 * uma frase não exija migrar linhas — e para que o mesmo evento nunca apareça
 * escrito de dois jeitos por ter sido gravado em versões diferentes.
 */
export function describeNotification(
  type: NotificationType,
  data: NotificationData,
  actorName: string | null,
): { title: string; description: string } {
  const order = `Pedido ${data.orderNumber}`;
  const by = actorName ? ` por ${actorName}` : "";

  switch (type) {
    case NotificationType.ORDER_CREATED:
      return {
        title: `${order} criado`,
        description: data.customerName
          ? `Cliente ${data.customerName}${by}`
          : `Criado${by}`,
      };

    case NotificationType.ORDER_STATUS_CHANGED:
      return {
        title: `${order} mudou de status`,
        description: data.status
          ? `Agora está em ${ORDER_STATUS_LABELS[data.status]}${by}`
          : `Status atualizado${by}`,
      };

    case NotificationType.ORDER_DELETED:
      return { title: `${order} excluído`, description: `Excluído${by}` };
  }
}
