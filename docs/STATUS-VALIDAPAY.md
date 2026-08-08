# Estado da integração ValidaPay — documento de continuidade

**Atualizado em:** 07/08/2026
**Propósito:** permitir retomar o trabalho numa conversa nova, sem depender do histórico anterior.

> **Onde paramos:** P1 concluída (PostgreSQL local auditado e autenticação validada).
> **P2 e P3 ainda NÃO foram executados.** Ver seção 10.

---

## 1. Estado do Git

|                 |                                                                      |
| --------------- | -------------------------------------------------------------------- |
| Branch atual    | `master`                                                             |
| Working tree    | limpa                                                                |
| HEAD            | `ae3d088c9be052652cfb5fcc8de2e19ab62509e3`                           |
| Commit de F1+F2 | `ed8ae9e` — `feat: add ValidaPay client and payment provider schema` |
| PR #4           | **mesclado** em `master` (`ae3d088`)                                 |

**Vercel:** projeto principal `fluxy` está **Ready**. Existe um projeto duplicado `fluxy-fdnx` com **Error** — **fora do escopo, não mexer, não copiar secrets para ele**.

---

## 2. Stack

| Componente | Versão                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------- |
| Next.js    | 15.5.22 (App Router)                                                                        |
| React      | 19.2.4                                                                                      |
| TypeScript | ^5 (`exactOptionalPropertyTypes: true`)                                                     |
| Prisma     | ^7.9.1 (`@prisma/client` ^7.9.1, adapter `@prisma/adapter-pg`)                              |
| PostgreSQL | 18.4 local; até agora via `prisma dev`                                                      |
| Auth       | Auth.js v5 (`next-auth` ^5.0.0-beta.32), sessão JWT resolvida contra o banco a cada request |
| Testes     | Vitest ^4.1.10 + Testing Library, jsdom                                                     |
| Validação  | Zod ^4.4.3                                                                                  |
| ValidaPay  | `@prisma/dev` não relacionado; cliente próprio em `lib/validapay/`                          |

Arquitetura: **Repository → Service → Server Action → UI**. Multi-tenant com `companyId` em toda tabela.

---

## 3. F1 — Cliente ValidaPay

**Local:** `lib/validapay/` — `config.ts`, `errors.ts`, `token.ts`, `client.ts`, `index.ts`.

- **OAuth2 `client_credentials`**, `POST` com `application/x-www-form-urlencoded`.
- **Hosts são constantes derivadas de `VALIDAPAY_ENV`**, não variáveis de ambiente:
  - sandbox: `https://sandbox.validapay.com.br` · `https://oauth2-sandbox.validapay.com.br`
  - produção: `https://api.validapay.com.br` · `https://oauth2.validapay.com.br`
  - Endpoint de token: `<oauth>/auth/token`
  - Motivo: quatro URLs em texto livre seriam quatro chances de apontar credencial de produção para host de sandbox.
- **Padrão `sandbox`** — `production` exige escolha explícita.
- **Cache do `access_token` em memória do processo**, nunca em Redis (é credencial viva; guardá-la em repouso cria caminho de vazamento).
- **Single-flight**: o cache guarda a _promessa_, não o valor — N chamadas simultâneas numa instância fria pedem **um** token.
- **Renovação 60 s antes do vencimento**, limitada a metade da validade (senão um token curto nasceria vencido e entraria em laço).
- **401 numa chamada de API**: invalida o token, renova e repete **uma** vez — 401 é avaliado antes de qualquer processamento, então a requisição não teve efeito.
- **Sem retry genérico**: 5xx e timeout **não** são repetidos. Repetir um `POST /v1/charges` que expirou pode cobrar duas vezes; a decisão pertence a cada endpoint, não ao transporte.
- **Timeout** de 10 s em toda chamada.
- **Erros tipados** herdando de `AppError`: `ValidaPayConfigError`, `ValidaPayAuthError`, `ValidaPayTimeoutError`, `ValidaPayRequestError`. `userMessage` genérica — resposta de gateway pode trazer identificador interno.
- **Nenhum segredo** em erro, log ou serialização, inclusive quando a resposta de erro ecoa o que foi enviado.

