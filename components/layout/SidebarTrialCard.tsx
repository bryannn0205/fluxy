import Link from "next/link";
import { Crown } from "lucide-react";

import { ROUTES } from "@/lib/constants";

interface SidebarTrialCardProps {
  trialEndsAt: Date;
  subscriptionStatus: string;
}

/**
 * Cartão de plano no pé da barra lateral.
 *
 * Usa exclusivamente o que o layout já carregou em `requireCompany()` —
 * `trialEndsAt` e `subscriptionStatus` — e repete a MESMA regra da faixa do
 * topo, incluindo o caso de teste vencido sem status `EXPIRED`. Duas contas
 * diferentes para o mesmo prazo acabariam divergindo, e a barra diria uma coisa
 * enquanto a faixa diz outra.
 *
 * Some para assinatura ativa: quem já paga não precisa de convite para pagar.
 */
export function SidebarTrialCard({
  trialEndsAt,
  subscriptionStatus,
}: SidebarTrialCardProps) {
  if (subscriptionStatus === "ACTIVE") return null;

  const diasRestantes = Math.ceil(
    (trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  const expirado =
    subscriptionStatus === "EXPIRED" ||
    (subscriptionStatus === "TRIALING" && diasRestantes <= 0);

  return (
    <div className="p-3">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-[linear-gradient(160deg,rgba(124,58,237,0.22),rgba(124,58,237,0.06)_60%,transparent)] p-4">
        {/* Luz interna no canto superior — dá volume ao cartão sem sombra
            colorida, que sobre fundo escuro só sujaria a borda. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 -right-6 size-28 [background:radial-gradient(50%_50%_at_50%_50%,var(--panel-glow)_0%,transparent_70%)]"
        />

        <span className="relative inline-flex size-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/15 text-[var(--panel-lavender)]">
          <Crown className="size-4" aria-hidden="true" />
        </span>

        {expirado ? (
          <p className="relative mt-3 text-sm leading-snug font-semibold">
            Seu teste grátis terminou.
          </p>
        ) : (
          <p className="relative mt-3 text-sm leading-snug font-semibold">
            Seu teste grátis termina em{" "}
            <span className="text-[var(--panel-lavender)]">
              {diasRestantes} dia{diasRestantes === 1 ? "" : "s"}.
            </span>
          </p>
        )}

        <p className="relative mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {expirado
            ? "Ative um plano para voltar a criar e editar registros."
            : "Aproveite todos os recursos do Fluxy."}
        </p>

        <Link
          href={ROUTES.PLANS}
          className="relative mt-3.5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
        >
          Ver planos
        </Link>
      </div>
    </div>
  );
}
