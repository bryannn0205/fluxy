import { FluxyLogo } from "@/components/common/FluxyLogo";
import { AuthBackground } from "@/app/(auth)/_components/AuthBackground";

/**
 * Casca das telas de acesso.
 *
 * `auth` troca os tokens de cor para a paleta escura destas telas — ver o bloco
 * correspondente em app/globals.css. O escopo é esta árvore; o painel continua
 * respondendo ao tema escolhido.
 *
 * `min-h-dvh` e não `min-h-screen`: `100vh` no celular mede a janela SEM a
 * barra do navegador, então o conteúdo nasce mais alto que a área visível e o
 * rodapé do cartão fica embaixo da barra. `dvh` acompanha a altura real, e
 * também encolhe quando o teclado virtual abre.
 *
 * O bloco central fica em fluxo normal, sem `position: fixed`: com o teclado
 * aberto em telas baixas, a página precisa poder rolar até o campo em foco —
 * um formulário fixo trava justamente quando mais se precisa dele.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth relative isolate flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <AuthBackground />

      <div className="auth-entrada w-full max-w-[27rem] space-y-7">
        <div className="flex justify-center">
          <FluxyLogo className="[&>span]:text-xl [&>svg]:size-7" />
        </div>
        {children}
      </div>
    </div>
  );
}
