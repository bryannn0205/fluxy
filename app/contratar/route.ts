import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ROUTES } from "@/lib/constants";
import { buildCheckoutUrl, buildLoginUrl, parsePlanIntent } from "@/lib/plan-intent";

/**
 * Ponto de entrada público da contratação de um plano pago.
 *
 * **Existe para tirar a sessão da vitrine.** A landing e `/plans` são públicas
 * e há teste afirmando que não importam autenticação; se o botão precisasse
 * saber quem está logado para escolher o destino, as duas passariam a depender
 * de sessão só para renderizar um link. Aqui o botão é sempre a mesma URL, e a
 * decisão acontece uma vez, no servidor.
 *
 * Route Handler, e não página: não há nada para renderizar. A resposta é um
 * redirecionamento — quem chega aqui está de passagem.
 *
 * **Não contrata nada e não concede nada.** Só escolhe entre duas rotas
 * internas. O plano continua sendo decidido por pagamento confirmado, e a tela
 * de pagamento revalida sessão, papel, plano e preço por conta própria.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  // Revalidado aqui, sem supor que a tela anterior validou: a URL é do
  // visitante. `plan` fora da lista pública, ou `billing` inventado, devolvem
  // `null` — e aí não há intenção para carregar adiante.
  const intencao = parsePlanIntent({
    plan: searchParams.get("plan") ?? undefined,
    billing: searchParams.get("billing") ?? undefined,
  });

  if (intencao === null) {
    return redirecionar(request, ROUTES.PLANS);
  }

  const sessao = await auth();

  // Sem sessão, o login leva a intenção e `buildPostAuthUrl` traz de volta ao
  // checkout depois de autenticar. Com sessão, vai direto.
  //
  // Nenhum dos dois destinos vem da requisição: são montados pelos helpers a
  // partir de constantes de rota, e é por isso que não há redirect aberto aqui
  // mesmo recebendo query string de fora.
  return redirecionar(
    request,
    sessao === null ? buildLoginUrl(intencao) : buildCheckoutUrl(intencao),
  );
}

/** 303: o destino é para ser buscado com GET, qualquer que fosse o método. */
function redirecionar(request: Request, caminho: string): Response {
  return NextResponse.redirect(new URL(caminho, request.url), 303);
}
