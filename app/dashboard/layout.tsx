import Link from "next/link";
import { AlertTriangle, ArrowRight, Gift } from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { auth } from "@/lib/auth";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
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

  const conteudo = expired ? (
    <>
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-300">
        <AlertTriangle className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="font-semibold text-amber-200">Sua assinatura expirou.</span>{" "}
        <span className="text-muted-foreground">
          Seus dados estão preservados, mas criar e editar registros está bloqueado.
        </span>
      </span>
    </>
  ) : (
    <>
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/15 text-[var(--panel-lavender)]">
        <Gift className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="font-semibold">
          Seu teste grátis termina em {daysLeft} dia{daysLeft === 1 ? "" : "s"}.
        </span>{" "}
        <span className="text-muted-foreground">
          Aproveite todos os recursos do Fluxy.
        </span>
      </span>
    </>
  );

  return (
    <div className="px-4 pt-4 lg:px-8">
      {/* Cartão, e não faixa de ponta a ponta: alinhado à mesma coluna do
          conteúdo, ele lê como parte do painel em vez de aviso do navegador. */}
      <div
        role="status"
        className={cn(
          "mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm",
          expired
            ? "border-amber-400/25 bg-amber-400/8"
            : "border-primary/25 bg-primary/8 shadow-[0_0_36px_-16px] shadow-primary/70",
        )}
      >
        {conteudo}
        <Link
          href={ROUTES.PLANS}
          className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-semibold text-[var(--panel-lavender)] transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Ver planos
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
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
    <div className="dashboard flex min-h-screen text-foreground">
      <Sidebar
        role={company.role}
        trialEndsAt={company.trialEndsAt}
        subscriptionStatus={company.subscriptionStatus}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          userName={session?.user?.name ?? ""}
          userEmail={session?.user?.email ?? ""}
          userImage={session?.user?.image ?? null}
          companyName={company.name}
          notifications={notifications}
          unreadCount={unreadCount}
          role={company.role}
        />
        <TrialBanner
          trialEndsAt={company.trialEndsAt}
          status={company.subscriptionStatus}
        />
        <main id="main-content" className="flex-1 px-4 pt-6 pb-8 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">{children}</div>
        </main>

        {/* Fecha a composição no rodapé. O ano sai do relógio do servidor, não
            é constante — um "© 2026" fixo envelhece sozinho na virada. */}
        <footer className="px-4 pb-8 lg:px-8">
          <p className="mx-auto max-w-7xl border-t border-border/50 pt-6 text-center text-xs text-muted-foreground/70">
            © {new Date().getFullYear()} Fluxy. Todos os direitos reservados.
          </p>
        </footer>
      </div>
    </div>
  );
}
