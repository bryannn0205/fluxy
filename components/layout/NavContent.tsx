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
    <nav
      aria-label="Navegação principal"
      className="flex flex-col gap-7 overflow-y-auto px-3 py-5"
    >
      <div className="px-2 pb-1">
        <FluxyLogo className="[&>span]:text-[1.35rem] [&>span]:tracking-tight [&>svg]:size-8" />
      </div>

      {secoesVisiveis.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className="flex flex-col gap-1">
          {section.label && (
            <span className="px-3 pb-2 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/55 uppercase">
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
                  "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                  isActive
                    ? "border border-primary/30 bg-[linear-gradient(100deg,rgba(124,58,237,0.34),rgba(124,58,237,0.12))] font-semibold text-foreground shadow-[0_0_22px_-6px] shadow-primary/60"
                    : "font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                {/* Barra do item ativo. `aria-current` já anuncia a página
                    atual; esta marca existe para quem enxerga o destaque de
                    cor não depender só dele. */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--panel-lavender)]"
                  />
                )}
                <item.icon
                  className={cn(
                    "size-[1.15rem] shrink-0",
                    isActive
                      ? "text-[var(--panel-lavender)]"
                      : "text-muted-foreground/80",
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
