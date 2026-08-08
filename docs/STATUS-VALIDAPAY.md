# Estado da integração ValidaPay — documento de continuidade

**Atualizado em:** 08/08/2026
**Propósito:** permitir retomar o trabalho numa conversa nova, sem depender do histórico anterior.

> **Onde paramos:** P1, P2 e P3 concluídas. Os dados do `prisma dev` estão
> exportados, conferidos e com cópia cifrada fora do repositório.
> **P4/P5 ainda NÃO foram executados** — nenhum banco novo existe.
> Ver seções 10, 11 e 12.

---

## 1. Estado do Git

|                 |                                                                      |
| --------------- | -------------------------------------------------------------------- |
| Branch atual    | `master`                                                             |
| Working tree    | limpa                                                                |
| HEAD            | `b0ccfac` — `docs: add ValidaPay integration status`                 |
| Merge do PR #4  | `ae3d088`                                                            |
| Commit de F1+F2 | `ed8ae9e` — `feat: add ValidaPay client and payment provider schema` |
| PR #4           | **mesclado** em `master` (`ae3d088`)                                 |

Nenhum commit foi feito durante P2/P3 — o trabalho de migração não tocou em
código. Os scripts de exportação vivem **fora do repositório**.

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

**Atualização 08/08:** houve uma **décima** queda, durante o `pg_dump` de P3 — ver
seção 11. Depois dela o daemon foi iniciado mais duas vezes e sobreviveu às duas
janelas de exportação. O `durable-streams.sqlite` está preservado e **não cresce
com o servidor parado**: 5.427,7 MB (07/08) → 5.429,8 MB (08/08), os 2,08 MB
somados apenas durante as janelas.

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

## 10. P2 — inventário do banco antigo (CONCLUÍDO)

**Servidor de origem:** `prisma dev default`, Postgres cru em `localhost:51218`,
database **`template1`** — o único com dados (32 MB, contra 7 MB de `postgres` e
`template0`). O proxy HTTP em 51217 **não** foi usado: leitura direta na porta do
Postgres tem menos peças no caminho.

**Versão do servidor antigo:**

```
PostgreSQL 17.5 on wasm32-unknown-linux-gnu,
compiled by emcc (Emscripten) 3.1.74, 32-bit
```

Build WASM/Emscripten de 32 bits. Isso encerra a hipótese de anexar
`Data\default\.pglite` a um PostgreSQL 18 nativo: além do `PG_VERSION 17`, o
diretório foi escrito por um build que não é o nativo.

**Migrations:** 10 linhas em `_prisma_migrations` — **9 aplicadas com sucesso** e
**1 marcada como rolled back**: `29990101000000_probe_tx`, resquício da prova
registrada na seção 4 de que o Prisma não envolve migrations em transação. Ela
**não existe** em `prisma/migrations/` e **não deve viajar** para o banco novo.

### Contagens finais — 18 tabelas

| #   | Tabela              | Linhas | #   | Tabela                 | Linhas |
| --- | ------------------- | -----: | --- | ---------------------- | -----: |
| 1   | `Plan`              |      2 | 10  | `Order`                |     16 |
| 2   | `Company`           |     12 | 11  | `OrderItem`            |     17 |
| 3   | `User`              |      7 | 12  | `OrderAttachment`      |      0 |
| 4   | `Account`           |      0 | 13  | `StockMovement`        |     11 |
| 5   | `Session`           |      0 | 14  | `AuditLog`             |      8 |
| 6   | `VerificationToken` |    486 | 15  | `Notification`         |      0 |
| 7   | `Invitation`        |      0 | 16  | `Payment`              |      0 |
| 8   | `Customer`          |     10 | 17  | `SubscriptionCheckout` |      0 |
| 9   | `Product`           |     10 | 18  | `PaymentProviderEvent` |      0 |

**Total: 579 linhas.** Oito tabelas vazias.

Três leituras que importam para a migração:

- `Session` e `Account` vazias **confirmam no dado** o que o schema dizia: sessão
  é JWT e não há vínculo OAuth em uso.
- `VerificationToken` (486) é a maior tabela e responde por ~70% dos bytes
  exportados.
- `AuditLog` tem 8 linhas — três ordens de grandeza abaixo do limite que exigiria
  paginação por keyset.

---

## 11. P3 — backup

### 11.1 `pg_dump` nativo: FALHOU

`pg_dump` 18.4 contra o servidor 17.5, formato custom (`-Fc`). Rodou 4 segundos e
morreu na **primeira tabela de dados**:

```
pg_dump: error: consulta falhou: o servidor fechou a conexão de forma não esperada
pg_dump: detail: Query was: COPY public."Account" (...) TO stdout;
```

O daemon **não sobreviveu** — o `prisma dev stop` seguinte respondeu
`No prisma dev servers found to stop`.

