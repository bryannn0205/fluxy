# Estado da integração ValidaPay — documento de continuidade

**Atualizado em:** 14/08/2026
**Propósito:** permitir retomar o trabalho numa conversa nova, sem depender do histórico anterior.

> **Onde paramos:** ✅ **Migração local para PostgreSQL 18 FINALIZADA.**
> O desenvolvimento roda em `localhost:5432/fluxy_dev` com a role `fluxy`; os
> testes, isolados em `fluxy_test`. O `prisma dev` está aposentado.
> **F3 (checkout ValidaPay) ENCERRADA TECNICAMENTE para sandbox/MVP** —
> fluxo completo comprovado ponta a ponta com webhook real em produção
> (seção 16.15). Produtos/preços comerciais definitivos ainda não existem;
> pagamento real ainda não está habilitado.
> Ver seções 12 a 15 para a migração, 16 para o histórico da F3-DISCOVERY
> (16.15 para o fechamento) e 18 para o prompt de retomada.

---

## 1. Estado do Git

|                 |                                                                      |
| --------------- | -------------------------------------------------------------------- |
| Branch atual    | `master`                                                             |
| Working tree    | limpa                                                                |
| HEAD            | `fbb152d` — `test: isolate database and finalize postgres migration` |
| Merge do PR #4  | `ae3d088`                                                            |
| Commit de F1+F2 | `ed8ae9e` — `feat: add ValidaPay client and payment provider schema` |
| PR #4           | **mesclado** em `master` (`ae3d088`)                                 |

Os scripts de exportação, importação e reconciliação vivem **fora do
repositório**. As únicas mudanças de código que a migração produziu foram as do
isolamento de testes (seção 14.2) e a extração de `prisma/seed-plans.ts`.

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

Números **de F1/F2**, quando a suíte ainda rodava contra o `prisma dev`. O estado
atual, depois da migração e do isolamento, está na seção 14.4.

|                         |                                             |
| ----------------------- | ------------------------------------------- |
| `vitest run`            | 589/589, 39 arquivos → hoje **628/628**, 42 |
| `tsc --noEmit`          | 0 erros                                     |
| `eslint`                | exit 0                                      |
| `next build`            | limpo                                       |
| `db:seed`               | ok                                          |
| `prisma migrate status` | 9 migrations, banco em dia                  |

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

## 12. P4/P5 — ambiente novo criado e migrado

**P4 — role e bancos.** No PostgreSQL 18.4 local:

| Objeto           | Estado                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Role `fluxy`     | `LOGIN` · **sem** SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS · sem membership |
| `fluxy_dev`      | owner `fluxy`                                                                              |
| `fluxy_shadow`   | owner `fluxy`                                                                              |
| `fluxy_test`     | owner `fluxy` (criado em P8B)                                                              |
| `gestao_pedidos` | owner `postgres` — **intocado**                                                            |

A senha da role foi definida pelo usuário via `\password fluxy`, que monta o hash
no cliente: a senha em claro nunca trafega nem entra no log do servidor. O agente
não cria nem digita senhas.

O schema `public` dos bancos novos pertence a `pg_database_owner`, que resolve
para o dono do banco — `fluxy` cria objetos nos próprios bancos sem `GRANT`
adicional.

> ⚠️ **Collation `Portuguese_Brazil.1252`**, herdado do `template1` desta
> instalação Windows. Encoding é UTF8. Não afeta o dado armazenado, só ordenação
> e índices. **Diferença de ambiente a revisar contra produção**, que
> provavelmente usa `en_US.UTF-8` ou `C.UTF-8`.

**P5 — schema aplicado.** `prisma migrate deploy` aplicou as **9 migrations** em
`fluxy_dev`. As 19 tabelas ficaram com `owner = fluxy`, o que prova que a conexão
autenticou como a role dedicada. `prisma generate` em seguida.

Conferido no catálogo: 18 tabelas do Fluxy + `_prisma_migrations`, **199
colunas**, 13 `numeric`, 40 `timestamp`, 2 `jsonb`, 1 `text[]`, 15 enums, **zero
sequences**. As 199 colunas batem com o que a exportação mediu no banco antigo —
equivalência estrutural por dois caminhos independentes.

---

## 13. P6 — importação dos dados

### 13.1 O importador

Fora do repositório, em TypeScript, usando o `pg` que já vem de
`@prisma/adapter-pg`. **Nenhuma dependência nova.**

**`pg` direto, não Prisma Client.** O fator decisivo foram as 40 colunas
`timestamp without time zone`: passar por `Date` do JavaScript introduz conversão
de fuso silenciosa.

**O `INSERT` recebe a LINHA ORIGINAL do JSONL como único parâmetro:**

```sql
INSERT INTO "Tabela" ("a", "b", ...)
SELECT "a", "b", ...
FROM jsonb_populate_record(NULL::"Tabela", $1::jsonb)
```

Quem lê o JSON e produz os tipos é o Postgres. O JavaScript não converte valor
nenhum. Isso existe porque `JSON.parse` → `JSON.stringify` destrói números acima
de `Number.MAX_SAFE_INTEGER` — `9007199254740993` volta `…992` —, e comparar
depois com `JSON.parse` da mesma fonte produziria **falso positivo**. Conversões
confirmadas experimentalmente antes de adotar, inclusive precisão exata de
inteiro de 30 dígitos dentro de `jsonb`.

