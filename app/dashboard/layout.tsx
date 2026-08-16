import { AlertTriangle } from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { auth } from "@/lib/auth";
import { requireCompany } from "@/lib/session";
import { notificationService } from "@/services";

function TrialBanner({ trialEndsAt, status }: { trialEndsAt: Date; status: string }) {
  if (status === "ACTIVE") return null;

  const daysLeft = Math.ceil(
    (trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  const expired = status === "EXPIRED" || (status === "TRIALING" && daysLeft <= 0);

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-800 lg:px-6"
    >
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      {expired
        ? "Sua assinatura expirou. Seus dados estão preservados, mas criar e editar registros está bloqueado."
        : `Seu teste grátis termina em ${daysLeft} dia${daysLeft === 1 ? "" : "s"}.`}
    </div>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireCompany() já resolve empresa + usuário numa query só e redireciona
  // ao login se a sessão estiver órfã — barrando no layout, nenhuma página
  // filha chega a renderizar um shell quebrado.
  const company = await requireCompany();

  // Em paralelo: são independentes entre si, e o sino não deve atrasar o
  // shell do dashboard mais do que a query mais lenta das três.
  const [session, notifications, unreadCount] = await Promise.all([
    auth(),
    notificationService.listForUser(company.userId, company.id),
    notificationService.countUnread(company.userId, company.id),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar role={company.role} />
      <div className="flex flex-1 flex-col">
        <Header
          userName={session?.user?.name ?? ""}
          userEmail={session?.user?.email ?? ""}
          userImage={session?.user?.image ?? null}
          notifications={notifications}
          unreadCount={unreadCount}
          role={company.role}
        />
        <TrialBanner
          trialEndsAt={company.trialEndsAt}
          status={company.subscriptionStatus}
        />
        <main id="main-content" className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
