import Link from "next/link";

import { FluxyLogo } from "@/components/common/FluxyLogo";
import { ROUTES } from "@/lib/constants";

const SUPORTE_EMAIL = "suporte@fluxy.com.br";

/**
 * Rodapé público.
 *
 * Termos e Privacidade aparecem como texto, **sem `href`**: as páginas não
 * existem, e um link para o vazio é pior que nenhum link — quebra a navegação
 * e sugere que há um documento jurídico onde não há. Viram links de verdade
 * na fase jurídica, e não antes.
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs space-y-3">
            <FluxyLogo />
            <p className="text-sm text-muted-foreground">
              Gestão de pedidos, produção e financeiro para pequenas e médias empresas.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <h2 className="text-sm font-semibold">Produto</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a
                    href="#recursos"
                    className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    Recursos
                  </a>
                </li>
                <li>
                  <Link
                    href={ROUTES.PLANS}
                    className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    Planos
                  </Link>
                </li>
                <li>
                  <a
                    href="#faq"
                    className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    Dúvidas
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-sm font-semibold">Conta</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link
                    href={ROUTES.LOGIN}
                    className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    Entrar
                  </Link>
                </li>
                <li>
                  <a
                    href={`mailto:${SUPORTE_EMAIL}`}
                    className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  >
                    Suporte
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-sm font-semibold">Legal</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  Termos <span className="text-xs">(em breve)</span>
                </li>
                <li>
                  Privacidade <span className="text-xs">(em breve)</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Fluxy
        </p>
      </div>
    </footer>
  );
}
