// Fluxy é um produto exclusivamente brasileiro (pt-BR, CPF/CNPJ, R$) — não
// existe configuração de fuso por empresa, então usamos Horário de Brasília
// (UTC-3, sem horário de verão desde 2019) como referência única de "hoje"
// para regras de negócio como atraso de entrega.
//
// ATENÇÃO AO NOME: esta constante guarda a MAGNITUDE (3 horas), não o offset
// assinado — Brasília é UTC−3, então o offset real seria −3. O código
// compensa isso de forma consistente: SUBTRAI para ler os campos de um
// instante como relógio de parede de Brasília, e SOMA ao devolver o instante
// UTC correspondente à meia-noite local. Inverter qualquer um dos dois
// desloca todos os cortes de período em 6 horas.
const BUSINESS_TIMEZONE_UTC_OFFSET_HOURS = 3;
const BUSINESS_OFFSET_MS = BUSINESS_TIMEZONE_UTC_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Início do mês corrente em horário de Brasília, como instante UTC. Evita
 * `Date.setHours(0,0,0,0)`, que usa o fuso LOCAL do processo Node — correto
 * por acaso numa máquina configurada para horário de Brasília, mas errado
 * em produção (runtimes como o da Vercel rodam em UTC), classificando
 * pedidos criados nas primeiras horas do dia 1 como se fossem do mês
 * anterior, ou vice-versa.
 */
export function startOfMonthBrazil(now: Date = new Date()): Date {
  const localNow = new Date(now.getTime() - BUSINESS_OFFSET_MS);
  return new Date(
    Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      1,
      BUSINESS_TIMEZONE_UTC_OFFSET_HOURS,
      0,
      0,
      0,
    ),
  );
}

/**
 * Início do mês SEGUINTE em horário de Brasília, como instante UTC.
 *
 * Par de {@link startOfMonthBrazil}, para fechar o mês corrente como o
 * intervalo semiaberto `[startOfMonthBrazil, startOfNextMonthBrazil)` — que é
 * o que a cota mensal de pedidos consulta.
 *
 * `Date.UTC` normaliza a virada de ano sozinho: mês 11 + 1 vira janeiro do ano
 * seguinte, sem aritmética manual de ano. Ver tests/unit/lib/dates.test.ts,
 * que prova 24 meses consecutivos sem lacuna nem sobreposição.
 */
export function startOfNextMonthBrazil(now: Date = new Date()): Date {
  const local = new Date(now.getTime() - BUSINESS_OFFSET_MS);
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth() + 1,
      1,
      BUSINESS_TIMEZONE_UTC_OFFSET_HOURS,
      0,
      0,
      0,
    ),
  );
}

/**
 * Início do dia (00:00 em Brasília) de `daysAgo` dias atrás, como instante UTC.
 *
 * `daysAgo = 0` devolve o início de hoje. Usado como limite inferior dos
 * relatórios: alinhar o corte à meia-noite local — em vez de "agora menos N×24h" —
 * faz o primeiro e o último dia do período serem dias inteiros, senão o gráfico
 * abre e fecha com dois dias pela metade que parecem quedas de faturamento.
 */
export function startOfDaysAgoBrazil(daysAgo: number, now: Date = new Date()): Date {
  const local = new Date(now.getTime() - BUSINESS_OFFSET_MS);
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() - daysAgo,
      BUSINESS_TIMEZONE_UTC_OFFSET_HOURS,
      0,
      0,
      0,
    ),
  );
}

/** `YYYY-MM-DD` do dia em que o instante cai no horário de Brasília. */
export function toBrazilDateKey(instant: Date): string {
  return new Date(instant.getTime() - BUSINESS_OFFSET_MS).toISOString().slice(0, 10);
}

// expectedDeliveryDate é armazenado como meia-noite UTC do dia escolhido
// (input <input type="date"> → "YYYY-MM-DD" → `new Date(...)`, ver
// OrderDetailsForm.tsx). Comparar esse instante direto com `now` marcaria
// o pedido como atrasado às 21h (horário de Brasília) do dia ANTERIOR ao
// vencimento — 3h antes da meia-noite local e horas antes do fim real do
// dia combinado com o cliente. Um pedido só deve virar "atrasado" depois
// que o dia de vencimento termina no horário de Brasília.
const OVERDUE_GRACE_MS = (24 + BUSINESS_TIMEZONE_UTC_OFFSET_HOURS) * 60 * 60 * 1000;

/**
 * Instante em que um `expectedDeliveryDate` deixa de contar como atrasado.
 * Usar como limite inferior (`lt`) em queries: `expectedDeliveryDate < overdueCutoff()`.
 */
export function overdueCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - OVERDUE_GRACE_MS);
}

/** @returns true se a data de entrega esperada já passou (horário de Brasília). */
export function isOverdue(
  expectedDeliveryDate: Date | null,
  now: Date = new Date(),
): boolean {
  if (!expectedDeliveryDate) return false;
  return expectedDeliveryDate < overdueCutoff(now);
}
