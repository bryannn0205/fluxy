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
import { FluxyLogo } from "@/components/common/FluxyLogo";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
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
      { href: ROUTES.RECEIVABLES, label: "Contas a receber", icon: Wallet },
      { href: ROUTES.REPORTS, label: "Relatórios", icon: ChartLine },
    ],
  },
];

export function NavContent() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-4 p-4">
      <FluxyLogo className="px-2" />
      {NAV_SECTIONS.map((section, index) => (
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