**Variáveis de ambiente** (todas opcionais em `lib/env.ts`; sem elas, só o pagamento fica indisponível):

```
VALIDAPAY_ENV=sandbox|production   (padrão sandbox)
VALIDAPAY_CLIENT_ID
VALIDAPAY_CLIENT_SECRET
VALIDAPAY_SCOPE
VALIDAPAY_WEBHOOK_TOKEN            (documentada; usada só na fase de webhook)
```

Nenhuma com prefixo `NEXT_PUBLIC_`.

**Validação real contra o sandbox — feita e aprovada:**

```
HTTP 200 · token_type = Bearer · expires_in = 3600 · access_token recebido e descartado
```

O `scope` usado foi `pix.cob/read`, codificado como `pix.cob%2Fread` pelo `URLSearchParams` e **aceito**.

---

## 4. F2 — Schema

**Migration:** `prisma/migrations/20260807205953_validapay_integration/`

### Company

```prisma
asaasCustomerId         String?   // DÍVIDA TÉCNICA — preservado
asaasSubscriptionId     String?   // DÍVIDA TÉCNICA — preservado
validapayCustomerId     String?
validapaySubscriptionId String?
```

Os campos `asaas*` **não foram renomeados**: renomear preservaria os bytes mas trocaria o _significado_ — um identificador do Asaas passaria a se chamar ValidaPay sem que nada acusasse a troca. Nenhum código do repositório jamais escreveu neles, o que prova que o **sistema** não preencheu, **não** que todo banco tenha `NULL` (alteração manual fora do repositório não se descarta). Remoção fica para migration própria, depois de verificar produção.

### Plan

```prisma
validapayPriceMonthlyId String?
validapayPriceYearlyId  String?
```

Nullable e independentes.

### Models novos

**`SubscriptionCheckout`** — registro PRÓPRIO do Fluxy para correlacionar o webhook futuro. Sem ele, a correlação dependeria de campo do payload (dado externo), e um payload forjado apontaria para a empresa que quisesse.
Campos: `id`, `companyId`, `intendedPlanId`, `billingInterval`, `provider`, `externalSessionId?`, `externalChargeId?`, `status`, `createdAt`, `updatedAt`, `completedAt?`.
**`intendedPlanId` é intenção, não plano efetivo** — criar tentativa não altera `Company.planId` nem `subscriptionStatus`.

**`PaymentProviderEvent`** — append-only.
Campos: `id`, `provider`, `externalEventId?`, `eventType` (**texto, não enum**), `companyId?`, `externalChargeId?`, `externalPaymentId?`, `externalSubscriptionId?`, `occurredAt?`, `receivedAt`, `processedAt?`, `status`, `idempotencyKey`, `payloadHash?`.
`eventType` é texto porque um tipo desconhecido precisa ser gravável — com enum, o Postgres recusaria a linha e o Fluxy perderia o registro justamente quando algo novo aparece.

### Enums

```prisma
enum PaymentProvider            { VALIDAPAY }
enum BillingInterval            { MONTHLY, YEARLY }
enum SubscriptionCheckoutStatus { PENDING, COMPLETED, FAILED }
enum ProviderEventStatus        { PENDING, PROCESSED, FAILED, IGNORED }
```

`SubscriptionStatus` (pré-existente): `TRIALING, ACTIVE, PAST_DUE, CANCELED, EXPIRED`.

### Garantias

- Migration **puramente aditiva**: **zero `DROP`**, **zero `RENAME`** — verificado por teste que lê o arquivo SQL sem comentários.
- `BEGIN`/`COMMIT` explícitos — **foi medido neste projeto que o Prisma NÃO envolve migrations em transação** (migration de teste com segundo comando inválido teve o primeiro PERSISTIDO).
- **`Payment` de pedidos intacto**: `orderId`, `createdById` e `companyId` seguem `NOT NULL`. Pagamento de assinatura não tem pedido nem autor humano — por isso ganhou tabelas próprias, em vez de enfraquecer o ledger.
- **Unicidade composta com `provider`** nos três índices:
  - `@@unique([provider, externalSessionId])`
  - `@@unique([provider, externalChargeId])`
  - `@@unique([provider, idempotencyKey])`

  Identificador de terceiro não tem unicidade global documentada; assumi-la criaria colisão inexplicável no dia de um segundo gateway.

