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
    // `sticky`: as listas do painel são longas, e as notificações e o menu do
    // usuário são justamente o que se procura no meio de uma rolagem.
    //
    // Sem campo de busca: não existe busca global no projeto — nem rota, nem
    // action, nem índice. Desenhar a caixa aqui criaria um controle que não
    // responde, que é pior que a ausência dele.
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md lg:px-6">
      <MobileNav role={role} />
      <div className="ml-auto flex items-center gap-2">
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />
        <UserMenu name={userName} email={userEmail} image={userImage} />
      </div>
    </header>
  );
}