### 13.2 Garantias na transação

Uma transação única: `BEGIN` → `LOCK` das 18 tabelas em `SHARE ROW EXCLUSIVE` →
cobertura de colunas 199/199 → conferir vazio → 579 `INSERT`s em ordem topológica
→ contagens → **igualdade de conjunto das chaves** → **equivalência de conteúdo
campo a campo** → **33/33 FKs** → invariante multi-tenant → `_prisma_migrations`
→ `COMMIT`.

Sem `ON CONFLICT`, `UPDATE`, `DELETE`, `TRUNCATE`, `upsert` ou desativação de
constraint. Restauração para banco vazio, não sincronização.

**Equivalência provada:** 579/579 registros · 2.676 campos comparados em JS · 8
campos `jsonb` comparados **dentro do Postgres** (jsonb contra jsonb, a partir da
linha original) · zero divergências. `DECIMAL` como string literal, `TIMESTAMP`
relido com `to_char` sem fuso, `TEXT[]` com ordem, `NULL ≠ ""`.

### 13.3 Duas falhas encontradas pelo caminho

**Primeira tentativa abortou** na verificação de FKs: `array_agg(attname)`
devolve `name[]` (OID 1003), sem parser no node-postgres, então a lista de
colunas chegava como a string `{userId}` e a aridade era medida sobre o
comprimento do texto. `ROLLBACK` limpo, nada persistido. Corrigido com
`attname::text` e uma guarda que checa **formato antes de aridade**.

**Segunda tentativa: `COMMIT`.** 579 linhas em 2,87 s.

### 13.4 Resultado

| Tabela              | Linhas | Tabela                 | Linhas |
| ------------------- | -----: | ---------------------- | -----: |
| `Plan`              |      2 | `Order`                |     16 |
| `Company`           |     12 | `OrderItem`            |     17 |
| `User`              |      7 | `OrderAttachment`      |      0 |
| `Account`           |      0 | `StockMovement`        |     11 |
| `Session`           |      0 | `AuditLog`             |      8 |
| `VerificationToken` |    486 | `Notification`         |      0 |
| `Invitation`        |      0 | `Payment`              |      0 |
| `Customer`          |     10 | `SubscriptionCheckout` |      0 |
| `Product`           |     10 | `PaymentProviderEvent` |      0 |

**Total: 579 linhas.** IDs preservados por construção — todo `id` é `cuid()`
gerado no cliente, e a lista de colunas é explícita, então nenhum default dispara.

---

## 14. P7/P8 — a suíte de testes contaminava o banco migrado

### 14.1 A descoberta

Logo após a importação, `npm test` passou 589/589 — e **escreveu em
`fluxy_dev`**: 28 linhas em `VerificationToken` e o `updatedAt` de um `Plan`.

Causa: os testes liam `DATABASE_URL`, que agora apontava para o banco migrado.
Enquanto essa variável endereçava um banco descartável do `prisma dev`, o
problema era invisível. A migração não o causou — **expôs**.

Havia **dois** caminhos de escrita, e o segundo só apareceu depois de fechar o
primeiro:

| Caminho                     | Cliente                  | Lia            |
| --------------------------- | ------------------------ | -------------- |
| Testes escrevendo direto    | `createTestPrismaClient` | `DATABASE_URL` |
| App exercitada pelos testes | singleton de `lib/db.ts` | `DATABASE_URL` |

A cadeia do segundo: `AuthService` → `createEmailVerificationToken()` de
`lib/tokens.ts` → singleton de `lib/db.ts`. Por isso **só** `VerificationToken`
era afetado — é o único ponto de `lib/` que escreve.

### 14.2 A correção

**`fluxy_test`**, banco separado com as 9 migrations, owner `fluxy`.

**`TEST_DATABASE_URL`** no `.env` (gitignorado), resolvida e validada por
`tests/helpers/test-database-url.ts` — recusa `fluxy_dev`, `fluxy_shadow`,
`gestao_pedidos`, `postgres`, host não-local, porta ≠ 5432 e banco ≠
`fluxy_test`. **`DATABASE_URL` nunca é usada como alternativa.**

**Isolamento no `vitest.config.ts`:** durante o Vitest, `TEST_DATABASE_URL` _e_
`DATABASE_URL` apontam para `fluxy_test`, cobrindo os dois caminhos. Nenhuma
lógica de teste entrou em `lib/db.ts` — é o ambiente que muda. Fora dos testes,
`DATABASE_URL` segue em `fluxy_dev`.

**Três guardas independentes:** no config (aborta a suíte), no `globalSetup`
(confirma pelo servidor: `current_database`, `current_user`, porta, migrations,
nº de tabelas) e no helper do client.

**`globalSetup`** prepara `fluxy_test` a cada execução, numa transação: valida o
alvo, prova a ordem de limpeza contra as **33 FKs** do catálogo, trava as tabelas,
apaga em ordem topológica reversa e semeia **somente** o catálogo de planos. Sem
`TRUNCATE`, sem `DROP`, sem `migrate reset`, sem `seedDemoCompany`.

