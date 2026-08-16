import { MobileNav } from "@/components/layout/MobileNav";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { UserMenu } from "@/components/layout/UserMenu";
import type { ClientNotification } from "@/types/notifications";
import type { Role } from "@/lib/generated/prisma/client";

interface HeaderProps {
  userName: string;
  userEmail: string;
  userImage: string | null;
  /** Nome da empresa da sessão — já resolvido pelo layout. */
  companyName: string;
  notifications: ClientNotification[];
  unreadCount: number;
  /** Só decide o que o menu de celular mostra; o gate real fica no servidor. */
  role: Role;
}

export function Header({
  userName,
  userEmail,
  userImage,
  companyName,
  notifications,
  unreadCount,
  role,
}: HeaderProps) {
  return (
    // `sticky`: as listas do painel são longas, e as notificações e o menu do
    // usuário são justamente o que se procura no meio de uma rolagem.
    //
    // Sem campo de busca: não existe busca global no projeto — nem rota, nem
    // action, nem índice. A referência tem uma; desenhá-la aqui criaria um
    // controle que não responde, que é pior que a ausência dele. O espaço vai
    // para o bloco do usuário, que ganha nome e empresa.
    <header className="sticky top-0 z-30 flex h-[4.5rem] items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl lg:px-6">
      <MobileNav role={role} />
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />
        <div aria-hidden="true" className="mx-1 hidden h-7 w-px bg-border sm:block" />
        <UserMenu
          name={userName}
          email={userEmail}
          image={userImage}
          companyName={companyName}
        />
      </div>
    </header>
  );
}