- **Payload bruto e PII não armazenados**: nenhuma coluna para `taxId`, conta, agência, banco ou cartão — apenas `payloadHash`.
- **Logger** (`lib/logger.ts`) passou a redigir `taxid`, `account`, `bank`, `branch`, além dos já existentes (`password`, `token`, `secret`, `authorization`, `cpf`, `cnpj`…). O payload de `payment.success` traz dados bancários do pagador, e `cpf`/`cnpj` não alcançavam o nome que a ValidaPay usa.

**A fórmula da `idempotencyKey` NÃO está fechada** — depende de payloads reais e será decidida na fase de webhook. Já está decidido que não pode ser apenas `eventType`.

---

## 5. Testes — estado aprovado

|                         |                              |
| ----------------------- | ---------------------------- |
| `vitest run`            | **589/589**, **39 arquivos** |
| `tsc --noEmit`          | 0 erros                      |
| `eslint`                | exit 0                       |
| `next build`            | limpo                        |
| `db:seed`               | ok                           |
| `prisma migrate status` | 9 migrations, banco em dia   |

---

## 6. Prisma dev — incidente e decisão

O daemon do `prisma dev` caiu **nove vezes** numa única sessão, sempre com `Server has closed the connection` + processo vivo, e `Lock file is already being held` no restart.

**Investigação (somente leitura) apurou:**

- `prisma dev` inicia **três** serviços: Postgres (51218), shadow (51219) e **Prisma Streams** (51220, `PRISMA_STREAM_URL=http://127.0.0.1:51220/v1/stream/prisma-wal`).
- O Prisma Streams persiste o WAL do Postgres em:
  `C:\Users\Bryan\AppData\Local\prisma-dev-nodejs\Data\durable-streams\default\durable-streams.sqlite`
- Tamanho observado: **~5,2 GB** (5.597.863.936 bytes). Segundo servidor `fluxy`: **~655 MB**.
- **Crescimento medido: ~1,2 MB/min mesmo em repouso** (~1,7 GB/dia), sem testes rodando.
- Disco C: chegou a **~98,3%** ocupado (1,85 GB livres de 111,30 GB).
- Tabela `wal`: **~4,6 milhões de linhas**. `page_count` 1.367.309, `page_size` 4096.
- **`freelist_count = 0`** — nenhuma página jamais liberada, ou seja, a poda **nunca rodou**.
- A poda do stream principal é por **offset, dirigida por consumidor/ack** (`DELETE FROM wal WHERE stream=? AND offset <= ?`).
- **O Fluxy não consome `PRISMA_STREAM_URL` em lugar nenhum** — logo, offsets nunca avançam e nada é podado.
- Retenção por idade existe (`trimWalByAge`, `retentionMs ?? 7 dias`), mas **só sobre o `metricsStream`**. O arquivo nasceu em 02/08, então nem os 7 dias tinham decorrido.
- Comentário do próprio pacote: _"SQLite file size is high-water and does not shrink — deterministically after DELETE-based GC/retention trimming"_.
- Crescimento em repouso vem do próprio daemon: `metricsStream` com `snapshotIntervalMs ?? 60000` (snapshot a cada 60 s) + `touch/processor_worker`, somados ao WAL que o Postgres gera sozinho.
- **Nenhuma flag suportada encontrada para desligar Streams**: `prisma dev --help` só oferece `--debug`, `--db-port`, `--detach`, `--name`, `--port`, `--shadow-db-port`. No código, `startLocalDurableStreamsServer` é chamado **incondicionalmente**.
- Variáveis internas encontradas (não documentadas, nenhuma desliga o serviço): `DS_BASE_WAL_GC_INTERVAL_MS`, `DS_BASE_WAL_GC_CHUNK_OFFSETS`, `DS_DB_PATH`, `DS_LOCAL_DATA_ROOT`, `DS_HOST`, `DS_ROOT`.
- **Atenção:** a CLI baixa uma cópia em tempo de execução para `%TEMP%\@prisma\cli-dev@latest-*` e reporta `prisma dev v0.16.27`, diferente do `@prisma/dev@0.24.17` em `node_modules`. **O código que executa não é o de `node_modules`.**

