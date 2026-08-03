import { describe, expect, it } from "vitest";

import { matchesFileSignature } from "@/lib/file-signature";

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
]);
const PDF_BYTES = Buffer.from("%PDF-1.7\n", "ascii");
const HTML_DISGUISED_AS_IMAGE = Buffer.from("<script>alert(1)</script>", "ascii");

describe("matchesFileSignature", () => {
  it("aceita JPEG com magic bytes corretos", () => {
    expect(matchesFileSignature(JPEG_BYTES, "image/jpeg")).toBe(true);
  });

  it("aceita PNG com magic bytes corretos", () => {
    expect(matchesFileSignature(PNG_BYTES, "image/png")).toBe(true);
  });

  it("aceita WEBP com header RIFF/WEBP corretos", () => {
    expect(matchesFileSignature(WEBP_BYTES, "image/webp")).toBe(true);
  });

  it("aceita PDF com header %PDF- correto", () => {
    expect(matchesFileSignature(PDF_BYTES, "application/pdf")).toBe(true);
  });

  it("rejeita conteúdo HTML disfarçado de imagem", () => {
    expect(matchesFileSignature(HTML_DISGUISED_AS_IMAGE, "image/png")).toBe(false);
  });

  it("rejeita bytes de PNG declarados como JPEG", () => {
    expect(matchesFileSignature(PNG_BYTES, "image/jpeg")).toBe(false);
  });

  it("rejeita MIME type fora da allowlist conhecida", () => {
    expect(matchesFileSignature(JPEG_BYTES, "application/javascript")).toBe(false);
  });

  it("rejeita buffer vazio", () => {
    expect(matchesFileSignature(Buffer.alloc(0), "image/jpeg")).toBe(false);
  });
});
