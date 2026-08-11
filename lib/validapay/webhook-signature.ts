import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificação do header `X-Webhook-Signature` da ValidaPay.
 *
 * Formato documentado: `t={timestamp},v1={hmac_sha256}`, com a assinatura
 * calculada sobre `HMAC-SHA256(secret, "{timestamp}.{rawBody}")`.
 *
 * **O `rawBody` tem de ser o texto EXATO recebido.** `JSON.parse` seguido de
 * `JSON.stringify` produz bytes diferentes — ordem de chaves, espaçamento,
 * escapes — e a assinatura deixaria de bater por defeito do nosso código, não
 * por adulteração. Por isso a rota lê o corpo como texto antes de qualquer
 * parsing, e esta função nunca recebe um objeto.
 *
 * É autenticação de MENSAGEM, não só de remetente: diferente de um token
 * portador, a assinatura cobre o conteúdo, então um corpo alterado no caminho
 * não passa mesmo que o segredo vaze do lado de quem só observa.
 */

/**
 * Tolerância de relógio para aceitar o `t` do header.
 *
 * **Decisão nossa.** A documentação da ValidaPay descreve o cálculo da
 * assinatura mas NÃO define janela de replay — sem um teto, uma requisição
 * capturada continuaria válida para sempre, que é justamente o que o
 * timestamp assinado existe para impedir. Cinco minutos cobrem latência de
 * entrega e relógios levemente dessincronizados.
 */
export const JANELA_DE_REPLAY_MS = 5 * 60 * 1000;

export type FalhaDeAssinatura =
  | "SEM_SEGREDO"
  | "HEADER_AUSENTE"
  | "HEADER_MALFORMADO"
  | "TIMESTAMP_INVALIDO"
  | "TIMESTAMP_FORA_DA_JANELA"
  | "ASSINATURA_INVALIDA";

export type ResultadoDeVerificacao =
  { valido: true; timestamp: number } | { valido: false; motivo: FalhaDeAssinatura };

export interface VerificarAssinaturaInput {
  /** Texto EXATO do corpo, antes de qualquer `JSON.parse`. */
  readonly rawBody: string;
  /** Conteúdo de `X-Webhook-Signature`, ou `null` se ausente. */
  readonly header: string | null;
  /** `VALIDAPAY_WEBHOOK_SECRET`. Ausente ⇒ falha fechada. */
  readonly secret: string | undefined;
  /** Injetável para teste; padrão é o relógio real. */
  readonly agora?: number;
}

/**
 * @returns `valido: false` com o MOTIVO — que serve para log e métrica, nunca
 *          para a resposta HTTP: detalhar a quem falhou por que falhou ajuda
 *          mais quem sonda do que quem integra.
 */
export function verificarAssinatura({
  rawBody,
  header,
  secret,
  agora = Date.now(),
}: VerificarAssinaturaInput): ResultadoDeVerificacao {
  // Falha fechada: sem segredo configurado NÃO existe modo permissivo. A
  // alternativa — aceitar quando não há o que verificar — transformaria uma
  // variável esquecida num endpoint público que ativa assinaturas.
  if (!secret) return { valido: false, motivo: "SEM_SEGREDO" };
  if (!header) return { valido: false, motivo: "HEADER_AUSENTE" };

  const partes = analisarHeader(header);
  if (!partes) return { valido: false, motivo: "HEADER_MALFORMADO" };

  const emMs = normalizarTimestampParaMs(partes.t);
  if (emMs === null) {
    return { valido: false, motivo: "TIMESTAMP_INVALIDO" };
  }

  // O valor absoluto cobre os dois lados: atrasado é replay, adiantado é
  // relógio errado ou timestamp forjado para nunca expirar.
  if (Math.abs(agora - emMs) > JANELA_DE_REPLAY_MS) {
    return { valido: false, motivo: "TIMESTAMP_FORA_DA_JANELA" };
  }

  const esperada = createHmac("sha256", secret)
    .update(`${partes.t}.${rawBody}`)
    .digest("hex");

  if (!comparacaoSegura(esperada, partes.v1)) {
    return { valido: false, motivo: "ASSINATURA_INVALIDA" };
  }

  return { valido: true, timestamp: emMs };
}