> **O arquivo gerado NÃO é backup.**
> `fluxy-dev-before-postgres-migration-20260807-2316.dump` tem 76.840 bytes de
> cabeçalho e TOC (197 entradas) e **zero linha de dados**. O `pg_restore --list`
> devolve exit 0 sobre ele — o que prova apenas que o índice é legível, porque no
> formato custom o TOC é escrito **antes** dos dados. **Preservado, jamais
> restaurar.**

Aprendizado que redesenhou o plano: a falha foi num `COPY` de tabela com no
máximo 7 linhas. Não era volume — era o `COPY ... TO stdout` em si. Logo, o
Plano B não podia usar COPY em ponto algum.

O TOC também revelou que um dump de `template1` arrastaria o schema interno
`_prisma_dev_wal` junto com o `public`.

### 11.2 Plano B: exportação JSONL — CONCLUÍDO

`SELECT` com `row_to_json`, **sem COPY**, uma tabela por vez, duas conexões
curtas por tabela (`count(*)` e export), arquivo escrito pelo próprio `psql`
(`-o`) com `PGCLIENTENCODING=UTF8`.

Decisões de fidelidade:

- as **13 colunas `DECIMAL(10,2)`** saem com `::text` → string JSON, nunca número;
- as **40 colunas `TIMESTAMP(3)`** saem com
  `to_char(col, 'YYYY-MM-DD"T"HH24:MI:SS.MS')` — não depende de `DateStyle`, não
  inventa fuso, não converte para UTC;
- `ORDER BY … COLLATE "C"` torna a ordem — e o SHA-256 — independentes do
  collation do banco;
- **allowlist literal de 18 tabelas**, nunca enumeração: `_prisma_migrations` e
  `_prisma_dev_wal` ficam fora por ausência, não por exclusão.

**Preflight aprovado antes de escrever qualquer byte de negócio:**

| Verificação          | Resultado |
| -------------------- | --------- |
| Tabelas da allowlist | **18**    |
| Colunas conferidas   | **199**   |
| Colunas `numeric`    | **13**    |
| Colunas `timestamp`  | **40**    |
| Colunas `jsonb`      | **2**     |
| Colunas `text[]`     | **1**     |

Mais um autoteste de serialização com 12 asserções, executado sobre literais na
própria instância exportada: JSONB continua objeto e array, `TEXT[]` continua
array JSON, `NULL` continua `null`, string vazia continua `""`, quebra de linha
fica escapada (1 linha JSON = 1 linha física), Unicode preservado, `Decimal`
como string, timestamp determinístico com milissegundos e zero à esquerda.

**Resultado: 18/18 tabelas `OK`.** `expectedRows == exportedRows` em **todas**,
com recontagem independente na finalização offline. **18/18 SHA-256** calculados
com o servidor já parado. Zero `FAILED`, zero `DEFERRED_LARGE`.

Custo: duas janelas, ~170 s de daemon no ar, 2,08 MB de crescimento no
`durable-streams.sqlite`.

### 11.3 Artefatos do backup

**Plaintext (permanece presente, por decisão explícita):**

```
C:\Users\Bryan\Backups\Fluxy\export-20260808-1207\
```

20 arquivos, 124.631 bytes: `manifest.json`, `_selftest.json` e os 18 `.jsonl`.

**Cifrado:**

```
C:\Users\Bryan\Backups\Fluxy\fluxy-dev-backup-20260808-1207.rar
```

|                      |                                                                    |
| -------------------- | ------------------------------------------------------------------ |
| Ferramenta           | WinRAR 7.01 x64 (RAR5)                                             |
| Algoritmo            | **AES-256**, com **headers cifrados** (`-hp`)                      |
| Tamanho              | 38.318 bytes (37,42 KB)                                            |
| SHA-256              | `587b25cac18a9377db1c788829df3ebc14cb5f31d03780843ea4b4b9fe31db61` |
| Teste de integridade | **All OK** (executado manualmente pelo usuário)                    |

A senha foi digitada pelo usuário no próprio terminal. **Não está neste
documento, em script, em log, no manifest nem no repositório.** 7-Zip não está
instalado nesta máquina — os `7z.exe` encontrados são cópias embutidas no pacote
de drivers da AMD, e por isso WinRAR foi a escolha.

**Ferramentas da exportação** (fora do repositório, no scratchpad da sessão):
`tables.ps1` (allowlist e classificação de colunas), `Build-ExportSql.ps1`,
`Export-Fluxy.ps1`, `Finalize-Export.ps1` e 40 arquivos `.sql` gerados.

### 11.4 Estado do ambiente após P3

|                          |                                     |
| ------------------------ | ----------------------------------- |
| `prisma dev default`     | **`not_running`**                   |
| `prisma dev fluxy`       | **`not_running`**                   |
| `Data\default\.pglite`   | preservado (78,5 MB)                |
| `durable-streams.sqlite` | preservado (5.429,8 MB)             |
| Dump parcial de 07/08    | preservado (inservível)             |
| `gestao_pedidos`         | **intocado** — segue fora de escopo |
| Working tree             | limpa                               |
| F3                       | **não iniciada**                    |

