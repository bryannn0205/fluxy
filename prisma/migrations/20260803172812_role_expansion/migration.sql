-- Expande o enum Role de 3 para 6 papéis e remapeia MEMBER para OPERATOR.
--
-- O Postgres não remove valor de enum: o tipo tem de ser recriado e as colunas
-- convertidas. São duas — "User".role e "Invitation".role.
--
-- O CASE remapeia MEMBER em vez de deixar o cast estourar. Nesta base não há
-- nenhuma linha MEMBER (verificado antes de escrever: 2 usuários, ambos OWNER,
-- e zero convites pendentes), mas a migration precisa estar correta em qualquer
-- base onde vier a rodar, inclusive uma que ainda não existe. Depender do
-- estado da base local seria escrever uma migration que só funciona aqui.
--
-- O Prisma envolve cada arquivo de migration em BEGIN/COMMIT, então uma falha
-- no meio não deixa o enum pela metade.

CREATE TYPE "Role_new" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'FINANCE', 'VIEWER');

-- Os defaults saem antes da conversão: o Postgres recusa converter uma coluna
-- cujo DEFAULT ainda referencia o tipo antigo.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Invitation" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new"
  USING (CASE WHEN "role"::text = 'MEMBER' THEN 'OPERATOR' ELSE "role"::text END)::"Role_new";

ALTER TABLE "Invitation" ALTER COLUMN "role" TYPE "Role_new"
  USING (CASE WHEN "role"::text = 'MEMBER' THEN 'OPERATOR' ELSE "role"::text END)::"Role_new";

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- Cadastro de empresa nova continua criando OWNER; convite passa a nascer
-- OPERATOR, que é o papel de trabalho do dia a dia.
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'OWNER';
ALTER TABLE "Invitation" ALTER COLUMN "role" SET DEFAULT 'OPERATOR';
