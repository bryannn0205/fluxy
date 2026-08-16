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
    <nav aria-label="Navegação principal" className="flex flex-col gap-4 p-4">
      <FluxyLogo className="px-2" />
      {secoesVisiveis.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className="flex flex-col gap-1">
          {section.label && (
            <span className="px-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
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
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
