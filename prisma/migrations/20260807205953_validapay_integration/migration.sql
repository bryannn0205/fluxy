-- Integração ValidaPay: identificadores externos, tentativa de contratação e
-- registro de eventos.
--
-- ADITIVA. Nenhum DROP, nenhum RENAME.
--
-- As colunas asaasCustomerId/asaasSubscriptionId FICAM. Renomeá-las
-- preservaria os bytes mas trocaria o significado: um identificador do Asaas
-- passaria a se chamar ValidaPay, e nada no sistema acusaria a troca. Não
-- conseguimos provar pelo repositório que todo banco tenha NULL ali — só que
-- nenhum código nosso escreveu. A remoção fica para migration própria, depois
-- de verificar explicitamente a produção.
--
-- Os campos novos nascem NULL e nada é copiado entre eles: dado de um provedor
-- não vira dado de outro por mudança de nome.
--
-- BEGIN/COMMIT EXPLÍCITOS. Foi medido neste projeto que o Prisma NÃO envolve a
-- migration numa transação: uma migration de teste com segundo comando
-- inválido teve o primeiro comando PERSISTIDO.
BEGIN;
CREATE TYPE "PaymentProvider" AS ENUM ('VALIDAPAY');

CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

CREATE TYPE "SubscriptionCheckoutStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TYPE "ProviderEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'IGNORED');

ALTER TABLE "Company" ADD COLUMN     "validapayCustomerId" TEXT,
ADD COLUMN     "validapaySubscriptionId" TEXT;

ALTER TABLE "Plan" ADD COLUMN     "validapayPriceMonthlyId" TEXT,
ADD COLUMN     "validapayPriceYearlyId" TEXT;

CREATE TABLE "SubscriptionCheckout" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "intendedPlanId" TEXT NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "externalSessionId" TEXT,
    "externalChargeId" TEXT,
    "status" "SubscriptionCheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SubscriptionCheckout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "externalEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "companyId" TEXT,
    "externalChargeId" TEXT,
    "externalPaymentId" TEXT,
    "externalSubscriptionId" TEXT,
    "occurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "ProviderEventStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT,

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionCheckout_companyId_createdAt_idx" ON "SubscriptionCheckout"("companyId", "createdAt" DESC);

CREATE INDEX "SubscriptionCheckout_companyId_status_idx" ON "SubscriptionCheckout"("companyId", "status");

CREATE UNIQUE INDEX "SubscriptionCheckout_provider_externalSessionId_key" ON "SubscriptionCheckout"("provider", "externalSessionId");

CREATE UNIQUE INDEX "SubscriptionCheckout_provider_externalChargeId_key" ON "SubscriptionCheckout"("provider", "externalChargeId");

CREATE INDEX "PaymentProviderEvent_companyId_receivedAt_idx" ON "PaymentProviderEvent"("companyId", "receivedAt" DESC);

CREATE INDEX "PaymentProviderEvent_status_receivedAt_idx" ON "PaymentProviderEvent"("status", "receivedAt");

CREATE INDEX "PaymentProviderEvent_externalChargeId_idx" ON "PaymentProviderEvent"("externalChargeId");

CREATE INDEX "PaymentProviderEvent_externalSubscriptionId_idx" ON "PaymentProviderEvent"("externalSubscriptionId");

CREATE UNIQUE INDEX "PaymentProviderEvent_provider_idempotencyKey_key" ON "PaymentProviderEvent"("provider", "idempotencyKey");

ALTER TABLE "SubscriptionCheckout" ADD CONSTRAINT "SubscriptionCheckout_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "SubscriptionCheckout" ADD CONSTRAINT "SubscriptionCheckout_intendedPlanId_fkey" FOREIGN KEY ("intendedPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
COMMIT;