**Cadeia causal:** stream append-only sem poda → arquivo cresce sem teto → disco a 98,3% → escritas falham → daemon morre sem liberar o lock → restart encontra lock órfão.

### Decisão tomada

**Sair do `prisma dev` e migrar o desenvolvimento para o PostgreSQL 18 local normal.** Limpar o arquivo periodicamente seria apenas paliativo.

---

## 7. PostgreSQL local

|                    |                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Versão             | **PostgreSQL 18.4**                                                                                               |
| Serviço Windows    | `postgresql-x64-18` — **Running**                                                                                 |
| Porta              | **5432**                                                                                                          |
| `listen_addresses` | `*`                                                                                                               |
| Binários           | `C:\Program Files\PostgreSQL\18\bin\` (`psql.exe`, `pg_dump.exe`, `pg_restore.exe`, `createdb.exe`, `pg_ctl.exe`) |
| Autenticação       | `scram-sha-256` em `pg_hba.conf`                                                                                  |

**Os binários NÃO estão no `PATH`** — usar o caminho completo.

**Bancos existentes:** `postgres`, **`gestao_pedidos`**.

> ⚠️ **`gestao_pedidos` — NÃO TOCAR.** Origem e conteúdo não verificados. Possivelmente um banco anterior do Fluxy. Está pendente de confirmação com o usuário.

**Roles existentes:** apenas `postgres` (superusuário). Não existe role dedicada.

---

## 8. pgpass

|                  |                                                         |
| ---------------- | ------------------------------------------------------- |
| Local            | `C:\Users\Bryan\AppData\Roaming\postgresql\pgpass.conf` |
| Formato da linha | `*:5432:*:postgres:<senha>`                             |

**Histórico:** o arquivo foi salvo inicialmente como `pgpass.conf.txt` (o Bloco de Notas anexou a extensão, invisível porque o Windows oculta extensões conhecidas). Isso produzia `fe_sendauth: no password` — o `libpq` não encontrava o arquivo. **Foi renomeado para `pgpass.conf`** e a autenticação passou a funcionar.

**Validação:**

```
CONEXÃO OK
versão ........... PostgreSQL 18.4
current_user ..... postgres
current_database . postgres
```

> A senha **não** é registrada aqui e o conteúdo do arquivo **não** deve ser lido.

---

## 9. Decisão de migração local

**Banco novo planejado:** `fluxy_dev`

Princípios:

- Migrar do `prisma dev` para o PostgreSQL 18 local normal.
- **Preservar o banco atual** até a validação completa.
- **Backup com `pg_dump` antes de qualquer mudança.**
- **Não usar `gestao_pedidos`.**
- Futuramente usar **role dedicada `fluxy`** — a senha precisa ser definida pelo usuário; o agente não cria nem digita senhas.
- **Não usar `postgres` como credencial permanente da aplicação.**
- Shadow database separado (ex.: `fluxy_shadow`) — **nunca** o mesmo banco de desenvolvimento.

---

## 10. Ponto exato onde paramos

> ## ⚠️ P2 e P3 AINDA NÃO FORAM EXECUTADOS.

**P1 concluída:** PostgreSQL local auditado, `pgpass.conf` corrigido, autenticação validada.

### Próximos passos, em ordem

**P2 — inventariar o banco atual do `prisma dev`**

`DATABASE_URL` atual aponta para o servidor `default` do `prisma dev`, porta **51218**, banco `template1` (redigido: `postgresql://***:***@localhost:51218/template1`).

Registrar contagens que servirão de base para a prova de equivalência:
migrations aplicadas, empresas, usuários, planos, pedidos, pagamentos, produtos, clientes, `SubscriptionCheckout`, `PaymentProviderEvent`.

