import { formatDateTime } from "@/lib/formatters";

/**
 * Ponto-e-vírgula, não vírgula: o Excel em português usa a vírgula como
 * separador decimal e só reconhece `;` como separador de coluna. Com `,` a
 * planilha abre com tudo espremido numa coluna só.
 */
export const CSV_DELIMITER = ";";

/**
 * O Excel só entende os acentos se o arquivo começar com esta marca. Sem ela,
 * "Sorveteria Ação" abre como "SorveteriaÃ§Ã£o".
 */
export const CSV_BOM = "﻿";

// Excel e Google Sheets tratam como fórmula toda célula que começa com um
// destes caracteres. Uma razão social digitada como `=HYPERLINK(...)` viraria
// código executável na máquina de quem abre a planilha.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

// Número puro (inclusive negativo) nunca é fórmula. Sem esta exceção, todo
// valor negativo sairia como texto e o Excel não somaria a coluna.
const NUMERIC = /^-?\d+(?:[.,]\d+)?$/;

const NEEDS_QUOTING = new RegExp(`["\\n\\r${CSV_DELIMITER}]`);

/**
 * Prefixar com apóstrofo é o que neutraliza a fórmula: o Excel mostra o texto
 * original e não avalia nada. Escapar as aspas sozinho não resolveria — o
 * problema não é o parser de CSV, é o que a planilha faz com a célula depois.
 */
export function escapeCsvField(value: string): string {
  const guarded =
    FORMULA_TRIGGER.test(value) && !NUMERIC.test(value) ? `'${value}` : value;

  return NEEDS_QUOTING.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsvRow(cells: readonly string[]): string {
  return `${cells.map(escapeCsvField).join(CSV_DELIMITER)}\r\n`;
}

/**
 * `DD/MM/AAAA HH:mm`. O `Intl` insere uma vírgula entre data e hora, e o Excel
 * pt-BR não reconhece esse formato como data: a coluna entra como texto e para
 * de ordenar e filtrar como data — justamente o que se quer numa planilha de
 * contabilidade.
 */
export function toCsvDateTime(value: Date): string {
  return formatDateTime(value).replace(", ", " ");
}

/** Decimal com vírgula, para o Excel pt-BR reconhecer como número. */
export function toCsvNumber(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/**
 * Nome de arquivo seguro para o cabeçalho `Content-Disposition`. Aspas e
 * quebras de linha ali permitiriam forjar cabeçalhos adicionais.
 */
export function toCsvFilename(prefix: string, date: Date): string {
  const stamp = date.toISOString().slice(0, 10);
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "");

  return `${safePrefix}-${stamp}.csv`;
}
