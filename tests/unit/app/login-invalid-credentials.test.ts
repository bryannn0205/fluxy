// De `@auth/core/errors`, e não de `next-auth`: importar o pacote inteiro
// puxa o runtime do Next para dentro do teste. É a MESMA classe — o
// next-auth apenas reexporta (`export { CredentialsSignin } from
// "@auth/core/errors"`) e há uma única cópia de @auth/core na árvore, então
// o `instanceof` do código de produção reconhece esta instância.
import { CredentialsSignin } from "@auth/core/errors";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LOGIN_ERRORS, LOGIN_ERROR_MESSAGES } from "@/lib/constants";
import type * as RateLimitModule from "@/lib/rate-limit";

/**
 * Credencial inválida precisa virar mensagem, não erro 500.
 *
 * O tratamento decidia por `error.name === "CredentialsSignin"`. O Auth.js
 * monta o erro com `this.name = this.constructor.name` — o nome do
 * IDENTIFICADOR da classe —, e o minificador do build de produção reescreve
 * esse identificador para uma letra. A comparação passava em desenvolvimento,
 * onde não há minificação, e falhava exatamente em produção: o erro escapava
 * para o `throw` e quem errava a senha recebia 500.
 *
 * Por isso o teste central aqui é o que APAGA o `name` antes de entregar o
 * erro: ele reproduz o build de produção sem precisar de um, e falha se
 * alguém voltar a comparar por nome.
 */

const SENHA = "senha-sintetica-de-teste";
const EMAIL = "pessoa@teste.com";

const signIn = vi.fn();
const checkRateLimit = vi.fn().mockResolvedValue({ allowed: true, remaining: 5 });

// O mock devolve a classe REAL de erro: só o `signIn` é substituído. Se
// devolvesse um dublê, o `instanceof` do código passaria por construção e o
// teste não provaria nada.
vi.mock("@/lib/auth", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
  CredentialsSignin,
}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Map([["x-forwarded-for", "203.0.113.7"]])),
}));
vi.mock("@/lib/rate-limit", async () => {
  const real = await vi.importActual<typeof RateLimitModule>("@/lib/rate-limit");
  return { ...real, checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) };
});

async function entrar(email = EMAIL, senha = SENHA) {
  const { loginAction } = await import("@/app/(auth)/login/actions");
  return loginAction({ email, password: senha });
}

afterEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 5 });
});

describe("loginAction — credencial inválida vira mensagem, não 500", () => {
  it("trata o CredentialsSignin real do Auth.js", async () => {
    signIn.mockRejectedValueOnce(new CredentialsSignin());

    await expect(entrar()).resolves.toEqual({
      error: LOGIN_ERROR_MESSAGES[LOGIN_ERRORS.CREDENCIAIS],
    });
  });

  it("trata mesmo quando o nome da classe foi minificado", async () => {
    // É ISTO que quebrava em produção. O minificador troca o identificador da
    // classe, então `error.name` chega como "v" — e a comparação por string
    // deixava o erro escapar para o `throw`, virando 500.
    const erro = new CredentialsSignin();
    Object.defineProperty(erro, "name", { value: "v", configurable: true });

    signIn.mockRejectedValueOnce(erro);

    const resultado = await entrar();

    expect(resultado).toEqual({
      error: LOGIN_ERROR_MESSAGES[LOGIN_ERRORS.CREDENCIAIS],
    });
    // Prova de que o teste testou o que diz testar.
    expect(erro.name).toBe("v");
    expect(erro).toBeInstanceOf(CredentialsSignin);
  });

  it("usuário inexistente e senha incorreta devolvem a MESMA mensagem", async () => {
    // O Auth.js produz CredentialsSignin nos dois casos, porque `authorize`
    // devolve null nos dois. Responder diferente entregaria quais e-mails têm
    // conta a qualquer um com um navegador.
    signIn.mockRejectedValueOnce(new CredentialsSignin());
    const inexistente = await entrar("nao-existe@teste.com", SENHA);

    signIn.mockRejectedValueOnce(new CredentialsSignin());
    const senhaErrada = await entrar(EMAIL, "outra-senha-sintetica");

    expect(inexistente).toEqual(senhaErrada);
    expect(inexistente).toEqual({
      error: LOGIN_ERROR_MESSAGES[LOGIN_ERRORS.CREDENCIAIS],
    });
  });

  it("não vaza o erro interno do Auth.js na resposta", async () => {
    const erro = new CredentialsSignin();
    erro.cause = { err: new Error("detalhe interno do provedor") };
    signIn.mockRejectedValueOnce(erro);

    const resultado = await entrar();
    const serializado = JSON.stringify(resultado);

    expect(serializado).not.toContain("detalhe interno");
    expect(serializado).not.toContain("authjs");
    expect(serializado).not.toContain("stack");
    expect(serializado).not.toContain(SENHA);
    expect(serializado).not.toContain(EMAIL);
  });
});

describe("loginAction — o que NÃO pode ser engolido", () => {
  it("relança erro inesperado em vez de virar mensagem de credencial", async () => {
    // Um banco fora do ar não é "senha errada": engolir isso esconderia uma
    // falha real atrás de uma mensagem que manda o usuário tentar de novo.
    const inesperado = new Error("conexão com o banco falhou");
    signIn.mockRejectedValueOnce(inesperado);

    await expect(entrar()).rejects.toBe(inesperado);
  });

  it("relança o NEXT_REDIRECT do login bem-sucedido", async () => {
    // No sucesso o `signIn` sinaliza por exceção; capturá-la impediria o
    // redirecionamento para o painel.
    const redirecionamento = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/dashboard;303;",
    });
    signIn.mockRejectedValueOnce(redirecionamento);

    await expect(entrar()).rejects.toBe(redirecionamento);
  });

  it("um AuthError que não é de credencial continua sendo relançado", async () => {
    // Configuração quebrada precisa aparecer como erro, não como "senha
    // incorreta" — senão ninguém descobre que o servidor está mal configurado.
    const { AuthError } = await import("@auth/core/errors");
    const configuracao = new AuthError("configuração inválida");
    signIn.mockRejectedValueOnce(configuracao);

    await expect(entrar()).rejects.toBe(configuracao);
  });
});

describe("loginAction — o resto do fluxo segue igual", () => {
  it("respeita o limite de tentativas antes de chamar o signIn", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });

    const resultado = await entrar();

    expect(resultado).toEqual({ error: LOGIN_ERROR_MESSAGES[LOGIN_ERRORS.LIMITE] });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("rejeita entrada inválida antes de qualquer chamada externa", async () => {
    const { loginAction } = await import("@/app/(auth)/login/actions");

    const resultado = await loginAction({ email: "isto-nao-e-email", password: "" });

    expect(resultado.error).toBe(LOGIN_ERROR_MESSAGES[LOGIN_ERRORS.INVALIDO]);
    expect(signIn).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
