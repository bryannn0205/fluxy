"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { formatDateTime } from "@/lib/formatters";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/dashboard/notifications/actions";
import type { ClientNotification } from "@/types/notifications";

interface NotificationBellProps {
  notifications: ClientNotification[];
  unreadCount: number;
}

export function NotificationBell({ notifications, unreadCount }: NotificationBellProps) {
  const [isPending, startTransition] = useTransition();

  function markAllRead() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  }

  function markRead(id: string) {
    startTransition(async () => {
      await markNotificationReadAction({ id });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={
          unreadCount > 0
            ? `Notificações, ${unreadCount} não ${unreadCount === 1 ? "lida" : "lidas"}`
            : "Notificações"
        }
      >
        <Bell className="size-4" aria-hidden="true" />
        {unreadCount > 0 && (
          // aria-hidden: a contagem já está no rótulo do botão, e anunciá-la
          // duas vezes atrapalha quem usa leitor de tela.
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground tabular-nums"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">Notificações</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="xs" onClick={markAllRead} disabled={isPending}>
              Marcar todas como lidas
            </Button>
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />

        {notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nenhuma notificação por aqui.
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <li key={notification.id} className="border-b last:border-0">
                {/* Não é DropdownMenuItem: o item fecha o menu ao clicar, e
                    marcar como lida deve poder acontecer sem tirar a lista da
                    tela. */}
                <div
                  className={cn(
                    "flex gap-2 px-3 py-2.5",
                    !notification.read && "bg-muted/40",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      notification.read ? "bg-transparent" : "bg-primary",
                    )}
                  />

                  <div className="min-w-0 flex-1">
                    {notification.orderId ? (
                      <Link
                        href={`${ROUTES.ORDERS}/${notification.orderId}`}
                        onClick={() => !notification.read && markRead(notification.id)}
                        className="text-sm font-medium hover:underline"
                      >
                        {notification.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">{notification.title}</p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {notification.description}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(notification.createdAt)}
                    </p>
                  </div>

                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => markRead(notification.id)}
                      disabled={isPending}
                      aria-label={`Marcar "${notification.title}" como lida`}
                    >
                      Lida
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