**`prisma/seed-plans.ts`** — catálogo extraído para módulo próprio, fonte única
compartilhada entre `prisma/seed.ts` e a preparação de testes. Valores, slugs,
preços e limites inalterados; `seedDemoCompany` e `applyApprovedPriceChange`
seguem no fluxo normal do seed, intocados.

### 14.3 Reconciliação

O `fluxy_dev` foi devolvido ao estado pós-importação **duas vezes**, por
transação, removendo apenas as linhas identificadas por _chaves do banco MINUS
chaves do backup_ — nunca por data, expiração ou padrão de token.

### 14.4 Validação final

| Verificação                     | Resultado                         |
| ------------------------------- | --------------------------------- |
| `npm test`, 1ª execução         | **628/628** · 42 arquivos         |
| `npm test`, 2ª execução seguida | **628/628** · sem limpeza manual  |
| `fluxy_dev` após cada execução  | **579/579 equivalente ao backup** |
| `npm run type-check`            | exit 0                            |
| `npm run lint`                  | exit 0                            |
| `npm run build`                 | exit 0 · 24 páginas, 26 rotas     |

A conta dos testes: 589 históricos + 17 (guarda de `TEST_DATABASE_URL`) + 19
(preparador e catálogo) + 3 (isolamento com conexão real) = **628**.

---

## 15. P9 — validação operacional e FIM DA MIGRAÇÃO

`npm run dev` com o `prisma dev` parado:

- **Ready em 3,3 s**, `http://localhost:3000`;
- rotas públicas `/`, `/login`, `/plans`, `/register`, `/forgot-password`,
  `/reset-password` → **200**; `/dashboard` → **307** para login;
- `/plans` renderiza **Fluxy Standard R$ 29** e **Fluxy Pro R$ 89** com os
  limites corretos — dados vindos do banco migrado;
- zero erros no console do navegador;
- **nenhuma conexão nas portas 51217-51220** do `prisma dev`;
- `pg_stat_database`: `fluxy_dev` +1 transação e +16 tuplas durante as
  requisições; `fluxy_test` zero; **`gestao_pedidos` com contador acumulado 0 —
  nunca foi acessado**;
- nenhuma migration automática, nenhum seed automático.

Servidor parado e `fluxy_dev` reconferido: **579/579, zero divergências**.

> # ✅ MIGRAÇÃO LOCAL PARA POSTGRESQL 18 FINALIZADA
>
> O desenvolvimento roda em **PostgreSQL 18.4 local**, `localhost:5432`,
> `fluxy_dev`, role `fluxy`. O **`prisma dev` está aposentado** do fluxo normal —
> não é mais iniciado, e o `npm run db:dev` deixou de ser parte do trabalho
> diário.
>
> O ambiente antigo continua preservado: `Data\default\.pglite`,
> `durable-streams.sqlite` e os backups. **Nada foi apagado.**

---

## 16. F3-DISCOVERY — encerrada funcionalmente, uma lacuna (10/08/2026)

> ✅ **F3-DISCOVERY encerrada funcionalmente.** Fluxo oficial (`POST
/v1/charges` → simulador → `charge PAID` / `subscription ACTIVE`)
> confirmado ponta a ponta em sandbox — ver 16.14. **Lacuna única:** payload
> real de webhook ainda não observado, porque **não existe webhook cadastrado**
> na conta sandbox nova. `CBE041` (16.5/16.8) segue suspenso — não fazia parte
> do fluxo correto (16.9).

Exploração feita **fora do código** — chamadas diretas ao sandbox, sem
persistir wrapper algum em `lib/validapay/`. Nenhum arquivo do repositório foi
tocado nesta fase.

### 16.1 Credencial sandbox nova

- Uma **segunda** credencial sandbox foi criada porque a original não podia
  ser editada. A antiga **não foi apagada** — segue preservada.
- `VALIDAPAY_CLIENT_ID`, `VALIDAPAY_CLIENT_SECRET` e `VALIDAPAY_SCOPE` foram
  substituídos manualmente no `.env` (fora do repositório, gitignorado) pelo
  usuário — o agente não editou o `.env`.
- **Confirmado carregada**: `GET /v1/products` respondeu com o `accountId`
  `SANDBOX_d4d874b8-3091-70f2-a232-9552bbf62fc1`, da conta nova.

### 16.2 OAuth — validado

| Escopo testado                          | HTTP | `token_type` | `expires_in` |
| --------------------------------------- | ---- | ------------ | ------------ |
| `wallet/read` isolado                   | 200  | Bearer       | 3600         |
| `wallet/write` isolado                  | 200  | Bearer       | 3600         |
| `VALIDAPAY_SCOPE` completo (11 escopos) | 200  | Bearer       | 3600         |

Em nenhum momento `client_secret`, `access_token` ou o header `Authorization`
foram exibidos — só status, `token_type` e `expires_in`.

### 16.3 Descobertas confirmadas