---

## 12. Ponto exato onde paramos

> ## ⚠️ P4 e P5 AINDA NÃO FORAM EXECUTADOS.
>
> Nenhum banco novo existe. Nenhum dado foi importado. `.env` não foi alterado.

**Concluídas:** P1 (PostgreSQL local auditado, `pgpass.conf` corrigido,
autenticação validada) · P2 (inventário) · P3 (backup completo, validado e
cifrado).

### Próxima etapa — P4/P5

1. Criar a **role dedicada `fluxy`** — a senha é definida pelo usuário; o agente
   não cria nem digita senhas.
2. Criar **`fluxy_dev`**.
3. Criar **`fluxy_shadow`** — banco separado, **nunca** o mesmo de
   desenvolvimento.
4. Aplicar as migrations com **`prisma migrate deploy`** (nunca `db push`, nunca
   `migrate reset`).
5. **`prisma generate`**.
6. **PARAR.** Não importar dado nenhum até o importador ser revisado.

A role `postgres` continua sendo usada só para administração/migração, nunca como
credencial permanente da aplicação.

### Depois do importador revisado

7. Importar os 18 JSONL na **ordem topológica de FK**:
   `Plan → Company → User → Account → Session → VerificationToken → Invitation →
Customer → Product → Order → OrderItem → OrderAttachment → StockMovement →
AuditLog → Notification → Payment → SubscriptionCheckout → PaymentProviderEvent`
8. Provar equivalência: contagens por tabela contra a seção 10, mais integridade
   referencial (Company→Plan, User→Company, Order→Company, Payment→Order,
   isolamento por tenant, preços dos planos).
9. **Só então** alterar `DATABASE_URL` no `.env` local.
10. Validar sem `prisma dev`: `prisma generate`, `migrate status`, `tsc`,
    `eslint`, `vitest run` (esperado 589/589), `next build`.

Pontos já resolvidos que o importador pode assumir:

- **Não há sequences.** Zero `SERIAL`, `IDENTITY` ou `CREATE SEQUENCE` nas 9
  migrations: todo `id` é `cuid()` gerado no cliente, então os IDs sobrevivem por
  construção e nada precisa ser ressincronizado.
- **`_prisma_migrations` não foi exportada.** Quem a preenche no banco novo é o
  `migrate deploy` — e é assim que a linha `probe_tx` fica para trás.
- **Não há `BYTEA`** e não há `TIMESTAMPTZ`: nenhum problema de binário ou fuso.

**Não apagar o ambiente antigo** mesmo após tudo funcionar. A exclusão do
plaintext de backup é decisão posterior, só depois de `fluxy_dev` migrado e
validado.

---

## 13. Proibições vigentes

- ❌ Não iniciar **F3**
- ❌ Não criar produtos/preços na ValidaPay
- ❌ Não criar checkout
- ❌ Não implementar webhook
- ❌ Não apagar `durable-streams.sqlite`
- ❌ Não executar `prisma dev rm`
- ❌ Não tocar em `gestao_pedidos`
- ❌ Não restaurar — nem confiar em — o dump parcial de 07/08
- ❌ Não apagar os backups: nem `export-20260808-1207\`, nem o `.rar`
- ❌ Não gravar senha em script, log, manifest ou neste documento
- ❌ Não importar dados antes de o importador ser revisado
- ❌ Não tocar em produção (banco, Vercel, ValidaPay)
- ❌ Não alterar migrations antigas
- ❌ Não usar `db push`
- ❌ Não usar `migrate reset`
- ❌ Não alterar `pg_hba.conf` nem ACLs
- ❌ Não ler nem imprimir o conteúdo do `pgpass.conf`
- ❌ Não mexer no projeto Vercel `fluxy-fdnx`

---

## 14. Prompt de retomada

Cole o texto abaixo numa conversa nova:

```
Leia docs/STATUS-VALIDAPAY.md no repositório Fluxy e retome exatamente
do ponto registrado na seção 12.

Estamos migrando o ambiente de desenvolvimento do `prisma dev` para o
PostgreSQL 18 local normal. P1, P2 e P3 estão concluídas: o banco antigo
foi inventariado (579 linhas em 18 tabelas) e os dados estão exportados
em JSONL, validados (18/18 OK, 18/18 SHA-256) e com cópia cifrada.

Próxima etapa é P4/P5: criar a role dedicada `fluxy` (senha definida por
mim), criar `fluxy_dev` e `fluxy_shadow`, aplicar `prisma migrate deploy`
e rodar `prisma generate`. PARE antes de importar qualquer dado — quero
revisar o importador primeiro.

O `prisma dev` está parado e NÃO deve ser reiniciado sem me explicar
antes por quê, o que será feito e quando será parado de novo.

Respeite integralmente as proibições da seção 13. Não inicie F3.
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
