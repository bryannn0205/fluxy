import type { Plan } from "@/lib/generated/prisma/client";
import { formatNumber } from "@/lib/formatters";
import { PLAN_RESOURCES, type PlanResource } from "@/lib/plan-limits";

/**
 * O que o mundo pode ver de um plano.
 *
 * Montado por **lista de permissão explícita**, e não por omissão de campos
 * como em `types/orders.ts`. A diferença é intencional: aquele tipo redige um
 * registro que o usuário já tem direito de ver; este atravessa a fronteira do
 * anônimo. Com omissão, uma coluna nova em `Plan` passaria a vazar sozinha no
 * dia em que fosse criada — ninguém precisaria errar para isso acontecer. Com
 * lista de permissão, o campo novo simplesmente não aparece até alguém decidir
 * que ele é público.
 *
 * Fora daqui, e de propósito: `id` (chave interna — nenhuma tela pública
 * precisa dela, e expor identificador é convite a "e se eu mandar este id de
 * volta?"), `createdAt`, `updatedAt`.
 */
export interface PublicPlan {
  slug: string;
  name: string;
  /**
   * Preço mensal como string decimal de duas casas — `"29.00"`, não `29`.
   *
   * **String, e não `number`, por duas razões independentes.** Instâncias de
   * `Decimal` do Prisma não sobrevivem à serialização Server → Client (React
   * rejeita instâncias de classe em props). E `Number` resolveria isso ao
   * custo de reintroduzir ponto flutuante em dinheiro — o erro que o
   * `Decimal` existe para evitar.
   *
   * É uma string de EXIBIÇÃO. Não faça aritmética com ela: quem precisar
   * calcular converte de volta para `Decimal` no servidor, onde o valor
   * verdadeiro está. Preço vindo do navegador nunca é aceito de volta.
   *
   * Difere de `types/products.ts`, que usa `number` — lá o preço alimenta
   * cálculo de margem na tela; aqui o valor só é impresso.
   */
  priceMonthly: string;
  /** Preço anual, mesmas regras de {@link PublicPlan.priceMonthly}. */
  priceYearly: string;
  /** Chaves de módulo — ver MODULE_KEYS. Dizem o que o plano habilita. */
  modules: string[];
  /** `null` é ilimitado, como em toda a aplicação. Ver lib/plan-limits.ts. */
  maxUsers: number | null;
  maxOrdersPerMonth: number | null;
  maxProducts: number | null;
  maxCustomers: number | null;
  /**
   * O plano tem preço configurado no provedor de pagamento?
   *
   * **Booleano derivado, não os identificadores.** A pergunta que a vitrine
   * precisa responder é "dá para contratar?", e para isso basta saber se
   * existe preço — o `priceId` em si continua fora do DTO público, junto com
   * `id`, `createdAt` e `updatedAt`.
   *
   * `false` significa que nem o checkout interno funciona: `exigirPrecoRemoto`
   * recusa a cobrança sem preço remoto. É o caso do Plus até que produto e
   * preço próprios sejam criados no provedor.
   */
  availableForCheckout: boolean;
}

/** Casas decimais de dinheiro em pt-BR. */
const CASAS_DECIMAIS_MONETARIAS = 2;

/**
 * Converte um `Plan` do banco no DTO público.
 *
 * `toFixed(2)` e não `toString()`: `Decimal("29.00").toString()` devolve
 * `"29"`, e um preço que ora tem centavos ora não é um preço que a tela
 * precisa normalizar de novo.
 */
/** Ordem em que os limites aparecem na tela — do mais ao menos decisivo. */
const ORDEM_DOS_LIMITES: readonly PlanResource[] = [
  "users",
  "ordersPerMonth",
  "products",
  "customers",
];

/**
 * Limites do plano em texto pronto: `["5 usuários", "500 pedidos por mês", …]`.
 *
 * Os rótulos vêm de `PLAN_RESOURCES` — os mesmos que a mensagem de "limite
 * atingido" usa. Reescrevê-los aqui faria a tela de vendas e a de erro
 * chamarem a mesma coisa por nomes diferentes.
 *
 * Nenhum número é escrito nesta função: todos saem do DTO, que veio do banco.
 */
export function describePublicPlanLimits(plan: PublicPlan): string[] {
  return ORDEM_DOS_LIMITES.map((recurso) => {
    const { column, label } = PLAN_RESOURCES[recurso];
    const limite = plan[column];

    return limite === null ? `${label} sem limite` : `${formatNumber(limite)} ${label}`;
  });
}

const MESES_NO_ANO = 12;

/** `"29.00"` → `2900`. Inteiro, exato — nenhum passo intermediário em float. */
function emCentavos(valor: string): number {
  const [inteiro = "0", centavos = "00"] = valor.split(".");
  return Number(inteiro) * 100 + Number(centavos.padEnd(2, "0").slice(0, 2));
}

/** `2900` → `"29.00"`. */
function deCentavos(total: number): string {
  const centavos = total % 100;
  return `${Math.trunc(total / 100)}.${String(centavos).padStart(2, "0")}`;
}

/**
 * Quanto o plano anual poupa contra pagar doze meses avulsos.
 *
 * Devolve string decimal, ou `null` quando não há economia — nesse caso a tela
 * não mostra nada, em vez de anunciar "economize R$ 0".
 *
 * **Nenhum percentual.** "Economize 17%" exigiria arredondar, e arredondamento
 * numa afirmação comercial é a diferença entre informar e prometer. O valor
 * absoluto é subtração exata: 29,00 × 12 − 290,00 = 58,00, e qualquer pessoa
 * confere de cabeça.
 *
 * A conta inteira roda em centavos inteiros. `Number` aparece só sobre a parte
 * inteira e sobre os centavos separados — ambos inteiros pequenos, exatos em
 * IEEE 754. Em momento algum um preço vira float.
 */
export function annualSavings(plan: PublicPlan): string | null {
  const dozeMeses = emCentavos(plan.priceMonthly) * MESES_NO_ANO;
  const economia = dozeMeses - emCentavos(plan.priceYearly);

  return economia > 0 ? deCentavos(economia) : null;
}

export function toPublicPlan(plan: Plan): PublicPlan {
  return {
    slug: plan.slug,
    name: plan.name,
    priceMonthly: plan.priceMonthly.toFixed(CASAS_DECIMAIS_MONETARIAS),
    priceYearly: plan.priceYearly.toFixed(CASAS_DECIMAIS_MONETARIAS),
    modules: plan.modules,
    maxUsers: plan.maxUsers,
    maxOrdersPerMonth: plan.maxOrdersPerMonth,
    maxProducts: plan.maxProducts,
    maxCustomers: plan.maxCustomers,
    // As duas periodicidades precisam existir: a vitrine alterna entre elas, e
    // um plano contratável só na mensal ofereceria um botão que falha na
    // metade das escolhas.
    availableForCheckout:
      plan.validapayPriceMonthlyId !== null && plan.validapayPriceYearlyId !== null,
  };
}
