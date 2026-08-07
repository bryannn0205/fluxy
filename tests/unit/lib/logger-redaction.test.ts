import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";

/** Captura a linha JSON que o logger escreve, sem deixá-la sujar a saída. */
function capturar(executar: () => void): string {
  const escritas: string[] = [];
  const stdout = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((linha) => (escritas.push(String(linha)), true));
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((linha) => (escritas.push(String(linha)), true));

  executar();

  stdout.mockRestore();
  stderr.mockRestore();
  return escritas.join("");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("redação de dados do pagador", () => {
  // Campos que o payload de `payment.success` da ValidaPay traz dentro de
  // `payer`. São dados de terceiro, e o Fluxy não os guarda — mas basta um
  // log descuidado para eles ficarem registrados assim mesmo.
  const CASOS = [
    ["taxId", "12345678901"],
    ["account", "0001234567"],
    ["bank", "341"],
    ["branch", "0001"],
  ] as const;

  for (const [chave, valor] of CASOS) {
    it(`redige ${chave}`, () => {
      const saida = capturar(() => logger.info("evento recebido", { [chave]: valor }));

      expect(saida).toContain("[REDACTED]");
      expect(saida).not.toContain(valor);
    });
  }

  it("redige o objeto payer inteiro, campo a campo", () => {
    const saida = capturar(() =>
      logger.info("webhook", {
        payer: {
          name: "Fulano",
          taxId: "98765432100",
          bank: "260",
          account: "9876543",
          branch: "0002",
          accountType: "CHECKING",
        },
      }),
    );

    for (const sigiloso of ["98765432100", "260", "9876543", "0002"]) {
      expect(saida).not.toContain(sigiloso);
    }
    // `name` não é sigiloso e continua legível — a redação é por chave, não
    // um apagamento cego do objeto.
    expect(saida).toContain("Fulano");
  });

  it("continua redigindo o que já redigia", () => {
    const saida = capturar(() =>
      logger.error("falha", {
        password: "senha-secreta",
        access_token: "token-secreto",
        client_secret: "segredo-do-cliente",
        authorization: "Bearer abc",
        cpf: "11122233344",
      }),
    );

    for (const sigiloso of [
      "senha-secreta",
      "token-secreto",
      "segredo-do-cliente",
      "Bearer abc",
      "11122233344",
    ]) {
      expect(saida).not.toContain(sigiloso);
    }
  });

  it("não redige demais — companyId e resource seguem legíveis", () => {
    const saida = capturar(() =>
      logger.info("ok", { companyId: "cmp_123", resource: "plan", duration: 42 }),
    );

    expect(saida).toContain("cmp_123");
    expect(saida).toContain("plan");
    expect(saida).toContain("42");
  });
});

describe("o schema não guarda segredo nem dado de cartão", () => {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

  it("nenhuma coluna de dado de cartão", () => {
    for (const proibido of ["cardNumber", "cvv", "cardHolder", "expiryDate"]) {
      expect(schema).not.toContain(proibido);
    }
  });

  it("nenhuma coluna guarda credencial da integração", () => {
    // O client_secret vive só no ambiente, e o access_token só em memória do
    // processo — nenhum dos dois em repouso no banco.
    for (const proibido of ["clientSecret", "client_secret", "accessToken"]) {
      expect(schema).not.toContain(proibido);
    }
  });

  it("as tabelas de pagamento não têm coluna de PII do pagador", () => {
    const trechoDeEventos = schema.slice(schema.indexOf("model PaymentProviderEvent"));

    for (const proibido of ["taxId", "payerName", "bankAccount", "branch"]) {
      expect(trechoDeEventos).not.toContain(proibido);
    }
  });
});