**P3 — backup**

`pg_dump` do banco atual para `C:\Users\Bryan\Backups\Fluxy\`, com timestamp no nome
(ex.: `fluxy-dev-before-postgres-migration-YYYYMMDD-HHMM.dump`).
**Fora do repositório. Não commitar.**
Validar o dump com `pg_restore --list`.

**Somente após backup válido:**

- `npx prisma dev stop default`
- **NÃO** `prisma dev rm`

**Depois:**

1. Criar `fluxy_dev` (e `fluxy_shadow`).
2. Preparar role dedicada `fluxy` (senha definida pelo usuário).
3. `prisma migrate deploy` no banco novo · `prisma generate`.
4. Transferir os dados preservando IDs, relações, timestamps, enums, FKs e valores monetários exatos.
5. Provar equivalência (contagens + integridade: Company→Plan, User→Company, Order→Company, Payment→Order, isolamento por tenant, preços dos planos).
6. **Só então** alterar `DATABASE_URL` no `.env` local.
7. Validar sem `prisma dev`: `prisma generate`, `migrate status`, `tsc`, `eslint`, `vitest run` (esperado 589/589), `next build`.

**Não apagar o ambiente antigo** mesmo após tudo funcionar.

---

## 11. Proibições vigentes

- ❌ Não iniciar **F3**
- ❌ Não criar produtos/preços na ValidaPay
- ❌ Não criar checkout
- ❌ Não implementar webhook
- ❌ Não apagar `durable-streams.sqlite`
- ❌ Não executar `prisma dev rm`
- ❌ Não tocar em `gestao_pedidos`
- ❌ Não tocar em produção (banco, Vercel, ValidaPay)
- ❌ Não alterar migrations antigas
- ❌ Não usar `db push`
- ❌ Não usar `migrate reset`
- ❌ Não alterar `pg_hba.conf` nem ACLs
- ❌ Não ler nem imprimir o conteúdo do `pgpass.conf`
- ❌ Não mexer no projeto Vercel `fluxy-fdnx`

---

## 12. Prompt de retomada

Cole o texto abaixo numa conversa nova:

```
Leia docs/STATUS-VALIDAPAY.md no repositório Fluxy e retome exatamente
do ponto registrado na seção 10.

Estamos migrando o ambiente de desenvolvimento do `prisma dev` para o
PostgreSQL 18 local normal. P1 está concluída (PostgreSQL auditado,
pgpass.conf corrigido, autenticação validada).

Execute P2 (inventário do banco atual do prisma dev, com as contagens
listadas na seção 10) e depois PARE para eu aprovar antes do P3 (backup
com pg_dump).

Respeite integralmente as proibições da seção 11. Não inicie F3.
Não faça commit sem minha autorização.
```

---

## Dívidas técnicas registradas

- Colunas `asaas*` em `Company` — remover em migration própria, após verificar produção.
- Fórmula da `idempotencyKey` — fechar na fase de webhook, com payloads reais.
- `callbackUrl` é escrito pelo middleware e **não consumido** por ninguém. Corrigir exige lista de permissão de destinos.
- Rotas sob `/dashboard` ficam no fallback de `loading.tsx` no navegador embutido usado nas verificações; reproduz em rotas não tocadas, dev e produção. Conferir num navegador comum.

## Pontos não documentados pela ValidaPay

O webhook tem autenticação por **token compartilhado no header `Authorization`** (configurável no painel, campo "Token de Autenticação"). É segredo portador, **não assinatura HMAC** — autentica o remetente, não a mensagem. Por isso a confirmação via `GET /v1/charges/:chargeId` antes de ativar o Pro continua necessária.

Seguem **NÃO DOCUMENTADOS**: identificador único de evento, política de retentativas, proteção contra replay, ordem de entrega, endpoint de estorno/reembolso.

Eventos conhecidos: `payment.success`, `payment.failed`, `subscription.created`, `subscription.activated`, `subscription.canceled`, `subscription.renewed`, `subscription.trial`. Apenas `payment.success` tem payload documentado.