- **`amount` é em reais**, não centavos (preços observados: `29` e `29.9`).
- **`Product` contém `prices[]`** embutido — preço não é recurso à parte.
- **`PUT /v1/products/:id` substitui o array de preços inteiro** e gera
  `priceId`s novos (já sabido antes desta sessão, sem re-teste agora).
- **`products/read` e `products/write`** funcionam.
- **`checkouts/read` e `checkouts/write`** funcionam — `POST
/v1/checkout-sessions` com `priceId` retorna `{ id, url, priceId }`.
- **`successUrl` e `cancelUrl` são persistidos** — confirmado lendo de volta
  via `GET /v1/checkout-sessions/:id`.
- **`metadata` é persistido** — ecoado de volta byte a byte.
- **Cliente prévio não é necessário para criar checkout session** — o
  `POST /v1/checkout-sessions` só pediu `priceId`.
- **`POST /v1/subscriptions` exige** (não documentado antes desta sessão):
  - `paymentMethod`: `"pix" | "creditcard" | "boleto" | "pix_automatico"`;
  - `customer.documentNumber` (CPF/CNPJ) — mesmo sem cliente pré-cadastrado;
  - `items[]` (array, formato `{ priceId, quantity }`).

### 16.4 Métodos de pagamento observados em `POST /v1/subscriptions`

> ⚠️ **Ver 16.9** — confirmado depois, na documentação oficial, que essa rota
> **não existe** como endpoint de criação de assinatura. Resultados abaixo
> preservados como histórico da investigação, não como caminho a seguir.

| `paymentMethod`  | Resultado                                                                             |
| ---------------- | ------------------------------------------------------------------------------------- |
| `pix`            | **400** — erro downstream (ver 16.5)                                                  |
| `boleto`         | **400** — erro downstream idêntico ao de `pix`                                        |
| `pix_automatico` | **500** — `"Método de pagamento não suportado para emissão"`                          |
| `creditcard`     | **400** — exige objeto `card` ou `paymentMethodId` tokenizado; não testado além disso |

### 16.5 Bloqueio — erro downstream Celcoin DICT (`CBE041`)

> ⚠️ **Ver 16.9** — este erro ocorreu numa rota fora da documentação oficial.
> Fica em aberto se é um bug de conta ou apenas o comportamento de uma rota
> não suportada para este fluxo. O ticket da seção 16.8 fica **suspenso**
> até confirmarmos (ou não) o mesmo erro no fluxo correto.

`pix` e `boleto` falham com o **mesmo erro**, independente do CPF sintético ou
do método escolhido — indício de problema do lado da ValidaPay na conta
sandbox nova, não do payload enviado:

```json
{
  "error": {
    "message": "Account possui tamanho maximo de 20 caracteres",
    "code": "INTERNAL_ERROR",
    "details": {
      "celcoinRequest": {
        "endpoint": "/celcoin-baas-pix-dict-webservice/v1/pix/dict/entry",
        "method": "POST"
      },
      "celcoinErrorResponse": {
        "status": "ERROR",
        "error": {
          "errorCode": "CBE041",
          "message": "Account possui tamanho maximo de 20 caracteres"
        },
        "version": "1.0.0"
      }
    }
  }
}
```

Ocorre no registro de chave PIX (DICT) da própria conta ValidaPay/Celcoin,
antes de qualquer processamento do pagamento em si.

**Consequência:** nenhum `chargeId` foi obtido. Sem `chargeId`, o simulador
oficial não pôde ser chamado.

### 16.6 Simulador oficial sandbox

```
POST /v1/wallet/pay/:chargeId
scope: wallet/write
sem body
```

**Ainda não executado** — depende de um `chargeId` válido, que depende do
bloqueio da seção 16.5 ser resolvido.

### 16.7 Estado final desta fase

- Nenhum `chargeId` obtido.
- `POST /v1/wallet/pay/:chargeId` **não executado**.
- **Nenhum pagamento — real ou simulado — ocorreu.**
- Request bin (`https://webhook.site/8770e5c7-9616-4d63-afed-28814e286077`)
  segue **sem nenhum webhook recebido** (0/50).
- Fórmula da `idempotencyKey` **permanece em aberto** — depende do payload
  real de um evento, que depende do bloqueio ser resolvido.
- F3a/F3b **continuam não implementadas**.
- `Plan.validapayPriceMonthlyId`/`validapayPriceYearlyId` **não atualizados**.
- **Nenhuma migration** criada.
- PostgreSQL **intocado**.

### 16.8 Ticket para o suporte da ValidaPay (sanitizado) — SUSPENSO

> ⚠️ **Não enviar ainda.** Ver 16.9 — o endpoint reproduzido aqui não é
> documentado como rota de criação de assinatura. Mantido como registro
> histórico; só reabrir se o mesmo erro aparecer no fluxo oficial (16.10).

Sem `token`, `client_secret`, `Authorization`, CPF, e-mail de teste ou
qualquer PII — pronto para envio, **se e quando reaberto**:

