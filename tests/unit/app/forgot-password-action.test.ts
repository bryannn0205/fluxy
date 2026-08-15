import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O formulário de "esqueci minha senha" é um oráculo de enumeração em
 * potencial: quem responde diferente para e-mail com conta e sem conta entrega
 * a lista de clientes a qualquer um com um navegador.
 *
 * Estes testes fixam a única propriedade que impede isso — a resposta pública
 * é BYTE A BYTE a mesma nos três caminhos —, inclusive quando o provedor de
 * e-mail falha. A falha do provedor é o caso que mais importa: ela só pode
 * acontecer depois de a conta ter sido encontrada, então deixá-la escapar para
 * a resposta transforma "erro inesperado" em "esta conta existe".
 */

const EMAIL_COM_CONTA = "com-conta@teste.com";
const EMAIL_SEM_CONTA = "sem-conta@teste.com";
const TOKEN_DE_TESTE = "token-sintetico-de-teste";

const findFirst = vi.fn();
const sendEmail = vi.fn();
const criarToken = vi.fn();
const checkRateLimit = vi.fn();
const loggerError = vi.fn();

function montarAmbiente() {
  vi.doMock("@/lib/env", () => ({
    env: { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
  }));
  vi.doMock("@/lib/db", () => ({ prisma: { user: { findFirst } } }));
  vi.doMock("@/lib/email", () => ({
    sendEmail,
    passwordResetEmail: (url: string) => `<p>${url}</p>`,
  }));
  vi.doMock("@/lib/tokens", () => ({ createPasswordResetToken: criarToken }));
  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimit,
    RATE_LIMITS: { PASSWORD_RESET: { limit: 3, windowSeconds: 3600 } },
  }));
  vi.doMock("@/lib/logger", () => ({
    logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  }));
}

async function carregarAction() {
  const { forgotPasswordAction } = await import("@/app/(auth)/forgot-password/actions");
  return forgotPasswordAction;
}

/** Conta encontrada, envio bem-sucedido. */
function cenarioEnvioNormal() {
  findFirst.mockResolvedValue({ id: "user_1", email: EMAIL_COM_CONTA });
  criarToken.mockResolvedValue(TOKEN_DE_TESTE);
  sendEmail.mockResolvedValue(undefined);
}

/** Conta encontrada, provedor de e-mail fora do ar. */
function cenarioProvedorFalhando() {
  findFirst.mockResolvedValue({ id: "user_1", email: EMAIL_COM_CONTA });
  criarToken.mockResolvedValue(TOKEN_DE_TESTE);
  sendEmail.mockRejectedValue(new Error("Email send failed: domain not verified"));
}

/** Nenhuma conta com aquele e-mail. */
function cenarioSemConta() {
  findFirst.mockResolvedValue(null);
}

beforeEach(() => {
  vi.resetModules();
  for (const espiao of [findFirst, sendEmail, criarToken, checkRateLimit, loggerError]) {
    espiao.mockReset();
  }
  checkRateLimit.mockResolvedValue({ allowed: true, remaining: 3 });
  montarAmbiente();
});

afterEach(() => {
  for (const modulo of [
    "@/lib/env",
    "@/lib/db",
    "@/lib/email",
    "@/lib/tokens",
    "@/lib/rate-limit",
    "@/lib/logger",
  ]) {
    vi.doUnmock(modulo);
  }
});

describe("forgotPasswordAction — anti-enumeração", () => {
  it("e-mail sem conta recebe resposta neutra e não dispara envio", async () => {
    cenarioSemConta();
    const forgotPasswordAction = await carregarAction();

    const resultado = await forgotPasswordAction({ email: EMAIL_SEM_CONTA });

    expect(resultado).toEqual({ data: null });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("e-mail com conta e envio bem-sucedido recebe a mesma resposta neutra", async () => {
    cenarioEnvioNormal();
    const forgotPasswordAction = await carregarAction();

    const resultado = await forgotPasswordAction({ email: EMAIL_COM_CONTA });

    expect(resultado).toEqual({ data: null });
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("e-mail com conta e provedor falhando recebe a mesma resposta neutra", async () => {
    cenarioProvedorFalhando();
    const forgotPasswordAction = await carregarAction();

    const resultado = await forgotPasswordAction({ email: EMAIL_COM_CONTA });

    expect(resultado).toEqual({ data: null });
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("falha ao emitir o token também não muda a resposta", async () => {
    findFirst.mockResolvedValue({ id: "user_1", email: EMAIL_COM_CONTA });
    criarToken.mockRejectedValue(new Error("banco indisponível"));
    const forgotPasswordAction = await carregarAction();

    const resultado = await forgotPasswordAction({ email: EMAIL_COM_CONTA });

    expect(resultado).toEqual({ data: null });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("os três caminhos produzem respostas indistinguíveis entre si", async () => {
    const respostas: unknown[] = [];

    for (const preparar of [
      cenarioSemConta,
      cenarioEnvioNormal,
      cenarioProvedorFalhando,
    ]) {
      vi.resetModules();
      for (const espiao of [findFirst, sendEmail, criarToken, loggerError]) {
        espiao.mockReset();
      }
      montarAmbiente();
      preparar();

      const forgotPasswordAction = await carregarAction();
      respostas.push(await forgotPasswordAction({ email: EMAIL_COM_CONTA }));
    }

    // Serializado, e não só `toEqual`: pega diferença de chave presente-porém-
    // indefinida, que passaria despercebida na comparação estrutural e ainda
    // assim mudaria o corpo que chega ao navegador.
    const serializadas = respostas.map((resposta) => JSON.stringify(resposta));
    expect(new Set(serializadas).size).toBe(1);
    expect(serializadas[0]).toBe(JSON.stringify({ data: null }));
  });

  it("nenhuma resposta carrega campo de erro que denuncie a existência da conta", async () => {
    cenarioProvedorFalhando();
    const forgotPasswordAction = await carregarAction();

    const resultado = await forgotPasswordAction({ email: EMAIL_COM_CONTA });

    expect(resultado).not.toHaveProperty("error");
    expect(resultado).not.toHaveProperty("fields");
  });
});

describe("forgotPasswordAction — registro da falha", () => {
  it("a falha do provedor é registrada como erro para não passar despercebida", async () => {
    cenarioProvedorFalhando();
    const forgotPasswordAction = await carregarAction();

    await forgotPasswordAction({ email: EMAIL_COM_CONTA });

    expect(loggerError).toHaveBeenCalledOnce();
    const [mensagem] = loggerError.mock.calls[0]!;
    expect(mensagem).toContain("redefinição de senha");
  });

  it("o token de redefinição nunca aparece no contexto do log", async () => {
    cenarioProvedorFalhando();
    const forgotPasswordAction = await carregarAction();

    await forgotPasswordAction({ email: EMAIL_COM_CONTA });

    const registrado = JSON.stringify(loggerError.mock.calls);
    expect(registrado).not.toContain(TOKEN_DE_TESTE);
  });
});
