-- Limites quantitativos por plano.
--
-- TRANSAÇÃO EXPLÍCITA: o Prisma não envolve migrations em BEGIN/COMMIT —
-- medido neste projeto em 03/08/2026 com uma migration-sonda de dois comandos,
-- o segundo inválido, e o primeiro persistiu.
--
-- SEM ÍNDICE NOVO, e isto é deliberado. A proposta previa
-- `CREATE INDEX "Order_companyId_createdAt_idx" ON "Order"("companyId","createdAt")`,
-- mas esse índice JÁ EXISTE desde a migration inicial, criado a partir de
-- `@@index([companyId, createdAt(sort: Desc)])` — o Prisma nomeia igual
-- independentemente da direção. Recriá-lo falharia por nome duplicado, e não
-- traria ganho: num btree, a coluna líder é igualdade e a segunda é faixa, de
-- modo que a varredura por intervalo funciona nos dois sentidos. Verificado
-- com pg_indexes em 04/08/2026.
BEGIN;

-- null = ilimitado · 0 = bloqueado · positivo = teto.
-- Sem default: o plano existente nasce null em tudo e nada muda de
-- comportamento ao aplicar. Os valores comerciais entram por UPDATE, num
-- passo separado.
ALTER TABLE "Plan" ADD COLUMN "maxUsers"          INTEGER;
ALTER TABLE "Plan" ADD COLUMN "maxOrdersPerMonth" INTEGER;
ALTER TABLE "Plan" ADD COLUMN "maxProducts"       INTEGER;
ALTER TABLE "Plan" ADD COLUMN "maxCustomers"      INTEGER;

-- Última linha de defesa, abaixo do Zod e do PlanLimitService. Como os CHECK
-- não são declarados no schema Prisma, esta constraint vive só aqui — mais um
-- motivo para nunca usar `db push` neste projeto.
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_limits_nonnegative" CHECK (
  ("maxUsers"          IS NULL OR "maxUsers"          >= 0) AND
  ("maxOrdersPerMonth" IS NULL OR "maxOrdersPerMonth" >= 0) AND
  ("maxProducts"       IS NULL OR "maxProducts"       >= 0) AND
  ("maxCustomers"      IS NULL OR "maxCustomers"      >= 0)
);

COMMIT;
