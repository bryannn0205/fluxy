import { describe, expect, it } from "vitest";

import {
  escapeCsvField,
  toCsvDateTime,
  toCsvFilename,
  toCsvNumber,
  toCsvRow,
} from "@/lib/csv";

describe("escapeCsvField", () => {
  it("deixa texto simples intacto", () => {
    expect(escapeCsvField("Padaria do Zé")).toBe("Padaria do Zé");
  });

  it("envolve em aspas quando o valor contém o separador", () => {
    expect(escapeCsvField("Silva; Souza")).toBe('"Silva; Souza"');
  });

  it("duplica aspas internas", () => {
    expect(escapeCsvField('Bar do "Zé"')).toBe('"Bar do ""Zé"""');
  });

  it("envolve em aspas quando há quebra de linha", () => {
    expect(escapeCsvField("Rua A\nSala 2")).toBe('"Rua A\nSala 2"');
  });

  describe("proteção contra injeção de fórmula", () => {
    // Uma célula começando com estes caracteres é avaliada pelo Excel e pelo
    // Sheets. Como o nome do cliente vem do usuário, sem isto o CSV vira um
    // vetor de execução na máquina de quem abre a planilha.
    it.each([
      ["=1+1", "'=1+1"],
      ['=HYPERLINK("http://mal.co")', '\'=HYPERLINK("http://mal.co")'],
      ["+34", "'+34"],
      ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
      ["\tTab", "'\tTab"],
    ])("neutraliza %j", (input, expected) => {
      const result = escapeCsvField(input);
      // O resultado pode vir entre aspas se também precisar de quoting; o que
      // importa é o apóstrofo antes do gatilho.
      expect(result.replace(/^"|"$/g, "").replace(/""/g, '"')).toBe(expected);
    });

    it("não estraga número negativo, que não é fórmula", () => {
      expect(escapeCsvField("-150.00")).toBe("-150.00");
      expect(escapeCsvField("-150,00")).toBe("-150,00");
      expect(escapeCsvField("-7")).toBe("-7");
    });

    it("ainda protege texto que começa com hífen sem ser número", () => {
      expect(escapeCsvField("-- comentário")).toBe("'-- comentário");
    });
  });
});

describe("toCsvRow", () => {
  it("junta com ponto-e-vírgula e termina em CRLF", () => {
    expect(toCsvRow(["a", "b", "c"])).toBe("a;b;c\r\n");
  });

  it("escapa cada célula", () => {
    expect(toCsvRow(["ok", "tem; separador"])).toBe('ok;"tem; separador"\r\n');
  });
});

describe("toCsvNumber", () => {
  it("usa vírgula decimal e duas casas", () => {
    expect(toCsvNumber(1250.5)).toBe("1250,50");
    expect(toCsvNumber(0)).toBe("0,00");
  });
});

describe("toCsvDateTime", () => {
  it("separa data e hora por espaço, sem a vírgula que o Intl insere", () => {
    const result = toCsvDateTime(new Date("2026-08-03T12:30:00Z"));

    expect(result).not.toContain(",");
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });
});

describe("toCsvFilename", () => {
  it("acrescenta a data no nome", () => {
    expect(toCsvFilename("pedidos", new Date("2026-08-03T15:00:00Z"))).toBe(
      "pedidos-2026-08-03.csv",
    );
  });

  it("remove caracteres que permitiriam forjar cabeçalho HTTP", () => {
    expect(toCsvFilename('ped"idos\r\nX-Evil: 1', new Date("2026-08-03T15:00:00Z"))).toBe(
      "pedidosX-Evil1-2026-08-03.csv",
    );
  });
});
