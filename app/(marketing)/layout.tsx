import { MarketingHeader } from "@/app/(marketing)/_components/MarketingHeader";
import { MarketingFooter } from "@/app/(marketing)/_components/MarketingFooter";

/**
 * Casca das páginas públicas — landing e planos.
 *
 * `(marketing)` é um grupo de rotas: os parênteses fazem o Next agrupar sem
 * acrescentar segmento à URL. `app/(marketing)/page.tsx` continua respondendo
 * em `/`, e não existe rota `/marketing`.
 *
 * Nada aqui consulta sessão, banco ou empresa: é a casca de páginas que
 * precisam responder a quem nunca se cadastrou.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      {/* Alvo do "Pular para o conteúdo" declarado no layout raiz. */}
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