```
Assunto: Erro CBE041 (Celcoin DICT) ao criar subscription via
POST /v1/subscriptions em conta sandbox nova

Ambiente: Sandbox — accountId SANDBOX_d4d874b8-3091-70f2-a232-9552bbf62fc1

Reprodução: POST /v1/subscriptions com priceId de um preço existente
(RECURRING, BRL), items: [{ priceId, quantity: 1 }], customer: { name,
email, documentNumber } (CPF sintético com dígito verificador válido) e
paymentMethod variando entre pix e boleto.

Resultado: ambos os métodos falham de forma idêntica com HTTP 400:

{
  "error": {
    "message": "Account possui tamanho maximo de 20 caracteres",
    "code": "INTERNAL_ERROR",
    "details": {
      "celcoinRequest": {
        "endpoint": "/celcoin-baas-pix-dict-webservice/v1/pix/dict/entry",
        "method": "POST"
      },
      "celcoinErrorResponse": {
        "status": "ERROR",
        "error": { "errorCode": "CBE041", "message": "Account possui tamanho maximo de 20 caracteres" },
        "version": "1.0.0"
      }
    }
  }
}

Ocorre no registro de chave PIX (DICT) do lado da própria conta
ValidaPay/Celcoin, antes de qualquer processamento do pagamento em si — o
erro é idêntico trocando CPF e método, o que aponta para um campo
(provavelmente o identificador interno da conta) excedendo 20 caracteres na
chamada que a ValidaPay faz para a Celcoin.

Impacto: bloqueia a emissão de qualquer cobrança nessa credencial sandbox
nova, incluindo o fluxo de teste do simulador oficial
POST /v1/wallet/pay/:chargeId, já que não é possível gerar um chargeId para
simular.
```

### 16.9 Correção arquitetural — `POST /v1/subscriptions` não é rota de criação (10/08/2026)

**Fonte:** documentação oficial em `docs.validapay.com.br`, seção "Assinaturas"
da Referência da API — navegada diretamente, não só a transcrição do usuário.

A seção "Assinaturas" tem **exatamente 7 endpoints**, todos de gerenciamento
de uma assinatura **que já existe**:

```
GET    /v1/subscriptions
GET    /v1/subscriptions/:subscriptionId
PATCH  /v1/subscriptions/:subscriptionId          (upgrade/downgrade de item)
PATCH  /v1/subscriptions/:subscriptionId          (cancelar item)
DELETE /v1/subscriptions/:subscriptionId          (cancelar assinatura)
POST   /v1/subscriptions/:subscriptionId/items    (adicionar item)
PUT    /v1/subscriptions/:subscriptionId/items/:itemId  (rota canônica de upgrade/downgrade)
POST   /v1/subscriptions/:subscriptionId/prorata
```

**Não existe rota de criação.** `POST /v1/subscriptions`, usado nas seções
16.4/16.5, **não faz parte da API pública documentada**.

**Decisões:**

- **Não usar mais `POST /v1/subscriptions` para criação inicial.**
- **Ticket `CBE041` (16.8) suspenso/descartado como bloqueio principal**
  enquanto essa rota não for usada de novo — o erro pode ser específico de
  uma rota fora do fluxo suportado, não necessariamente um bug de conta.

### 16.10 Fluxo oficial reconstruído

**Endpoint inicial real:** `POST /v1/charges` (não `/v1/subscriptions`, não
`/v1/checkout-sessions`) — escopo `checkouts/write`, não `subscriptions/write`.
Três variações documentadas na mesma rota, diferindo só em `paymentMethod`:
`pix`, `boleto`, `creditcard`.

**Request** (exemplo `pix`, da documentação oficial):

```json
POST /v1/charges
{
  "paymentMethod": "pix",
  "externalId": "pedido-2026-0001",
  "customer": {
    "name": "<NOME_EXEMPLO>",
    "email": "<EMAIL_EXEMPLO>",
    "documentNumber": "<DOCUMENTO_EXEMPLO>",
    "phone": "<TELEFONE_EXEMPLO>",
    "cep": "01310100"
  },
  "items": [{ "priceId": "price_abc123", "quantity": 1 }],
  "metadata": { "referencia": "pedido-001" }
}
```

**Response 200 (síncrona):**

```json
{
  "success": true,
  "customerId": "cus_xxx",
  "chargeId": "cha_abc123",
  "pix": { "emv": "...", "qrCode": "data:image/png;base64,..." }
}
```

Para `creditcard`, a resposta já vem com `"status": "paid"` — liquida
**síncrono**, sem precisar do simulador. Para `pix`/`boleto`, o charge fica
pendente até alguém pagar — é aí que entra o simulador (16.10.2).

**Onde nasce cada identificador:**

| Identificador                | Onde aparece                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chargeId` (`cha_...`)       | **Síncrono**, na resposta de `POST /v1/charges`. Replicado no webhook `charge.created`.                                                              |
| `customerId` (`cus_...`)     | **Síncrono**, mesma resposta — confirma de novo que cliente prévio não é obrigatório: a ValidaPay cria o cliente a partir dos dados enviados inline. |
| `subscriptionId` (`sub_...`) | **NÃO vem na resposta síncrona.** Só aparece depois, no webhook `subscription.created`, ou consultando `GET /v1/subscriptions` posteriormente.       |

Relevante para `SubscriptionCheckout`: a correlação do webhook com a empresa
precisa passar por `externalChargeId` (disponível na hora, síncrono) —
`subscriptionId` só existe depois que o webhook chega.

**Sequências oficiais de eventos** (documentação, "Relação com operações da API"):

```
Boleto/PIX — assinatura recorrente:
  subscription.created → charge.created → (cliente paga) → payment.success → subscription.activated

