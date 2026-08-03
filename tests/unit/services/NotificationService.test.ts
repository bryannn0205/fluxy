import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "@/services/NotificationService";
import type { NotificationRepository } from "@/repositories/interfaces/NotificationRepository";
import type { NotificationListItem } from "@/types/notifications";

function buildRepository(
  overrides: Partial<NotificationRepository> = {},
): NotificationRepository {
  return {
    fanOut: vi.fn().mockResolvedValue(undefined),
    findRecipientIds: vi.fn().mockResolvedValue(["user-2", "user-3"]),
    listForUser: vi.fn().mockResolvedValue([]),
    countUnread: vi.fn().mockResolvedValue(0),
    markAllRead: vi.fn().mockResolvedValue(0),
    markRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const orderContext = {
  companyId: "company-1",
  actorId: "user-1",
  orderId: "order-1",
  orderNumber: "0042",
};

function buildRow(overrides: Partial<NotificationListItem> = {}): NotificationListItem {
  return {
    id: "notif-1",
    type: "ORDER_CREATED",
    data: { orderNumber: "0042", customerName: "Padaria do Zé" },
    orderId: "order-1",
    readAt: null,
    createdAt: new Date("2026-08-03T15:00:00Z"),
    actor: { id: "user-1", name: "Ana" },
    ...overrides,
  } as NotificationListItem;
}

describe("NotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("quem recebe", () => {
    it("exclui quem causou o evento — ninguém precisa ser avisado do que acabou de fazer", async () => {
      const repository = buildRepository();
      await new NotificationService(repository).notifyOrderCreated({
        ...orderContext,
        customerName: "Padaria do Zé",
      });

      expect(repository.findRecipientIds).toHaveBeenCalledWith("company-1", "user-1");
    });

    it("não grava nada quando o autor é a única pessoa da empresa", async () => {
      const repository = buildRepository({
        findRecipientIds: vi.fn().mockResolvedValue([]),
      });

      await new NotificationService(repository).notifyOrderCreated({
        ...orderContext,
        customerName: "Padaria do Zé",
      });

      expect(repository.fanOut).not.toHaveBeenCalled();
    });

    it("grava uma linha por destinatário", async () => {
      const repository = buildRepository();
      await new NotificationService(repository).notifyOrderCreated({
        ...orderContext,
        customerName: "Padaria do Zé",
      });

      expect(repository.fanOut).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientIds: ["user-2", "user-3"],
          actorId: "user-1",
        }),
        "company-1",
      );
    });
  });

  describe("quais mudanças de status notificam", () => {
    it.each(["READY", "COMPLETED", "CANCELLED"] as const)(
      "notifica %s",
      async (status) => {
        const repository = buildRepository();
        await new NotificationService(repository).notifyOrderStatusChanged({
          ...orderContext,
          status,
        });

        expect(repository.fanOut).toHaveBeenCalled();
      },
    );

    // Passar por "em produção" é rotina e não pede ação de ninguém; notificar
    // cada passo treinaria a equipe a ignorar o sino.
    it.each(["PENDING", "PROCESSING"] as const)("ignora %s", async (status) => {
      const repository = buildRepository();
      await new NotificationService(repository).notifyOrderStatusChanged({
        ...orderContext,
        status,
      });

      expect(repository.fanOut).not.toHaveBeenCalled();
      expect(repository.findRecipientIds).not.toHaveBeenCalled();
    });
  });

  describe("resiliência", () => {
    // Notificar é efeito colateral do que o usuário pediu. Se o fan-out
    // falhar, quem mudou o status não pode perder a mudança por causa disso.
    it("engole a falha do repositório em vez de derrubar a mutação que a disparou", async () => {
      const repository = buildRepository({
        fanOut: vi.fn().mockRejectedValue(new Error("banco fora do ar")),
      });

      await expect(
        new NotificationService(repository).notifyOrderDeleted(orderContext),
      ).resolves.toBeUndefined();
    });

    it("também engole falha ao resolver destinatários", async () => {
      const repository = buildRepository({
        findRecipientIds: vi.fn().mockRejectedValue(new Error("timeout")),
      });

      await expect(
        new NotificationService(repository).notifyOrderDeleted(orderContext),
      ).resolves.toBeUndefined();
    });
  });

  describe("montagem da lista", () => {
    it("resolve o texto a partir do tipo e do autor", async () => {
      const repository = buildRepository({
        listForUser: vi.fn().mockResolvedValue([buildRow()]),
      });

      const [item] = await new NotificationService(repository).listForUser(
        "user-2",
        "company-1",
      );

      expect(item?.title).toBe("Pedido 0042 criado");
      expect(item?.description).toBe("Cliente Padaria do Zé por Ana");
      expect(item?.read).toBe(false);
    });

    it("traduz o status novo na mudança de status", async () => {
      const repository = buildRepository({
        listForUser: vi.fn().mockResolvedValue([
          buildRow({
            type: "ORDER_STATUS_CHANGED",
            data: { orderNumber: "0042", status: "READY" },
          }),
        ]),
      });

      const [item] = await new NotificationService(repository).listForUser(
        "user-2",
        "company-1",
      );

      expect(item?.title).toBe("Pedido 0042 mudou de status");
      expect(item?.description).toBe("Agora está em Pronto por Ana");
    });

    it("marca como lida quando readAt está preenchido", async () => {
      const repository = buildRepository({
        listForUser: vi.fn().mockResolvedValue([buildRow({ readAt: new Date() })]),
      });

      const [item] = await new NotificationService(repository).listForUser(
        "user-2",
        "company-1",
      );

      expect(item?.read).toBe(true);
    });

    // Sumir com a linha faria o badge — que conta linhas sem abrir o JSON —
    // divergir da lista: "3 não lidas" com só 2 itens à vista.
    it("mantém a linha de formato desconhecido, com texto genérico e link intacto", async () => {
      const repository = buildRepository({
        listForUser: vi
          .fn()
          .mockResolvedValue([
            buildRow({ id: "quebrada", data: { formatoAntigo: true } }),
            buildRow({ id: "boa" }),
          ]),
      });

      const items = await new NotificationService(repository).listForUser(
        "user-2",
        "company-1",
      );

      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        id: "quebrada",
        title: "Atualização em um pedido",
        orderId: "order-1",
      });
      expect(items[1]?.title).toBe("Pedido 0042 criado");
    });

    it("omite o autor no texto quando a origem é o sistema", async () => {
      const repository = buildRepository({
        listForUser: vi.fn().mockResolvedValue([buildRow({ actor: null })]),
      });

      const [item] = await new NotificationService(repository).listForUser(
        "user-2",
        "company-1",
      );

      expect(item?.description).toBe("Cliente Padaria do Zé");
    });
  });
});
