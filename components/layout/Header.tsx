import { MobileNav } from "@/components/layout/MobileNav";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { UserMenu } from "@/components/layout/UserMenu";
import type { ClientNotification } from "@/types/notifications";

interface HeaderProps {
  userName: string;
  userEmail: string;
  userImage: string | null;
  notifications: ClientNotification[];
  unreadCount: number;
}

export function Header({
  userName,
  userEmail,
  userImage,
  notifications,
  unreadCount,
}: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-4 lg:px-6">
      <MobileNav />
      <div className="ml-auto flex items-center gap-3">
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />
        <UserMenu name={userName} email={userEmail} image={userImage} />
      </div>
    </header>
  );
}
