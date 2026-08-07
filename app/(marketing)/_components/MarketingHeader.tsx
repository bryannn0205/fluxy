"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { FluxyLogo } from "@/components/common/FluxyLogo";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { MARKETING_NAV_LINKS } from "@/app/(marketing)/_components/navigation";

const ID_MENU_MOBILE = "menu-navegacao-mobile";

/**
 * Cabeçalho público.
 *
 * É o único Client Component da landing, e só por causa do menu de celular —
 * o resto da página é estático e renderiza no servidor. Os links são âncoras
 * de verdade em ambos os menus: sem JavaScript, a navegação do desktop
 * continua inteira.
 */
export function MarketingHeader() {
  const [menuAberto, setMenuAberto] = useState(false);
  const rota = usePathname();

  // As âncoras de seção só existem na landing. Repeti-las em /plans levaria a
  // lugar nenhum, e "Começar agora" ali apontaria para a própria página.
  const naLanding = rota === ROUTES.HOME;

  // Esc fecha, como em qualquer disclosure. Sem isso, quem abriu o menu pelo
  // teclado precisa navegar até o botão para sair dele.
  useEffect(() => {
    if (!menuAberto) return;

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setMenuAberto(false);
    }

    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [menuAberto]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={ROUTES.HOME}
          className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <FluxyLogo />
          <span className="sr-only">Fluxy — página inicial</span>
        </Link>

        {naLanding && (
          <nav aria-label="Navegação do site" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {MARKETING_NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex items-center gap-2">
          <Link
            href={ROUTES.LOGIN}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Entrar
          </Link>
          {naLanding && (
            <Link
              href={ROUTES.PLANS}
              className={cn(buttonVariants({ size: "sm" }), "hidden md:inline-flex")}
            >
              Começar agora
            </Link>
          )}

          {/* Sem âncoras de seção não sobra nada para guardar num menu: em
              /plans o "Entrar" já cabe na barra. */}
          {naLanding && (
            <button
              type="button"
              onClick={() => setMenuAberto((aberto) => !aberto)}
              aria-expanded={menuAberto}
              aria-controls={ID_MENU_MOBILE}
              aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
              // `size-11` sobrepõe os 32px do tamanho "icon": este é o controle
              // principal de navegação no celular, e 44px é o alvo de toque que
              // Apple e Material recomendam para o dedo.
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-11 md:hidden",
              )}
            >
              {menuAberto ? (
                <X className="size-5" aria-hidden="true" />
              ) : (
                <Menu className="size-5" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* `hidden` em vez de desmontar: o id referenciado por aria-controls
          precisa existir no DOM para a relação ser válida. */}
      {naLanding && (
        <div
          id={ID_MENU_MOBILE}
          hidden={!menuAberto}
          className="border-t border-border/70 bg-background md:hidden"
        >
          <nav aria-label="Navegação do site em dispositivo móvel" className="px-4 py-4">
            <ul className="flex flex-col gap-1">
              {MARKETING_NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setMenuAberto(false)}
                    className="block rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            {/* "Entrar" não se repete aqui: ele já está na barra, visível em
                qualquer largura. */}
            <div className="mt-4 border-t border-border/70 pt-4">
              <Link
                href={ROUTES.PLANS}
                className={cn(buttonVariants({}), "w-full")}
                onClick={() => setMenuAberto(false)}
              >
                Começar agora
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
