import { NavContent } from "@/components/layout/NavContent";
import { SidebarTrialCard } from "@/components/layout/SidebarTrialCard";
import type { Role } from "@/lib/generated/prisma/client";

interface SidebarProps {
  role: Role;
  /** Vem do `requireCompany()` do layout — nenhuma consulta extra. */
  trialEndsAt: Date;
  subscriptionStatus: string;
}

export function Sidebar({ role, trialEndsAt, subscriptionStatus }: SidebarProps) {
  return (
    <aside className="dashboard-sidebar hidden shrink-0 border-r border-sidebar-border lg:flex lg:w-[16.5rem] lg:flex-col">
      {/* `min-h-0` + `overflow-y-auto` na navegação: em telas baixas a lista
          rola sozinha e o cartão de plano continua ancorado embaixo, em vez de
          ser empurrado para fora da tela. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <NavContent role={role} />
      </div>
      <SidebarTrialCard
        trialEndsAt={trialEndsAt}
        subscriptionStatus={subscriptionStatus}
      />
    </aside>
  );
}
