import { describe, expect, it } from "vitest";

import {
  FILTROS_LIMPOS,
  aplicarFiltros,
  haFiltroAtivo,
  type FiltrosDeProducao,
} from "@/app/dashboard/production/_components/filtros";
import type { ClientKanbanOrder } from "@/types/orders";

// 18/08/2026, meio-dia em Brasília. Instante fixo porque "hoje" e "últimos 7
// dias" dependem do relógio, e um teste preso ao real passa hoje e falha em
// outubro.
const AGORA = new Date("2026-08-18T15:00:00Z");

function pedido(overrides: Partial<ClientKanbanOrder> = {}): ClientKanbanOrder {
  return {
    id: crypto.randomUUID(),
    orderNumber: "0001",
    status: "PENDING",
    priority: "NORMAL",
    expectedDeliveryDate: null,
    total: null,
    itemCount: 1,
    createdAt: new Date("2026-08-18T13:00:00Z"),
    customer: { id: "cliente-1", name: "Cliente Teste" },
    ...overrides,
  };
}

const com = (parcial: Partial<FiltrosDeProducao>): FiltrosDeProducao => ({
  ...FILTROS_LIMPOS,
  ...parcial,
});

const numeros = (orders: ClientKanbanOrder[]) => orders.map((o) => o.orderNumber);

describe("aplicarFiltros — busca", () => {
  const lista = [
    pedido({ orderNumber: "0042", customer: { id: "c1", name: "José da Silva" } }),
    pedido({ orderNumber: "0043", customer: { id: "c2", name: "Maria Antônia" } }),
    pedido({ orderNumber: "0100", customer: { id: "c3", name: "Padaria Central" } }),
  ];

  it("encontra pelo número do pedido", () => {
    expect(numeros(aplicarFiltros(lista, com({ busca: "0042" }), AGORA))).toEqual([
      "0042",
    ]);
  });

  it("encontra por parte do número", () => {
    expect(numeros(aplicarFiltros(lista, com({ busca: "42" }), AGORA))).toEqual(["0042"]);
  });

  it("aceita o número como ele aparece no cartão, com #", () => {
    // O cartão mostra "#0042"; quem copia de lá cola o "#" junto.
    expect(numeros(aplicarFiltros(lista, com({ busca: "#0042" }), AGORA))).toEqual([
      "0042",
    ]);
  });

  it("encontra pelo nome do cliente", () => {
    expect(numeros(aplicarFiltros(lista, com({ busca: "Padaria" }), AGORA))).toEqual([
      "0100",
    ]);
  });

  it("ignora a caixa das letras", () => {
    expect(numeros(aplicarFiltros(lista, com({ busca: "pADARIA" }), AGORA))).toEqual([
      "0100",
    ]);
  });

  it("ignora acentos, nos dois sentidos", () => {
    // Quem digita rápido não acentua; quem copiou do cadastro trouxe o acento.
    expect(numeros(aplicarFiltros(lista, com({ busca: "jose" }), AGORA))).toEqual([
      "0042",
    ]);
    expect(numeros(aplicarFiltros(lista, com({ busca: "antonia" }), AGORA))).toEqual([
      "0043",
    ]);
    expect(numeros(aplicarFiltros(lista, com({ busca: "José" }), AGORA))).toEqual([
      "0042",
    ]);
  });

  it("ignora espaços nas pontas", () => {
    expect(numeros(aplicarFiltros(lista, com({ busca: "  Padaria  " }), AGORA))).toEqual([
      "0100",
    ]);
  });

  it("devolve lista vazia quando nada corresponde", () => {
    expect(aplicarFiltros(lista, com({ busca: "inexistente" }), AGORA)).toEqual([]);
  });
});

describe("aplicarFiltros — prioridade", () => {
  const lista = [
    pedido({ orderNumber: "0001", priority: "URGENT" }),
    pedido({ orderNumber: "0002", priority: "HIGH" }),
    pedido({ orderNumber: "0003", priority: "NORMAL" }),
    pedido({ orderNumber: "0004", priority: "LOW" }),
  ];

  it.each(["URGENT", "HIGH", "NORMAL", "LOW"] as const)(
    "filtra exatamente os pedidos de prioridade %s",
    (prioridade) => {
      const resultado = aplicarFiltros(lista, com({ prioridade }), AGORA);
      expect(resultado).toHaveLength(1);
      expect(resultado[0]?.priority).toBe(prioridade);
    },
  );

  it("com TODAS não descarta nenhum", () => {
    expect(aplicarFiltros(lista, com({ prioridade: "TODAS" }), AGORA)).toHaveLength(4);
  });
});

