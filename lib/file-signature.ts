// O `file.type` de um FormData é só o que o navegador reportou na seleção —
// nada impede um cliente forjado de declarar "image/png" para bytes de
// qualquer outro conteúdo (ex.: HTML/script disfarçado de imagem, servido
// depois pelo R2 com o Content-Type declarado). Checar a assinatura real
// (magic number) dos primeiros bytes é a defesa contra isso, complementar à
// checagem de extensão/MIME já feita no schema.
const SIGNATURE_CHECKS: Record<string, (buffer: Buffer) => boolean> = {
  "image/jpeg": (buffer) =>
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  "image/png": (buffer) =>
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a,
  "image/webp": (buffer) =>
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP",
  "application/pdf": (buffer) =>
    buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-",
};

/** Confere se os bytes do arquivo batem com a assinatura esperada para o MIME type declarado. */
export function matchesFileSignature(buffer: Buffer, mimeType: string): boolean {
  const check = SIGNATURE_CHECKS[mimeType];
  return check ? check(buffer) : false;
}
