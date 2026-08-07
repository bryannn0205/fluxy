export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

// Para datas-calendário puras (sem hora), como expectedDeliveryDate —
// armazenadas como meia-noite UTC do dia escolhido. Formatar com o fuso
// local do navegador/servidor pode exibir o dia anterior (ex.: meia-noite
// UTC vira 21h do dia anterior em horário de Brasília); fixar timeZone:
// "UTC" garante que sempre volta a mostrar o mesmo dia que foi escolhido.
export function formatCalendarDate(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

/**
 * Formata um preço que chegou como string decimal — `"29.00"` → `"R$ 29"`,
 * `"1290.50"` → `"R$ 1.290,50"`.
 *
 * Existe separada de `formatCurrency` porque o DTO público de planos entrega
 * string, não número (ver types/plans.ts), e converter para `Number` só para
 * imprimir reintroduziria ponto flutuante no caminho do dinheiro. Aqui não há
 * conversão nenhuma: a parte inteira ganha separador de milhar por
 * manipulação de texto, e os centavos vêm como vieram.
 *
 * Centavos zerados são omitidos: "R$ 29" lê melhor numa tabela de preços que
 * "R$ 29,00", e nenhuma informação se perde.
 */
export function formatPriceFromDecimalString(value: string): string {
  const [inteiro = "0", centavos = "00"] = value.split(".");
  const comSeparador = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return centavos === "00" ? `R$ ${comSeparador}` : `R$ ${comSeparador},${centavos}`;
}

// Números de pedido são sempre exibidos com 4 dígitos preenchidos (ex.: 0007).
export function formatOrderNumber(orderNumber: string): string {
  return `#${orderNumber}`;
}

export function formatDocument(document: string): string {
  const digits = document.replace(/\D/g, "");

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }

  return document;
}