Cartão — 1º pagamento:
  subscription.created → charge.created → subscription.activated
  (payment.success NÃO dispara para cartão)

Renovação (ciclo 2+):
  charge.created → payment.success → subscription.renewed
```

**Divergência a investigar depois:** o `checkout-session` criado na sessão
anterior (16.3) usou `cancelUrl`; a documentação oficial só documenta
`successUrl` e `failureUrl` para essa rota. Não testado de novo agora —
testar criaria recurso.

#### 16.10.2 Simulador sandbox (reafirmado)

```
POST /v1/wallet/pay/:chargeId
scope: wallet/write
sem body
```

Path param é exatamente o `chargeId` retornado pela resposta síncrona de
`POST /v1/charges`. Fluxo correto: `POST /v1/charges` (`pix` ou `boleto`) →
pega `chargeId` da resposta → `POST /v1/wallet/pay/:chargeId` → observa
`payment.success` e `subscription.activated` no request bin.

### 16.11 Segurança do webhook — assinatura HMAC (documentação oficial)

```
Header:  X-Webhook-Signature: t={timestamp},v1={hmac_sha256}
Cálculo: HMAC-SHA256(secret, "{timestamp}.{rawBody}")
Auth opcional: x-access-token, se authToken configurado no webhook
Filtro: só entrega se webhook status=active E evento estiver na lista `events` cadastrada
```

Cadastro via `POST /v1/users/webhooks` ou painel (`Integração → Webhooks`) —
o `secret` é devolvido **na criação** e deve ser guardado para validar a
assinatura depois. Existe endpoint de teste: `POST /v1/users/webhooks/test`.

**Regras para o desenho de F3b** (não implementado ainda):

- **HMAC como autenticação principal** — extrair `t` e `v1` do header,
  recalcular `HMAC-SHA256(secret, "{t}.{rawBody}")`, comparar com `v1`.
- **Corpo RAW obrigatório** — o cálculo usa `{timestamp}.{body_json}`;
  qualquer reserialização (reordenar chaves, mudar espaçamento) quebra a
  assinatura. A rota precisa capturar o body como string antes de qualquer
  `JSON.parse`.
- **Comparação constant-time** — `crypto.timingSafeEqual`, nunca `===`.
- **Timestamp/replay** — a documentação **não define** uma janela de
  tolerância explícita; política própria (ex.: 5 min) fica para decidir na
  implementação, não está pronta na doc.
- **`x-access-token` é camada adicional opcional** — só se o painel tiver
  `authToken` configurado; **não substitui** o HMAC.

### 16.12 Idempotência — atualizado

**Saída (Fluxy → ValidaPay) — resolvido, documentado:** campo `externalId`
no `POST /v1/charges`. Reenvio com o mesmo `externalId` é recusado com
`409 DUPLICATE_CHARGE`, retornando o `chargeId` da cobrança original.

**Entrada (webhook → Fluxy) — `PaymentProviderEvent.idempotencyKey`, ainda
em aberto.** Nenhum payload de webhook documentado tem um ID de evento
próprio (`id`/`eventId`) — conferido em `subscription.created`,
`subscription.trial`, `subscription.activated`, `subscription.renewed`,
`subscription.canceled`, `subscription.cancel_scheduled`,
`subscription.upgraded`, `subscription.item_added`, `charge.created`,
`payment.success`, `payment.failed`, `payment.overdue`.

Candidatos, **sem fechar a fórmula**:

- `{event}:{chargeId}` — para eventos com `chargeId` no nível raiz.
- `{event}:{subscriptionId}:{currentCycleNumber}` — para eventos só de
  assinatura, sem `chargeId`.

**Problema em aberto:** a documentação mostra **duas versões diferentes**
do mesmo `payment.success` — uma "simples" (`chargeId`, `paymentId`,
`payer.*`) e uma "enriquecida com assinatura" (sem `chargeId` no nível
raiz, dados dentro de `currentCycle`, sem `paymentId`). A própria doc
admite: _"Se o enrichment falhar, um payload simplificado é enviado."_ Não
dá para fechar a fórmula sem ver qual das duas formas chega de verdade no
request bin — pode até variar por execução.

### 16.13 Estado desta fase (atualizado)

- Nenhuma chamada de API foi feita nesta rodada — só leitura de
  documentação pública (`docs.validapay.com.br`).
- `POST /v1/subscriptions` **não será mais usado** como caminho de criação.
- Ticket do `CBE041` (16.8) **suspenso**, não enviado.
- Ainda **nenhum `chargeId` obtido** — próximo teste real é
  `POST /v1/charges`.
- `idempotencyKey` de entrada (webhook) **segue em aberto**.
- F3a/F3b **continuam não implementadas**.
- `Plan` **não atualizado**.
- **Nenhuma migration** criada.
- PostgreSQL **intocado**.
- **Nenhum código alterado.**

### 16.14 `POST /v1/charges` confirmado ponta a ponta + simulador executado (10/08/2026)

**Fluxo oficial confirmado com chamada real** (única, reaproveitada nas
etapas seguintes) — `POST /v1/charges` funciona exatamente como a
documentação descreve (16.10):

- **Timeout do cliente não implica falha do servidor**: a 1ª chamada expirou
  no lado do agente (10s) mas foi processada normalmente do lado da
  ValidaPay.
- **`externalId` + `409 DUPLICATE_CHARGE` funciona como documentado**: uma
  2ª chamada com `externalId` diferente, mesmo `customer`/`priceId`, foi
  recusada com `409` e devolveu o `chargeId` da cobrança original —
  confirma que o mecanismo de idempotência de saída (16.12) é real, não só
  teórico.
- **`chargeId` obtido**: `SANDBOX_cha_1786386101742_e99sbfpxw`.
- **`subscriptionId` correlacionado**: `sub_1786386098663_xf54x5394` — **não
  veio na resposta síncrona do `POST`**, só via `GET /v1/charges/:chargeId`
  e `GET /v1/subscriptions`, confirmando 16.10.
- **`metadata` propagada**: o `discoveryId` enviado no `POST /v1/charges`
  apareceu depois em `subscription.metadata`, inalterado, do início ao fim
  do ciclo (criação → pagamento simulado).

### Simulador oficial — executado uma vez

```
POST /v1/wallet/pay/:chargeId
scope: wallet/write
sem body
```

**Resposta imediata:**

```json
{
  "chargeId": "SANDBOX_cha_1786386101742_e99sbfpxw",
  "status": "PROCESSING",
  "message": "Evento enviado para processamento"
}
```

**O simulador é assíncrono** — não devolve `PAID` na hora, só confirma que
entrou numa fila. A confirmação real só apareceu num `GET` alguns segundos
depois. **Implicação para F3b:** a resposta do simulador (e, por extensão,
do pagamento real) não pode ser tratada como confirmação — é preciso
webhook ou polling.

### Efeito observado (antes → depois)

| Campo                                 | Antes      | Depois                                                |
| ------------------------------------- | ---------- | ----------------------------------------------------- |
| `charge.status`                       | `PENDING`  | **`PAID`**                                            |
| `paidAt`                              | `null`     | preenchido (timestamp real do pagamento simulado)     |
| `paidAmount`                          | —          | `29.9`                                                |
| `paymentId` (End-to-End ID Pix)       | —          | preenchido                                            |
| `subscription.status`                 | `PENDING`  | **`ACTIVE`**                                          |
| `subscriptionId`                      | —          | **inalterado** — mesma assinatura, só mudou de estado |
| `activatedAt`                         | `null`     | preenchido                                            |
| `currentCycleNumber`                  | `1`        | `1` (inalterado)                                      |
| `nextCycleNumber`                     | `null`     | `2`                                                   |
| `nextCycleAmount`                     | `null`     | `29.9`                                                |
| `nextCycleChargeDate`                 | —          | próximo mês, calculado automaticamente                |
| `lastCharge.status` (na subscription) | —          | `PAID`                                                |
| `metadata.discoveryId`                | preservado | **preservado, inalterado**                            |
| `customer.ltv`                        | `0`        | `29.9`                                                |

### Webhook — lacuna confirmada, não fechada

- Request bin seguiu **sem nenhuma entrega real da ValidaPay** após o
  pagamento simulado — consistente com **nenhum webhook cadastrado** na
  conta sandbox nova (confirmado pelo usuário direto no painel).
- O objeto do `charge`, pós-pagamento, passou a trazer um `log[]` com uma
  entrada `{ entity: "pix-payment-in", webhookId: "..." }`. **Isso NÃO prova
  entrega externa** — é, no máximo, evidência de que a ValidaPay gera o
  evento internamente independente de haver um destino configurado.
- **`idempotencyKey` de webhook (`PaymentProviderEvent.idempotencyKey`)
  continua em aberto** — sem payload real de webhook, a fórmula não pode ser
  fechada (ver proposta de estratégia segura na próxima seção do documento
  de arquitetura F3a/F3b, fora deste arquivo de status).

### Estado final da F3-DISCOVERY

- `Plan.validapayPriceMonthlyId`/`validapayPriceYearlyId`: **não
  atualizados**.
- PostgreSQL: **intocado**.
- **Nenhuma migration** criada.
- F3a/F3b: **continuam não implementadas** — próxima etapa é avaliar a
  proposta de arquitetura, não o código.

### 16.15 F3-3C3 — webhook real em produção, ponta a ponta (14/08/2026)

**F3 encerrada tecnicamente para sandbox/MVP.** Fluxo completo comprovado com
dado real, não simulado:

- Webhook real da ValidaPay **chegou** na Vercel de produção
  (`POST /api/webhooks/validapay`).
- Assinatura **HMAC aceita** — os eventos foram persistidos, o que só
  acontece depois da verificação passar (assinatura inválida recusa antes de
  qualquer gravação).
- `PaymentProviderEvent` **persistiu** os eventos reais, com `payloadHash`
  presente e `rawBody` nunca gravado (a tabela não tem coluna para isso).
- A migration de produção estava **atrasada em 1 de 9** (faltava
  `20260807205953_validapay_integration`, a que cria `SubscriptionCheckout`
  e `PaymentProviderEvent`) — aplicada via `prisma migrate deploy` pelo
  mecanismo já documentado do projeto. Hoje: **9/9**.
- As credenciais `VALIDAPAY_CLIENT_ID`/`VALIDAPAY_CLIENT_SECRET`/
  `VALIDAPAY_SCOPE` foram adicionadas à Vercel — antes só
  `VALIDAPAY_WEBHOOK_SECRET` estava configurado, o que bloqueava a etapa de
  confirmação (a correlação/`GET /v1/charges` precisa autenticar de volta na
  ValidaPay).
- **3 eventos `PENDING` de um ciclo anterior** (`charge.created`,
  `payment.success`, `subscription.activated`, todos do mesmo `chargeId`
  sintético) ficaram presos na janela em que a Vercel ainda não tinha as
  três credenciais acima. **Decisão: não reprocessar.** São artefatos de
  teste sintético, sem mecanismo de reprocessamento sem nova entrega (o
  `rawBody` não é persistido, de propósito), e sem impacto — nenhuma
  `Company` real foi ou seria alterada por eles.
- **Nenhuma `Company` real foi alterada** em nenhum momento desta fase.
- **Política de retentativa/reentrega da ValidaPay continua não
  documentada** — e agora também **não observada na prática**: os 3 eventos
  acima receberam `500` (tabela ausente) e a ValidaPay não os reenviou
  depois que o schema foi corrigido. Tratar toda entrega como
  potencialmente única, nunca garantida.

---

## 17. Proibições vigentes

- ❌ Não iniciar **F3**
- ❌ Não criar produtos/preços na ValidaPay
- ❌ Não criar checkout
- ❌ Não implementar webhook
- ❌ **Não rodar `npm test` apontando para `fluxy_dev`** — a suíte usa
  `TEST_DATABASE_URL` e só pode tocar `fluxy_test`
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

## 18. Prompt de retomada

Cole o texto abaixo numa conversa nova:

```
Leia docs/STATUS-VALIDAPAY.md no repositório Fluxy.