/**
 * `t=...,v1=...` em qualquer ordem, tolerando espaços.
 *
 * **`t` ou `v1` repetidos invalidam o header.** Ficar com o primeiro ou com o
 * último seria escolher em silêncio entre dois valores conflitantes — e um
 * emissor legítimo nunca manda dois. Quem manda está confuso ou testando qual
 * dos dois o servidor honra, e nenhuma das respostas deve ser "um deles".
 *
 * Chaves DESCONHECIDAS continuam ignoradas, inclusive repetidas ou vazias: um
 * `v2` futuro não pode derrubar a verificação do `v1` que continua vindo.
 */
function analisarHeader(header: string): { t: string; v1: string } | null {
  let t: string | undefined;
  let v1: string | undefined;

  for (const parte of header.split(",")) {
    const separador = parte.indexOf("=");
    if (separador === -1) return null;

    const chave = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();
    if (chave.length === 0) return null;

    if (chave === "t") {
      if (t !== undefined || valor.length === 0) return null;
      t = valor;
    } else if (chave === "v1") {
      if (v1 !== undefined || valor.length === 0) return null;
      v1 = valor;
    }
  }

  if (t === undefined || v1 === undefined) return null;

  return { t, v1 };
}

/**
 * Abaixo deste valor, `t` é lido como segundos; acima, como milissegundos.
 *
 * 1e12 ms é 2001, e 1e12 s seria o ano 33658 — nenhum timestamp real fica
 * ambíguo entre as duas leituras dentro da vida útil deste código.
 */
const LIMIAR_DE_MILISSEGUNDOS = 1e12;

/** Só dígitos. Nada de sinal, ponto, hexadecimal ou notação científica. */
const SOMENTE_DIGITOS = /^\d+$/;

/**
 * `t` → milissegundos, ou `null` se não for aceitável.
 *
 * A validação é por FORMATO antes de converter. `Number` sozinho aceitaria
 * `0x10`, `1e10`, `+12` e `  9 ` — formas que nenhum emissor legítimo usa e
 * que só ampliam a superfície de entrada. `parseInt` seria pior ainda: leria
 * `"123abc"` como `123`, aceitando lixo com um prefixo numérico.
 *
 * `isSafeInteger` fecha o resto: acima de 2^53 a aritmética de ponto flutuante
 * deixa de distinguir inteiros vizinhos, e a comparação de janela passaria a
 * ser feita sobre um número que não é o que foi enviado.
 *
 * **O suporte a segundos E milissegundos é decisão DEFENSIVA**, não
 * preferência: a documentação da ValidaPay descreve o cálculo da assinatura
 * mas NÃO declara a unidade de `t`. Escolher a errada erraria por um fator de
 * mil — rejeitando toda entrega ou aceitando qualquer carimbo. Fixar numa
 * única unidade quando ela estiver documentada, ou observada num payload real.
 */
function normalizarTimestampParaMs(t: string): number | null {
  if (!SOMENTE_DIGITOS.test(t)) return null;

  const valor = Number(t);
  if (!Number.isSafeInteger(valor) || valor <= 0) return null;

  return valor < LIMIAR_DE_MILISSEGUNDOS ? valor * 1000 : valor;
}

/**
 * Comparação em tempo constante.
 *
 * `===` sai no primeiro byte diferente, e o tempo de resposta revelaria
 * quantos bytes iniciais estão corretos — o suficiente para descobrir uma
 * assinatura byte a byte. `timingSafeEqual` exige buffers do MESMO tamanho e
 * lança se diferirem, então o comprimento é checado antes; essa checagem não
 * vaza nada além do tamanho, que já é público pelo algoritmo.
 */
function comparacaoSegura(esperada: string, recebida: string): boolean {
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(recebida, "utf8");

  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * `x-access-token`, quando `VALIDAPAY_WEBHOOK_TOKEN` estiver configurado.
 *
 * Camada ADICIONAL, jamais substituta: é segredo portador, autentica o
 * remetente e não a mensagem. Quem confia só nele aceita um corpo adulterado
 * por quem tenha lido o token em qualquer log ou proxy do caminho.
 */
export function verificarAccessToken(
  recebido: string | null,
  esperado: string | undefined,
): boolean {
  if (!esperado) return true;
  if (!recebido) return false;

  return comparacaoSegura(esperado, recebido);
}
