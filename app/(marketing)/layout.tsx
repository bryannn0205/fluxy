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
    // `marketing` troca os tokens de cor para a paleta escura das páginas
    // públicas — ver o bloco correspondente em app/globals.css. O escopo é
    // esta árvore: o painel continua respondendo ao tema escolhido.
    //
    // `bg-background` precisa estar aqui, e não só no `body`: o body pinta
    // usando os tokens de fora deste escopo, e sem esta camada a página
    // ficaria clara por baixo do conteúdo escuro.
    <div className="marketing flex min-h-screen flex-col bg-background text-foreground">
      <MarketingHeader />
      {/* Alvo do "Pular para o conteúdo" declarado no layout raiz. */}
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