describe("aplicarFiltros — período", () => {
  it("HOJE inclui o pedido criado exatamente à meia-noite de Brasília", () => {
    // 03:00 UTC é 00:00 em Brasília: o limite pertence ao dia que começa.
    const lista = [pedido({ createdAt: new Date("2026-08-18T03:00:00.000Z") })];
    expect(aplicarFiltros(lista, com({ periodo: "HOJE" }), AGORA)).toHaveLength(1);
  });

  it("HOJE exclui o pedido criado um instante antes da virada", () => {
    const lista = [pedido({ createdAt: new Date("2026-08-18T02:59:59.999Z") })];
    expect(aplicarFiltros(lista, com({ periodo: "HOJE" }), AGORA)).toEqual([]);
  });

  it("HOJE segue o dia de Brasília mesmo quando em UTC já virou", () => {
    // 19/08 00:30 UTC são 21:30 do dia 18 em São Paulo. Se o corte usasse UTC,
    // o expediente da noite zeraria o filtro três horas antes da hora.
    const agoraTarde = new Date("2026-08-19T01:00:00Z");
    const lista = [
      pedido({ orderNumber: "0009", createdAt: new Date("2026-08-19T00:30:00Z") }),
    ];

    expect(numeros(aplicarFiltros(lista, com({ periodo: "HOJE" }), agoraTarde))).toEqual([
      "0009",
    ]);
  });

  it("SETE_DIAS conta sete dias de calendário, incluindo hoje", () => {
    const lista = [
      // 12/08 00:00 em Brasília: o sétimo dia contado para trás, ainda dentro.
      pedido({ orderNumber: "dentro", createdAt: new Date("2026-08-12T03:00:00.000Z") }),
      // Uma hora antes disso já é o oitavo dia.
      pedido({ orderNumber: "fora", createdAt: new Date("2026-08-12T02:00:00.000Z") }),
    ];

    expect(numeros(aplicarFiltros(lista, com({ periodo: "SETE_DIAS" }), AGORA))).toEqual([
      "dentro",
    ]);
  });

  it("TODOS não descarta nem o pedido mais antigo", () => {
    const lista = [pedido({ createdAt: new Date("2024-01-01T12:00:00Z") })];
    expect(aplicarFiltros(lista, com({ periodo: "TODOS" }), AGORA)).toHaveLength(1);
  });
});

describe("aplicarFiltros — combinação", () => {
  const lista = [
    pedido({
      orderNumber: "0001",
      priority: "URGENT",
      customer: { id: "c1", name: "Padaria Central" },
      createdAt: new Date("2026-08-18T13:00:00Z"),
    }),
    pedido({
      orderNumber: "0002",
      priority: "URGENT",
      customer: { id: "c2", name: "Mercado Bom Preço" },
      createdAt: new Date("2026-08-01T13:00:00Z"),
    }),
    pedido({
      orderNumber: "0003",
      priority: "LOW",
      customer: { id: "c3", name: "Padaria Central" },
      createdAt: new Date("2026-08-18T13:00:00Z"),
    }),
  ];

  it("exige que o pedido passe em todos os filtros ativos", () => {
    const resultado = aplicarFiltros(
      lista,
      com({ busca: "padaria", prioridade: "URGENT", periodo: "HOJE" }),
      AGORA,
    );

    expect(numeros(resultado)).toEqual(["0001"]);
  });

  it("sem nenhum filtro devolve a lista inteira, na mesma ordem", () => {
    // A ordem vem de listForKanban (prioridade, depois entrada) e o filtro não
    // pode reordenar nada: a fila da produção é a ordem em que se trabalha.
    expect(numeros(aplicarFiltros(lista, FILTROS_LIMPOS, AGORA))).toEqual([
      "0001",
      "0002",
      "0003",
    ]);
  });

  it("não altera o array recebido", () => {
    const original = [...lista];
    aplicarFiltros(lista, com({ prioridade: "LOW" }), AGORA);
    expect(lista).toEqual(original);
  });
});

describe("haFiltroAtivo", () => {
  it("é falso com os filtros limpos", () => {
    expect(haFiltroAtivo(FILTROS_LIMPOS)).toBe(false);
  });

  it("é falso quando a busca tem só espaços", () => {
    // Senão o botão "Limpar filtros" apareceria por causa de um espaço solto.
    expect(haFiltroAtivo(com({ busca: "   " }))).toBe(false);
  });

  it.each([
    ["busca", com({ busca: "0001" })],
    ["prioridade", com({ prioridade: "URGENT" })],
    ["período", com({ periodo: "HOJE" })],
  ] as const)("é verdadeiro com %s preenchida", (_rotulo, filtros) => {
    expect(haFiltroAtivo(filtros)).toBe(true);
  });
});
