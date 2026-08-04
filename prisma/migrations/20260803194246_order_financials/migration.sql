-- Financeiro dos pedidos: ledger de pagamentos, caches no pedido e os campos
-- que faltavam no cálculo do total (taxa de entrega e acréscimo).
--
-- TRANSAÇÃO EXPLÍCITA, e não por confiança no Prisma. Medido neste projeto em
-- 03/08/2026 com uma migration-sonda de dois comandos, o segundo inválido: o
-- primeiro PERSISTIU e a migration foi marcada como falha. O Prisma não
-- envolve o arquivo em BEGIN/COMMIT — quem quiser atomicidade escreve.
--
-- Todos os comandos abaixo foram ensaiados contra o banco real dentro de
-- BEGIN ... ROLLBACK antes de virarem este arquivo: aplicam limpo e não
-- deixam resíduo ao desfazer.
BEGIN;

CREATE TYPE "PaymentType" AS ENUM ('PAYMENT', 'REFUND');
CREATE TYPE "OrderPaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'REFUNDED', 'CANCELLED');

-- Os defaults preenchem as linhas existentes sem backfill: nenhum pedido de
-- hoje tem histórico de pagamento a recuperar, porque o recurso não existia.
ALTER TABLE "Order" ADD COLUMN     "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "surcharge" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Payment_companyId_orderId_paidAt_idx" ON "Payment"("companyId", "orderId", "paidAt" DESC);
CREATE INDEX "Payment_companyId_paidAt_idx" ON "Payment"("companyId", "paidAt" DESC);
CREATE UNIQUE INDEX "Payment_companyId_idempotencyKey_key" ON "Payment"("companyId", "idempotencyKey");

-- Alvos das FKs compostas. Redundantes quanto à unicidade (id já é a chave
-- primária) — existem para o Postgres poder referenciar o par e recusar
-- pagamento que aponte para pedido ou usuário de outra empresa.
CREATE UNIQUE INDEX "Order_id_companyId_key" ON "Order"("id", "companyId");
CREATE UNIQUE INDEX "User_id_companyId_key" ON "User"("id", "companyId");

-- Serve "contas a receber" e o filtro de atraso, ambos liderados por empresa.
CREATE INDEX "Order_companyId_paymentStatus_dueDate_idx" ON "Order"("companyId", "paymentStatus", "dueDate");

-- RESTRICT nos dois sentidos: o ledger não some com uma exclusão física
-- acidental, e não acompanha troca de identificador ou de tenant. Transferir
-- pagamento entre empresas, se um dia for preciso, será processo explícito e
-- auditado — nunca efeito colateral de cascata.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_companyId_fkey" FOREIGN KEY ("orderId", "companyId") REFERENCES "Order"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_companyId_fkey" FOREIGN KEY ("createdById", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Última linha de defesa, abaixo do Zod e do FinanceService. O Prisma não
-- declara CHECK no schema, então estas constraints vivem só aqui: um
-- `migrate reset` as recria pelo histórico, mas um `db push` a partir do
-- schema não. Ver a nota correspondente no STATUS.md.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive"       CHECK ("amount" > 0);
ALTER TABLE "Order"   ADD CONSTRAINT "Order_deliveryFee_nonnegative" CHECK ("deliveryFee" >= 0);
ALTER TABLE "Order"   ADD CONSTRAINT "Order_surcharge_nonnegative"   CHECK ("surcharge" >= 0);
ALTER TABLE "Order"   ADD CONSTRAINT "Order_paidAmount_nonnegative"  CHECK ("paidAmount" >= 0);

COMMIT;
