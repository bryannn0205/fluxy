import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  JANELA_DE_REPLAY_MS,
  verificarAccessToken,
  verificarAssinatura,
} from "@/lib/validapay/webhook-signature";

const SEGREDO = "segredo-de-teste-nunca-real";
const AGORA = new Date("2026-08-10T18:00:00.000Z").getTime();

const CORPO = JSON.stringify({
  event: "payment.success",
  chargeId: "cha_teste",
  amount: 29.9,
});

function assinar(rawBody: string, t: number, secret = SEGREDO): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const emSegundos = Math.floor(AGORA / 1000);

describe("assinatura válida", () => {
  it("aceita header bem formado com HMAC correto", () => {
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: assinar(CORPO, emSegundos),
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado.valido).toBe(true);
  });

  it("aceita timestamp em milissegundos — a doc não define a unidade", () => {
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: assinar(CORPO, AGORA),
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado.valido).toBe(true);
  });

  it("ignora campos desconhecidos no header", () => {
    const base = assinar(CORPO, emSegundos);
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: `${base},v2=algo-futuro`,
      secret: SEGREDO,
      agora: AGORA,
    });

    // Um `v2` futuro não pode derrubar a verificação do `v1` que continua vindo.
    expect(resultado.valido).toBe(true);
  });
});

describe("assinatura inválida", () => {
  it("recusa quando o segredo não está configurado — falha FECHADA", () => {
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: assinar(CORPO, emSegundos),
      secret: undefined,
      agora: AGORA,
    });

    // Sem segredo NÃO existe modo permissivo: aceitar aqui transformaria uma
    // variável esquecida num endpoint público que ativa assinaturas.
    expect(resultado).toEqual({ valido: false, motivo: "SEM_SEGREDO" });
  });

  it("recusa segredo vazio", () => {
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: assinar(CORPO, emSegundos),
      secret: "",
      agora: AGORA,
    });

    expect(resultado).toEqual({ valido: false, motivo: "SEM_SEGREDO" });
  });

  it("recusa header ausente", () => {
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: null,
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado).toEqual({ valido: false, motivo: "HEADER_AUSENTE" });
  });

  it.each([
    ["sem separador", "isto-nao-tem-igual"],
    ["sem v1", `t=${emSegundos}`],
    ["sem t", "v1=abc123"],
    ["valor vazio", `t=${emSegundos},v1=`],
    ["chave vazia", `=${emSegundos},v1=abc`],
  ])("recusa header malformado: %s", (_caso, header) => {
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header,
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(["HEADER_MALFORMADO", "TIMESTAMP_INVALIDO"]).toContain(resultado.motivo);
    }
  });

  it.each([
    ["t duplicado", `t=${emSegundos},t=${emSegundos + 1},v1=abc`],
    ["v1 duplicado", `t=${emSegundos},v1=abc,v1=def`],
    ["t duplicado com o mesmo valor", `t=${emSegundos},t=${emSegundos},v1=abc`],
  ])("recusa header com chave repetida: %s", (_caso, header) => {
    // Ficar com o primeiro ou com o último escolheria em silêncio entre dois
    // valores conflitantes. Emissor legítimo nunca manda dois.
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header,
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado).toEqual({ valido: false, motivo: "HEADER_MALFORMADO" });
  });

  it.each([
    ["t vazio", `t=,v1=abc`],
    ["v1 vazio", `t=${emSegundos},v1=`],
    ["ambos vazios", "t=,v1="],
  ])("recusa header com valor vazio: %s", (_caso, header) => {
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header,
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado).toEqual({ valido: false, motivo: "HEADER_MALFORMADO" });
  });

  it("chave DESCONHECIDA repetida ou vazia não invalida", () => {
    const base = assinar(CORPO, emSegundos);

    // Compatibilidade futura: só `t` e `v1` são estritos.
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: `${base},v2=a,v2=b,extra=`,
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado.valido).toBe(true);
  });
});

describe("formato do timestamp", () => {
  function comTimestamp(t: string) {
    return verificarAssinatura({
      rawBody: CORPO,
      header: `t=${t},v1=qualquer-coisa`,
      secret: SEGREDO,
      agora: AGORA,
    });
  }

  it.each([
    ["texto puro", "ontem"],
    ["dígitos com sufixo", "123abc"],
    ["decimal", "1786377301.5"],
    ["negativo", "-1786377301"],
    ["zero", "0"],
    ["notação científica", "1.78e9"],
    ["hexadecimal", "0x6A5B1C"],
    ["sinal explícito", "+1786377301"],
    ["espaço interno", "1786 377301"],
    ["acima do inteiro seguro", "99999999999999999999"],
  ])("recusa timestamp inválido: %s", (_caso, t) => {
    // `Number` sozinho aceitaria hex, científica e sinal; `parseInt` leria
    // "123abc" como 123. A validação é por FORMATO, antes de converter.
    expect(comTimestamp(t)).toEqual({ valido: false, motivo: "TIMESTAMP_INVALIDO" });
  });

  it("aceita segundos válidos e normaliza para milissegundos", () => {
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: assinar(CORPO, emSegundos),
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado.valido).toBe(true);
    if (resultado.valido) {
      expect(resultado.timestamp).toBe(emSegundos * 1000);
    }
  });

  it("aceita milissegundos válidos sem multiplicar", () => {
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: assinar(CORPO, AGORA),
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado.valido).toBe(true);
    if (resultado.valido) {
      expect(resultado.timestamp).toBe(AGORA);
    }
  });

  it("recusa assinatura calculada com outro segredo", () => {
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: assinar(CORPO, emSegundos, "outro-segredo-qualquer"),
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado).toEqual({ valido: false, motivo: "ASSINATURA_INVALIDA" });
  });

  it("recusa assinatura de comprimento diferente sem lançar", () => {
    // timingSafeEqual LANÇA com buffers de tamanhos diferentes — o comprimento
    // precisa ser checado antes, ou um header curto derrubaria a rota.
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: `t=${emSegundos},v1=abc`,
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado).toEqual({ valido: false, motivo: "ASSINATURA_INVALIDA" });
  });
});

