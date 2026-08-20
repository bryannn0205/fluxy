"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CredentialsSignin, signIn } from "@/lib/auth";
import {
  LOGIN_ERRORS,
  LOGIN_ERROR_MESSAGES,
  LOGIN_ERROR_PARAM,
  type LoginErrorCode,
} from "@/lib/constants";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { buildLoginUrl, buildPostAuthUrl, parsePlanIntent } from "@/lib/plan-intent";
import { loginSchema } from "@/schemas/auth.schema";
import type { ActionResult } from "@/types/common";

/**
 * @param intentInput Intenção comercial, separada das credenciais pelo mesmo
 * motivo que em `registerAction`: `loginSchema` não a conhece, e ela só decide
 * destino. Login não altera plano nem assinatura em hipótese alguma.
 */
export async function loginAction(
  input: unknown,
  intentInput?: { plan?: unknown; billing?: unknown },
): Promise<ActionResult<never>> {
  const validation = loginSchema.safeParse(input);
  if (!validation.success) {
    return {
      error: LOGIN_ERROR_MESSAGES[LOGIN_ERRORS.INVALIDO],
      fields: validation.error.flatten().fieldErrors,
    };
  }

  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";

  const { allowed } = await checkRateLimit({
    identifier: `login:${ip}`,
    ...RATE_LIMITS.LOGIN,
  });

  if (!allowed) {
    return { error: LOGIN_ERROR_MESSAGES[LOGIN_ERRORS.LIMITE] };
  }

  // Revalidada no servidor; o destino sai de um conjunto fechado no código.
  // Nenhuma URL de callback recebida do navegador é honrada aqui.
  const intent = parsePlanIntent(intentInput ?? {});

  try {
    await signIn("credentials", {
      email: validation.data.email,
      password: validation.data.password,
      redirectTo: buildPostAuthUrl(intent),
    });
  } catch (error) {
    // `instanceof`, e NÃO `error.name`.
    //
    // O Auth.js monta o erro com `this.name = this.constructor.name` — o nome
    // do identificador da classe, que o minificador do build de produção
    // reescreve para uma letra. Comparar com a string "CredentialsSignin"
    // passava em desenvolvimento, onde não há minificação, e falhava
    // exatamente em produção: o erro escapava para o `throw` abaixo e o
    // usuário que errava a senha recebia 500 em vez da mensagem.
    //
    // A classe vem de `@/lib/auth`, que a reexporta do mesmo `next-auth` de
    // onde sai o `signIn` acima, e há uma única cópia de @auth/core na árvore
    // — então o `instanceof` não corre risco de comparar contra outra
    // realização da mesma classe.
    if (error instanceof CredentialsSignin) {
      return { error: LOGIN_ERROR_MESSAGES[LOGIN_ERRORS.CREDENCIAIS] };
    }
    // NEXT_REDIRECT é lançado pelo signIn em caso de sucesso — precisa
    // propagar, não é uma falha real.
    throw error;
  }

  return {};
}

/** Descobre o código a partir da mensagem, sem manter uma segunda tabela. */
function codigoDoErro(mensagem: string | undefined): LoginErrorCode {
  const par = Object.entries(LOGIN_ERROR_MESSAGES).find(
    ([, texto]) => texto === mensagem,
  );
  return (par?.[0] as LoginErrorCode) ?? LOGIN_ERRORS.INVALIDO;
}

/**
 * O caminho do formulário sem JavaScript.
 *
 * Existe para o HTML servido ser seguro sozinho. Um `<form>` sem `action`
 * submete para a própria URL, e sem `method` o padrão do HTML é GET — então,
 * enquanto o React ainda não hidratou, um clique em Entrar mandava e-mail e
 * senha para a barra de endereços, o histórico e qualquer log de acesso pelo
 * caminho. Declarar esta Server Action como `action` do form faz o React
 * emitir `method="POST"` no HTML inicial: o navegador passa a enviar os
 * campos no CORPO da requisição, hidratado ou não.
 *
 * Não é só uma trava: sem JavaScript o login acontece de verdade. O erro
 * volta como código de um conjunto fechado, porque aqui não há toast — e
 * porque devolver texto pela URL deixaria a página refletir o que viesse
 * escrito nela.
 */
export async function loginFormAction(formData: FormData): Promise<void> {
  const intentInput = {
    plan: formData.get("plan") ?? undefined,
    billing: formData.get("billing") ?? undefined,
  };

  const resultado = await loginAction(
    {
      email: formData.get("email"),
      password: formData.get("password"),
    },
    intentInput,
  );

  // Só se chega aqui em caso de erro: no sucesso, o `signIn` de `loginAction`
  // lança NEXT_REDIRECT e a navegação acontece antes desta linha.
  const destino = buildLoginUrl(parsePlanIntent(intentInput));
  const separador = destino.includes("?") ? "&" : "?";
  redirect(`${destino}${separador}${LOGIN_ERROR_PARAM}=${codigoDoErro(resultado.error)}`);
}
