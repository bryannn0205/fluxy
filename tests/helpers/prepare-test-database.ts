import { readdirSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

import { PLAN_SLUGS, seedPlans } from "../../prisma/seed-plans";
import { type EnvDeTeste, resolveTestDatabaseUrl } from "./test-database-url";

/**
 * Ordem de DELETE — topológica REVERSA das 18 tabelas de negócio.
 *
 * A ordem de importação vai de `Plan` (sem dependências) até
 * `PaymentProviderEvent`; apagar exige o caminho inverso, para que nenhuma
 * linha seja removida enquanto outra ainda a referencia.
 *
 * Não é aceita como verdade: `provarOrdemContraFks` confere mecanicamente
 * contra TODAS as foreign keys do catálogo antes de qualquer DELETE.
 */
export const DELETE_ORDER = [
  "PaymentProviderEvent",
  "SubscriptionCheckout",
  "Payment",
  "Notification",
  "AuditLog",
  "StockMovement",
  "OrderAttachment",
  "OrderItem",
  "Order",
  "Product",
  "Customer",
  "Invitation",
  "VerificationToken",
  "Session",
  "Account",
  "User",
  "Company",
  "Plan",
] as const;

/** Tabelas que o preparador não deve popular — todas menos `Plan`. */
const TABELAS_QUE_DEVEM_FICAR_VAZIAS = DELETE_ORDER.filter((t) => t !== "Plan");

/** Total de FKs do schema. Divergência denuncia deriva e aborta. */
const FKS_ESPERADAS = 33;
const TABELAS_ESPERADAS = 19;

/**
 * Migrations aplicadas no banco de teste, contadas a partir do REPOSITÓRIO.
 *
 * Antes era um número escrito à mão, e ele quebrava a suíte inteira a cada
 * migration nova — com uma mensagem que parecia deriva do banco quando na
 * verdade era o repositório andando. O invariante que interessa é outro: o
 * banco de teste está no mesmo ponto que as migrations versionadas.
 */
const MIGRATIONS_ESPERADAS = readdirSync(join(process.cwd(), "prisma", "migrations"), {
  withFileTypes: true,
}).filter((entrada) => entrada.isDirectory()).length;

export interface TabelaComLinhas {
  tabela: string;
  linhas: number;
}

export interface ResultadoPreparacao {
  database: string;
  usuario: string;
  porta: number;
  /** Linhas removidas por tabela na limpeza. Vazio numa base já limpa. */
  removidas: TabelaComLinhas[];
  planos: number;
  slugs: string[];
  /** Tabelas que deveriam estar vazias e não estão. Deve ser sempre vazio. */
  residuo: TabelaComLinhas[];
  fksVerificadas: number;
}

interface Fk {
  src: string;
  tgt: string;
}

/**
 * Prova que a ordem de DELETE respeita todas as FKs.
 *
 * Para cada FK `src → tgt`, `src` precisa ser apagada ANTES de `tgt`: enquanto
 * uma linha de origem existir, o destino não pode sumir. Basta comparar as
 * posições na ordem — sem depender de tentativa e erro no banco.
 */
export function provarOrdemContraFks(fks: readonly Fk[], ordem: readonly string[]): void {
  const posicao = new Map(ordem.map((t, i) => [t, i]));

  for (const fk of fks) {
    const p = posicao.get(fk.src);
    const q = posicao.get(fk.tgt);
    if (p === undefined)
      throw new Error(`FK de "${fk.src}", que não está na ordem de limpeza`);
    if (q === undefined)
      throw new Error(`FK para "${fk.tgt}", que não está na ordem de limpeza`);
    if (p >= q) {
      throw new Error(
        `ordem de limpeza inválida: "${fk.src}" (posição ${p}) precisa vir antes de "${fk.tgt}" (posição ${q})`,
      );
    }
  }
}

/**
 * Prepara `fluxy_test` para uma execução limpa da suíte.
 *
 * Numa transação: valida o alvo, trava as 18 tabelas, apaga os dados de
 * negócio na ordem reversa, confirma que ficaram vazias, semeia SOMENTE o
 * catálogo de planos e reconfere. Qualquer falha derruba tudo por ROLLBACK.
 *
 * `_prisma_migrations` nunca entra na limpeza. Não há TRUNCATE, DROP,
 * `session_replication_role`, `seedDemoCompany` nem `applyApprovedPriceChange`.
 *
 * O alvo é confirmado DUAS vezes: pela URL, antes de conectar, e pelo próprio
 * servidor depois — `current_database()`, `current_user`, porta, contagem de
 * migrations e de tabelas. URL sozinha não basta para autorizar um DELETE.
 */
export async function prepareTestDatabase(
  env: EnvDeTeste = process.env,
): Promise<ResultadoPreparacao> {
  const alvo = resolveTestDatabaseUrl(env);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: alvo.url }),
  });
  try {
    // --- Confirmação pelo servidor, antes de qualquer escrita ---------------
    const identidade = await prisma.$queryRaw<
      { db: string; usuario: string; porta: number }[]
    >`SELECT current_database() AS db, current_user AS usuario, inet_server_port() AS porta`;

    const db = identidade[0]?.db;
    const usuario = identidade[0]?.usuario;
    const porta = Number(identidade[0]?.porta);

    if (db !== alvo.database) {
      throw new Error(
        `servidor respondeu "${db ?? "(desconhecido)"}", esperado "${alvo.database}"`,
      );
    }
    if (usuario !== "fluxy") {
      throw new Error(
        `conectado como "${usuario ?? "(desconhecido)"}", esperado "fluxy"`,
      );
    }
    if (porta !== 5432) throw new Error(`porta ${porta}, esperado 5432`);

    const migrations = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM _prisma_migrations`;
    if (migrations[0]?.n !== MIGRATIONS_ESPERADAS) {
      throw new Error(
        `_prisma_migrations tem ${migrations[0]?.n} linhas, esperado ${MIGRATIONS_ESPERADAS}`,
      );
    }

    const tabelas = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`;
    if (tabelas[0]?.n !== TABELAS_ESPERADAS) {
      throw new Error(
        `public tem ${tabelas[0]?.n} tabelas, esperado ${TABELAS_ESPERADAS}`,
      );
    }

    // --- Ordem de limpeza provada contra TODAS as FKs ------------------------
    const fks = await prisma.$queryRaw<Fk[]>`
      SELECT s.relname AS src, t.relname AS tgt
      FROM pg_constraint c
      JOIN pg_class s ON s.oid = c.conrelid
      JOIN pg_class t ON t.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = s.relnamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'`;
    if (fks.length !== FKS_ESPERADAS) {
      throw new Error(
        `catálogo tem ${fks.length} FKs, esperado ${FKS_ESPERADAS} — schema mudou`,
      );
    }
    provarOrdemContraFks(fks, DELETE_ORDER);

    // --- Limpeza + semeadura, tudo numa transação ---------------------------
    const removidas = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `LOCK TABLE ${DELETE_ORDER.map((t) => `"${t}"`).join(", ")} IN SHARE ROW EXCLUSIVE MODE`,
        );

        const apagadas: TabelaComLinhas[] = [];
        for (const tabela of DELETE_ORDER) {
          const linhas = await tx.$executeRawUnsafe(`DELETE FROM "${tabela}"`);
          if (linhas > 0) apagadas.push({ tabela, linhas });
        }

        for (const tabela of DELETE_ORDER) {
          const [c] = await tx.$queryRawUnsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM "${tabela}"`,
          );
          if (c?.n !== 0)
            throw new Error(`${tabela} ficou com ${c?.n} linhas após a limpeza`);
        }

        await seedPlans(tx as unknown as PrismaClient, () => undefined);
        return apagadas;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    // --- Conferência final ---------------------------------------------------
    const planos = await prisma.plan.findMany({
      select: { slug: true },
      orderBy: { slug: "asc" },
    });
    const slugs = planos.map((p) => p.slug);
    for (const esperado of PLAN_SLUGS) {
      if (!slugs.includes(esperado)) {
        throw new Error(
          `plano "${esperado}" ausente após a preparação de ${alvo.database}`,
        );
      }
    }
    if (planos.length !== PLAN_SLUGS.length) {
      throw new Error(`esperava ${PLAN_SLUGS.length} planos, encontrei ${planos.length}`);
    }

    const contagens = await prisma.$queryRawUnsafe<TabelaComLinhas[]>(
      TABELAS_QUE_DEVEM_FICAR_VAZIAS.map(
        (t) => `SELECT '${t}' AS tabela, count(*)::int AS linhas FROM "${t}"`,
      ).join(" UNION ALL "),
    );
    const residuo = contagens.filter((c) => c.linhas > 0);
    if (residuo.length > 0) {
      const detalhe = residuo.map((r) => `${r.tabela}=${r.linhas}`).join(", ");
      throw new Error(`tabelas deveriam estar vazias após a preparação: ${detalhe}`);
    }

    return {
      database: alvo.database,
      usuario,
      porta,
      removidas,
      planos: planos.length,
      slugs,
      residuo,
      fksVerificadas: fks.length,
    };
  } finally {
    await prisma.$disconnect();
  }
}