describe("proteção de replay", () => {
  it("recusa timestamp expirado", () => {
    const antigo = Math.floor((AGORA - JANELA_DE_REPLAY_MS - 1000) / 1000);
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: assinar(CORPO, antigo),
      secret: SEGREDO,
      agora: AGORA,
    });

    // Sem teto, uma requisição capturada valeria para sempre.
    expect(resultado).toEqual({ valido: false, motivo: "TIMESTAMP_FORA_DA_JANELA" });
  });

  it("recusa timestamp futuro fora da janela", () => {
    const futuro = Math.floor((AGORA + JANELA_DE_REPLAY_MS + 1000) / 1000);
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: assinar(CORPO, futuro),
      secret: SEGREDO,
      agora: AGORA,
    });

    // Adiantado é relógio errado ou timestamp forjado para nunca expirar.
    expect(resultado).toEqual({ valido: false, motivo: "TIMESTAMP_FORA_DA_JANELA" });
  });

  it("aceita dentro da janela, nos dois sentidos", () => {
    const atrasado = Math.floor((AGORA - JANELA_DE_REPLAY_MS + 5000) / 1000);
    const adiantado = Math.floor((AGORA + JANELA_DE_REPLAY_MS - 5000) / 1000);

    expect(
      verificarAssinatura({
        rawBody: CORPO,
        header: assinar(CORPO, atrasado),
        secret: SEGREDO,
        agora: AGORA,
      }).valido,
    ).toBe(true);

    expect(
      verificarAssinatura({
        rawBody: CORPO,
        header: assinar(CORPO, adiantado),
        secret: SEGREDO,
        agora: AGORA,
      }).valido,
    ).toBe(true);
  });
});

describe("o corpo BRUTO é o que assina", () => {
  it("recusa corpo adulterado", () => {
    const header = assinar(CORPO, emSegundos);
    const adulterado = CORPO.replace("29.9", "0.01");

    const resultado = verificarAssinatura({
      rawBody: adulterado,
      header,
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado).toEqual({ valido: false, motivo: "ASSINATURA_INVALIDA" });
  });

  it("recusa corpo RESERIALIZADO com a mesma informação", () => {
    const header = assinar(CORPO, emSegundos);
    // Mesmos dados, bytes diferentes: indentação e ordem de chaves mudam.
    const reserializado = JSON.stringify(
      {
        amount: 29.9,
        chargeId: "cha_teste",
        event: "payment.success",
      },
      null,
      2,
    );

    expect(reserializado).not.toBe(CORPO);

    // É por isso que a rota lê request.text() ANTES de qualquer JSON.parse:
    // reserializar quebraria a assinatura por defeito nosso, não por ataque.
    const resultado = verificarAssinatura({
      rawBody: reserializado,
      header,
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado).toEqual({ valido: false, motivo: "ASSINATURA_INVALIDA" });
  });

  it("um byte a mais já invalida", () => {
    const header = assinar(CORPO, emSegundos);

    const resultado = verificarAssinatura({
      rawBody: `${CORPO} `,
      header,
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado.valido).toBe(false);
  });

  it("o timestamp faz parte da mensagem assinada", () => {
    const header = assinar(CORPO, emSegundos);
    const outroT = emSegundos + 1;
    const trocado = header.replace(`t=${emSegundos}`, `t=${outroT}`);

    // Trocar só o `t` invalida — é o que impede reusar uma assinatura antiga
    // com carimbo novo.
    const resultado = verificarAssinatura({
      rawBody: CORPO,
      header: trocado,
      secret: SEGREDO,
      agora: AGORA,
    });

    expect(resultado).toEqual({ valido: false, motivo: "ASSINATURA_INVALIDA" });
  });
});

describe("x-access-token", () => {
  it("não exigido quando não configurado", () => {
    expect(verificarAccessToken(null, undefined)).toBe(true);
    expect(verificarAccessToken(null, "")).toBe(true);
  });

  it("exigido e válido quando configurado", () => {
    expect(verificarAccessToken("token-de-teste", "token-de-teste")).toBe(true);
  });

  it("recusa token ausente quando configurado", () => {
    expect(verificarAccessToken(null, "token-de-teste")).toBe(false);
  });

  it("recusa token errado", () => {
    expect(verificarAccessToken("token-errado", "token-de-teste")).toBe(false);
  });

  it("recusa token de comprimento diferente sem lançar", () => {
    expect(verificarAccessToken("x", "token-de-teste")).toBe(false);
  });
});
