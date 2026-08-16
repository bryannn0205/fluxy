import Link from "next/link";
import { AlertTriangle, ArrowRight, Gift } from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { auth } from "@/lib/auth";
import { ROUTES } from "@/lib/constants";
import { requireCompany } from "@/lib/session";
import { notificationService } from "@/services";

/**
 * Faixa do período de teste.
 *
 * O aviso de expirado mantém o tom âmbar — ali ele precisa mesmo interromper.
 * O de teste em andamento passa a roxo discreto: aparece em toda tela do
 * painel, todos os dias, e uma tarja âmbar permanente ensina o olho a
 * ignorá-la justamente antes do dia em que ela importa.
 */
function TrialBanner({ trialEndsAt, status }: { trialEndsAt: Date; status: string }) {
  if (status === "ACTIVE") return null;

  const daysLeft = Math.ceil(
    (trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  const expired = status === "EXPIRED" || (status === "TRIALING" && daysLeft <= 0);

  if (expired) {
    return (
      <div
        role="status"
        className="flex items-start gap-2.5 border-b border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200 lg:px-6"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Sua assinatura expirou. Seus dados estão preservados, mas criar e editar
          registros está bloqueado.
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-primary/8 px-4 py-2.5 text-sm lg:px-6"
    >
      <Gift className="size-4 shrink-0 text-[var(--panel-lavender)]" aria-hidden="true" />
      <span className="font-medium">
        Seu teste grátis termina em {daysLeft} dia{daysLeft === 1 ? "" : "s"}.
      </span>
      <span className="text-muted-foreground">Aproveite todos os recursos do Fluxy.</span>
      <Link
        href={ROUTES.PLANS}
        className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium text-[var(--panel-lavender)] transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Ver planos
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
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
    // `dashboard` troca os tokens de cor para a paleta escura do painel — ver
    // o bloco correspondente em app/globals.css. O escopo cobre esta árvore
    // inteira, então cada página filha herda o tema sem saber disso.
    <div className="dashboard flex min-h-screen bg-background text-foreground">
      <Sidebar role={company.role} />
      <div className="flex min-w-0 flex-1 flex-col">
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
