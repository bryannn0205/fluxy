import { MobileNav } from "@/components/layout/MobileNav";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { UserMenu } from "@/components/layout/UserMenu";
import type { ClientNotification } from "@/types/notifications";
import type { Role } from "@/lib/generated/prisma/client";

interface HeaderProps {
  userName: string;
  userEmail: string;
  userImage: string | null;
  notifications: ClientNotification[];
  unreadCount: number;
  /** Só decide o que o menu de celular mostra; o gate real fica no servidor. */
  role: Role;
}

export function Header({
  userName,
  userEmail,
  userImage,
  notifications,
  unreadCount,
  role,
}: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-4 lg:px-6">
      <MobileNav role={role} />
      <div className="ml-auto flex items-center gap-3">
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />
        <UserMenu name={userName} email={userEmail} image={userImage} />
      </div>
    </header>
  );
}
