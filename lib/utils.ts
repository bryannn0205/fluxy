import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Campos opcionais de formulário chegam como "" ou undefined; colunas do
// banco são nullable. Normaliza os dois para null antes de persistir —
// necessário porque exactOptionalPropertyTypes distingue `undefined` de
// campo ausente, e o Prisma espera `null` para "sem valor".
export function emptyToNull(value: string | undefined): string | null {
  return value ? value : null;
}

// Remove chaves com valor `undefined`. Necessário porque, sob
// exactOptionalPropertyTypes, o Prisma aceita uma chave opcional AUSENTE
// mas não uma chave PRESENTE com valor `undefined` — e um objeto parcial
// construído a partir de Zod .partial() sempre inclui as duas formas.
// A asserção no retorno é segura: o próprio corpo da função garante que
// nenhuma chave remanescente tem valor undefined.
export function stripUndefined<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result as { [K in keyof T]?: Exclude<T[K], undefined> };
}
