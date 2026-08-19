import { afterEach, describe, expect, it, vi } from "vitest";

import { LOGIN_ERRORS, LOGIN_ERROR_MESSAGES, LOGIN_ERROR_PARAM } from "@/lib/constants";
import type * as RateLimitModule from "@/lib/rate-limit";

/**
 * O envio do login sem JavaScript.
 *
 * Um `<form>` sem `action` submete para a própria URL, e sem `method` o padrão
 * do HTML é GET — então, enquanto o React não hidratou, um clique em Entrar
 * mandava e-mail e senha para a barra de endereços e para o histórico. A
 * correção foi declarar uma Server Action no form, o que faz o React emitir
 * `method="POST"` já no HTML servido.
 *
 * Estes testes prendem a metade que dá para prender fora do navegador: o que a
 * action faz DEPOIS de falhar. Ela redireciona de volta ao login, e é aí que
 * uma credencial poderia escapar para a URL sem ninguém perceber. A outra
 * metade — o `method="POST"` no HTML — é verificada no navegador, com
 * JavaScript desabilitado.
 */

const SENHA = "senha-sintetica-de-teste";
const EMAIL = "pessoa@teste.com";

const signIn = vi.fn();
const redirect = vi.fn((destino: string) => {
  // Imita o `redirect` real, que interrompe a execução lançando.
  throw new Error(`REDIRECT:${destino}`);
});
const checkRateLimit = vi.fn().mockResolvedValue({ allowed: true, remaining: 5 });

vi.mock("@/lib/auth", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => redirect(d) }));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Map([["x-forwarded-for", "203.0.113.7"]])),
}));
vi.mock("@/lib/rate-limit", async () => {
  const real = await vi.importActual<typeof RateLimitModule>("@/lib/rate-limit");
  return { ...real, checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) };
});

async function enviar(campos: Record<string, string>) {
  const { loginFormAction } = await import("@/app/(auth)/login/actions");
  const formData = new FormData();
  for (const [chave, valor] of Object.entries(campos)) formData.set(chave, valor);

  try {
    await loginFormAction(formData);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (mensagem.startsWith("REDIRECT:")) return mensagem.slice("REDIRECT:".length);
    throw erro;
  }
  return null;
}

afterEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 5 });
});

describe("loginFormAction — credenciais nunca chegam à URL", () => {
  it("não devolve a senha na URL quando o login falha", async () => {
    signIn.mockRejectedValueOnce(
      Object.assign(new Error("falhou"), { name: "CredentialsSignin" }),
    );

    const destino = await enviar({ email: EMAIL, password: SENHA });

    expect(destino).not.toBeNull();
    expect(destino).not.toContain(SENHA);
    expect(destino).not.toContain(encodeURIComponent(SENHA));
  });

  it("não devolve o e-mail na URL quando o login falha", async () => {
    signIn.mockRejectedValueOnce(
      Object.assign(new Error("falhou"), { name: "CredentialsSignin" }),
    );

    const destino = await enviar({ email: EMAIL, password: SENHA });

    expect(destino).not.toContain(EMAIL);
    expect(destino).not.toContain(encodeURIComponent(EMAIL));
  });

  it("também não vaza quando a validação rejeita a entrada", async () => {
    // E-mail inválido nem chega ao signIn: o retorno vem do Zod.
    const destino = await enviar({ email: "isto-nao-e-email", password: SENHA });

    expect(destino).not.toContain(SENHA);
    expect(destino).toContain(`${LOGIN_ERROR_PARAM}=${LOGIN_ERRORS.INVALIDO}`);
  });

  it("também não vaza quando o limite de tentativas é atingido", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });

    const destino = await enviar({ email: EMAIL, password: SENHA });

    expect(destino).not.toContain(SENHA);
    expect(destino).toContain(`${LOGIN_ERROR_PARAM}=${LOGIN_ERRORS.LIMITE}`);
  });

  it("nenhum valor do formulário sobrevive na query, seja qual for o campo", async () => {
    signIn.mockRejectedValueOnce(
      Object.assign(new Error("falhou"), { name: "CredentialsSignin" }),
    );

    const destino = await enviar({
      email: EMAIL,
      password: SENHA,
      plan: "pro",
      billing: "yearly",
    });

    const query = new URL(destino!, "http://localhost").searchParams;
    // `plan` e `billing` podem viajar — são intenção comercial, não segredo.
    // Qualquer chave fora dessas três seria dado do formulário escapando.
    const permitidas = new Set(["plan", "billing", LOGIN_ERROR_PARAM]);
    for (const chave of query.keys()) {
      expect(permitidas.has(chave)).toBe(true);
    }
    expect(query.get("password")).toBeNull();
    expect(query.get("email")).toBeNull();
  });
});

describe("loginFormAction — o código de erro vem de um conjunto fechado", () => {
  it.each([["CredentialsSignin", LOGIN_ERRORS.CREDENCIAIS]])(
    "mapeia %s para o código %s",
    async (nomeDoErro, codigo) => {
      signIn.mockRejectedValueOnce(Object.assign(new Error("x"), { name: nomeDoErro }));

      const destino = await enviar({ email: EMAIL, password: SENHA });

      expect(destino).toContain(`${LOGIN_ERROR_PARAM}=${codigo}`);
    },
  );

  it("o código na URL é sempre um dos previstos", async () => {
    signIn.mockRejectedValueOnce(
      Object.assign(new Error("falhou"), { name: "CredentialsSignin" }),
    );

    const destino = await enviar({ email: EMAIL, password: SENHA });
    const codigo = new URL(destino!, "http://localhost").searchParams.get(
      LOGIN_ERROR_PARAM,
    );

    expect(Object.values(LOGIN_ERRORS)).toContain(codigo);
  });

  it("todo código previsto tem mensagem para a página renderizar", () => {
    // Sem isto, um código novo chegaria à página e não exibiria nada.
    for (const codigo of Object.values(LOGIN_ERRORS)) {
      expect(LOGIN_ERROR_MESSAGES[codigo]).toBeTruthy();
    }
  });

  it("preserva a intenção de plano ao voltar", async () => {
    signIn.mockRejectedValueOnce(
      Object.assign(new Error("falhou"), { name: "CredentialsSignin" }),
    );

    const destino = await enviar({
      email: EMAIL,
      password: SENHA,
      plan: "pro",
      billing: "yearly",
    });

    expect(destino).toContain("plan=pro");
    expect(destino).toContain("billing=yearly");
  });
});

describe("loginFormAction — sucesso", () => {
  it("deixa o redirecionamento do signIn passar, sem redirecionar para erro", async () => {
    // No sucesso o `signIn` lança NEXT_REDIRECT; a action não pode engolir.
    const nextRedirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/dashboard;303;",
    });
    signIn.mockRejectedValueOnce(nextRedirect);

    await expect(enviar({ email: EMAIL, password: SENHA })).rejects.toBe(nextRedirect);
    expect(redirect).not.toHaveBeenCalled();
  });
});
