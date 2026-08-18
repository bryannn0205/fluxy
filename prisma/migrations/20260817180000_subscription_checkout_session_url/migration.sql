-- URL da pagina hospedada da ValidaPay, como ela a devolveu na criacao.
--
-- Nullable e sem default: a coluna nasce NULL em toda linha existente, entao
-- nenhuma linha fica invalida e nao ha backfill a fazer. Sem indice e sem
-- unique -- ela nao e chave de busca, so o endereco que a tentativa guarda.
--
-- AlterTable
ALTER TABLE "SubscriptionCheckout" ADD COLUMN "externalSessionUrl" TEXT;