A MIGRAÇÃO LOCAL PARA POSTGRESQL 18 ESTÁ FINALIZADA (seção 15). O
desenvolvimento roda em localhost:5432/fluxy_dev com a role `fluxy`; os
testes em fluxy_test via TEST_DATABASE_URL. O `prisma dev` está
aposentado e NÃO deve ser iniciado.

Estado: 579 linhas migradas e equivalentes ao backup, 9 migrations,
628/628 testes, type-check, lint e build limpos, aplicação sobe e serve
o catálogo migrado.

F3 (checkout ValidaPay) está ENCERRADA TECNICAMENTE para sandbox/MVP —
webhook real validado em produção, ponta a ponta (seção 16.15). Falta só
a etapa comercial: produtos/preços definitivos e habilitar pagamento real,
quando eu autorizar. Respeite integralmente as proibições da seção 17.

Não faça commit sem minha autorização.
```

---

## Dívidas técnicas registradas

- Colunas `asaas*` em `Company` — remover em migration própria, após verificar produção.
- Fórmula da `idempotencyKey` — fechar na fase de webhook, com payloads reais.
- `callbackUrl` é escrito pelo middleware e **não consumido** por ninguém. Corrigir exige lista de permissão de destinos.
- Rotas sob `/dashboard` ficam no fallback de `loading.tsx` no navegador embutido usado nas verificações; reproduz em rotas não tocadas, dev e produção. Conferir num navegador comum.
- **Teardown de `VerificationToken` nos testes.** Os testes que exercitam cadastro
  e verificação de e-mail criam 28 tokens e não os removem. Hoje o `globalSetup`
  limpa `fluxy_test` antes de cada execução, então a suíte é reexecutável e nada
  vaza para `fluxy_dev` — mas isso trata o sintoma. Corrigir na raiz deixaria a
  limpeza como rede de segurança em vez de necessidade.
- **Collation `Portuguese_Brazil.1252`** em `fluxy_dev`, `fluxy_shadow` e
  `fluxy_test`, herdado do `template1` do Windows. Não afeta o dado, só ordenação
  e índices. Revisar contra o collation de produção.

## Pontos não documentados pela ValidaPay

O webhook tem autenticação por **token compartilhado no header `Authorization`** (configurável no painel, campo "Token de Autenticação"). É segredo portador, **não assinatura HMAC** — autentica o remetente, não a mensagem. Por isso a confirmação via `GET /v1/charges/:chargeId` antes de ativar o Pro continua necessária.

Seguem **NÃO DOCUMENTADOS**: identificador único de evento, política de retentativas, proteção contra replay, ordem de entrega, endpoint de estorno/reembolso.

Eventos conhecidos: `payment.success`, `payment.failed`, `subscription.created`, `subscription.activated`, `subscription.canceled`, `subscription.renewed`, `subscription.trial`. Apenas `payment.success` tem payload documentado.
