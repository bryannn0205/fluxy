"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ChartLine,
  Factory,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { can, type ActionOf, type Resource } from "@/lib/permissions";
import { FluxyLogo } from "@/components/common/FluxyLogo";
import type { Role } from "@/lib/generated/prisma/client";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Sem isto, o item vale para todo mundo que enxerga o painel. */
  requires?: { resource: Resource; action: string };
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

// Seções vazias (sem label) renderizam os itens direto, sem cabeçalho —
// usado para o Painel, que fica fora de qualquer agrupamento.
const NAV_SECTIONS: NavSection[] = [
  { items: [{ href: ROUTES.DASHBOARD, label: "Painel", icon: LayoutDashboard }] },
  {
    label: "Operação",
    items: [
      { href: ROUTES.ORDERS, label: "Pedidos", icon: ShoppingCart },
      { href: ROUTES.PRODUCTION, label: "Produção", icon: Factory },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: ROUTES.CUSTOMERS, label: "Clientes", icon: Users },
      { href: ROUTES.PRODUCTS, label: "Produtos", icon: Package },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: ROUTES.STOCK, label: "Estoque", icon: Boxes },
      // Estas duas páginas já barravam no servidor, mas o link aparecia para
      // todo mundo — o papel sem permissão só descobria clicando e batendo
      // num 403. O gate do servidor continua onde estava; some o convite.
      {
        href: ROUTES.RECEIVABLES,
        label: "Contas a receber",
        icon: Wallet,
        requires: { resource: "finance", action: "view" },
      },
      {
        href: ROUTES.REPORTS,
        label: "Relatórios",
        icon: ChartLine,
        requires: { resource: "reports", action: "viewSales" },
      },
    ],
  },
];

interface NavContentProps {
  role: Role;
}

/**
 * O menu esconde o que o papel não alcança — e é só isso que ele faz.
 *
 * Esconder link não é autorização: quem barra é o guard de cada página e
 * service. Este componente evita o beco sem saída de oferecer um caminho que
 * termina em "acesso negado".
 */
export function NavContent({ role }: NavContentProps) {
  const pathname = usePathname();

  const secoesVisiveis = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        !item.requires ||
        can(role, item.requires.resource, item.requires.action as ActionOf<Resource>),
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-6 p-4">
      <div className="px-2 pt-2 pb-1">
        <FluxyLogo className="[&>span]:text-lg [&>svg]:size-7" />
      </div>

      {secoesVisiveis.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className="flex flex-col gap-1">
          {section.label && (
            <span className="px-3 pb-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground/70 uppercase">
              {section.label}
            </span>
          )}
          {section.items.map((item) => {
            const isActive =
              item.href === ROUTES.DASHBOARD
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  // `min-h-11` são os 44px de alvo de toque: no celular esta
                  // mesma lista é o menu inteiro, dentro da gaveta.
                  "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                )}
              >
                {/* Barra do item ativo. `aria-current` já anuncia a página
                    atual; esta marca existe para quem enxerga o destaque de
                    cor não depender só dele. */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-sidebar-primary"
                  />
                )}
                <item.icon
                  className={cn(
                    "size-[1.15rem] shrink-0",
                    isActive && "text-[var(--panel-lavender)]",
                  )}
                  aria-hidden="true"
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
