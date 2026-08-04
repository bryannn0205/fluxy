# 📊 Estado Real do Fluxy

**Última verificação:** 03/08/2026
**Como foi verificado:** lendo o código, rodando `tsc`/`eslint`/`vitest`/`build` e exercitando os fluxos em navegador real (incluindo teste de isolamento entre duas empresas distintas).

> ⚠️ **Leia antes de planejar qualquer coisa.**
> Este arquivo substitui três documentos anteriores (`SAAS_COMPLETENESS_ANALYSIS.md`,
> `FEATURE_SPECIFICATIONS.md`, `QUICK_START.md`) que foram gerados **sem ler o
> repositório**. Eles listavam como "faltando" praticamente tudo que já estava
> pronto e propunham uma arquitetura conflitante (`Client` em vez de `Customer`,
> status `DRAFT`, rotas REST em vez de Server Actions). Seguir aqueles documentos
> levaria a recriar models existentes e **destruir dados reais**.
>
> Se este arquivo divergir do código, **o código é a verdade** — corrija este
> arquivo, nunca o contrário.

---

## ✅ Implementado e verificado

**Números:** 19 páginas · 3 rotas de API · 15 models · 9 enums · 5 migrations · 11 services · 11 repositories · 174 testes (18 arquivos, todos passando)

### Autenticação e conta
- Login por e-mail/senha (Argon2) e Google OAuth
- Cadastro de empresa + usuário OWNER, com trial de 14 dias
- Recuperação de senha e verificação de e-mail (tokens de uso único)
- Rate limiting em login, cadastro, recuperação de senha, convite e aceite de convite

### Multi-tenant
- `companyId` em todas as tabelas de negócio; toda query filtra por ele
- `companyId` sempre vem da sessão (`requireCompany()`), nunca do input
- Soft delete (`deletedAt`) em todos os registros de negócio
- Testes de integração de isolamento rodando contra Postgres real

### Pedidos — CRUD completo
- Criar (diálogo com cliente, múltiplos itens, desconto e **total calculado ao vivo**)
- Listar com busca (número/cliente), filtro por status e paginação
- Página de detalhe: itens, totais, cliente, prioridade, previsão de entrega, forma de pagamento
- Alterar status respeitando a máquina de transições
- Excluir (soft delete)
- Anexos (Cloudflare R2) com verificação de assinatura binária do arquivo
- Linha do tempo derivada do `AuditLog` (quem fez o quê, quando)

### Produção
- Board Kanban com drag-and-drop (mouse **e** teclado, com anúncios para leitor de tela)
- Colunas: Recebido → Em produção → Pronto → Entregue
- Atualização otimista com rollback em caso de erro

### Clientes
- CRUD completo
- Página de detalhe com CRM: total gasto, nº de pedidos, ticket médio, produto favorito, histórico

### Produtos
- CRUD completo, com custo e margem calculada
- Página de detalhe com histórico de movimentações de estoque

### Estoque
- Ledger append-only (`StockMovement`) — `Product.stockQuantity` é cache reconstruível
- Débito automático ao criar pedido; devolução ao cancelar/excluir (sem duplicar)
- Ajuste manual (reposição/correção) com motivo e observação
- Alertas de estoque baixo no Painel e na página de Estoque

### Permissões (RBAC)
- Seis papéis: `OWNER` / `ADMIN` / `MANAGER` / `OPERATOR` / `FINANCE` / `VIEWER`
- Matriz declarativa única em `lib/permissions.ts` — `can()` para renderizar,
  `assertPermission()` para barrar (ForbiddenError, 403)
- O portão é o service; a interface esconde como complemento, nunca como proteção
- **Campos financeiros são removidos do payload**, não escondidos por CSS:
  VIEWER não recebe preço unitário, subtotal, desconto, total nem forma de
  pagamento; OPERATOR e VIEWER não recebem custo nem margem
- Exportação de CSV barrada na rota, antes de qualquer consulta

### Equipe
- Papéis geridos só por `OWNER` / `ADMIN`
- Convite por e-mail com token e validade de 7 dias (reenvio renova, não duplica)
- Página pública de aceite, criando a conta e autenticando na sequência
- Alterar papel e remover membro, com as travas: ninguém altera o próprio papel,
  só OWNER concede/revoga posse, e a empresa nunca fica sem nenhum OWNER

### Relatórios (`/dashboard/reports`)
- Filtro de período: 7 / 30 / 90 / 365 dias, por query string (URL compartilhável, sem JS)
- Totais do período: faturamento, nº de pedidos e ticket médio
- Gráfico de faturamento por dia, com balão no hover, navegação por setas do teclado
  e uma tabela equivalente em `<details>` para quem não usa o gráfico
- Rankings dos 5 produtos mais vendidos e dos 5 clientes que mais compraram
- Pedidos cancelados e soft-deleted ficam fora de todos os agregados

### Exportação em CSV (`GET /api/orders/export`)
- Botão "Exportar CSV" no cabeçalho da página de Pedidos
- Leva os filtros ativos da tela (busca e status), para a planilha bater com o que se vê
- Colunas: número, data, cliente, documento, status, prioridade, forma de pagamento,
  previsão de entrega, nº de itens, subtotal, desconto, total e observações
- Formatado para o Excel pt-BR: separador `;`, decimal com vírgula, BOM UTF-8 e data sem
  a vírgula que o `Intl` insere (senão a coluna entra como texto e não ordena como data)
- Protegido contra injeção de fórmula (ver decisões abaixo)

### Notificações in-app
- Sino no cabeçalho, com contagem de não lidas e painel dos 15 eventos mais recentes
- Eventos cobertos: pedido criado, pedido excluído, e mudança de status para
  Pronto / Entregue / Cancelado (passar por "Em produção" não notifica)
- Quem causou o evento não é notificado — numa empresa de uma pessoa só, a caixa
  fica vazia por construção
- Marcar uma como lida ou todas de uma vez; o estado de leitura é por usuário
- Membro removido da equipe (soft delete) para de receber

### Financeiro dos pedidos
- Ledger append-only (`Payment`): recebimentos e estornos, nunca UPDATE nem DELETE
- `Order.paidAmount` e `Order.paymentStatus` são caches reconstruíveis, escritos
  só pelo `FinanceService` e pelo cancelamento transacional
- Pagamento parcial, total, vários lançamentos e métodos diferentes no mesmo pedido
- Estorno com justificativa obrigatória; estorno parcial devolve o pedido a PARTIAL
- Taxa de entrega e acréscimo no pedido, com o total formado em `lib/order-totals.ts`
- Vencimento (`dueDate`) e **atraso derivado** por `isOrderOverdue`, nunca gravado
- Contas a receber em `/dashboard/finance/receivables`
- Cancelar pedido com valor recebido é bloqueado; exige estorno antes

### Limites de plano
- Quatro tetos em `Plan`: `maxUsers`, `maxOrdersPerMonth`, `maxProducts`, `maxCustomers`
- `null` = ilimitado · `0` = bloqueado · positivo = teto
- `PlanLimitService` é o único ponto que decide; `lib/plan-limits.ts` guarda a tabela
- Cota de pedidos conferida **dentro** da transação de criação, sob o lock que já
  gera o número do pedido — nenhuma janela para duas criações furarem o teto
- Convite válido reserva vaga; aceitar troca reserva por usuário, sem somar
- Negação é `PlanLimitReachedError` (402, code `PLAN_LIMIT_REACHED`), com recurso,
  uso, limite, plano e caminho de upgrade

### Painel e configurações
- KPIs (faturamento do mês, pedidos por etapa), alertas de atraso e de estoque baixo, pedidos recentes
- Configurações de perfil, empresa e status da assinatura

---

## ❌ Genuinamente não implementado

| Item | Observação |
|---|---|
| **Cobrança** | As env vars `ASAAS_*` existem em `lib/env.ts` e as colunas `asaasCustomerId`/`asaasSubscriptionId` existem em `Company`, mas **não há nenhum código de cobrança**. O provedor escolhido é a ValidaPay — ver decisões abaixo |
| **Valores comerciais dos planos** | As colunas de limite existem e são aplicadas, mas nascem `null` (ilimitado). Preenchê-las em `standard` e `pro` é um passo comercial separado, ainda não executado |
| **Limite de anexos** | Fora de escopo até a fase de consistência com o R2 — ver abaixo |
| **Cobrança da assinatura** | As permissões `subscription:manage` existem na matriz e têm teste, mas não há código de cobrança para elas guardarem |
| **Fluxo de caixa, despesas, conciliação** | Não existem. O financeiro cobre contas a receber dos pedidos, não a tesouraria da empresa |
| **Webhooks** | Não existe `app/api/webhooks/` |
| **Impressão / PDF** | Sem geração de PDF (nenhuma lib instalada). CSV **já existe** — ver acima |
| **Categorias de produto** | Não existe model `Category` |
| **Fornecedores** | Não existe model `Supplier` |
| **Financeiro (a pagar/receber)** | Não existe |
| **API REST pública** | Só existem Server Actions + a rota de upload de anexos. Uma API REST só se justifica quando houver consumidor externo real |

---

## 🧭 Decisões arquiteturais já tomadas

Registradas aqui porque contrariam suposições comuns — **não as "corrija" sem motivo concreto**:

### Confirmadas pelo dono do produto em 03/08/2026

Estas cinco foram decididas explicitamente depois de uma auditoria do repositório.
Não são preferências herdadas nem acidentes de implementação:

- **Sem Supabase.** O banco é PostgreSQL via Prisma e a autenticação é Auth.js v5.
  Não instalar `@supabase/*`, não criar client, não criar RLS, não substituir o
  Auth.js. O isolamento entre empresas continua na camada de aplicação, reforçado
  por `requireCompany()`, filtros obrigatórios de `companyId` e testes com duas
  empresas reais. A conta Supabase existe mas não será usada.
- **O provedor de pagamento é a ValidaPay, não o Asaas.** Os nomes `ASAAS_*` em
  `lib/env.ts` e as colunas `asaasCustomerId`/`asaasSubscriptionId` são resquício
  preparatório e serão renomeados para nomes **neutros de provedor**
  (`paymentProvider`, `paymentCustomerId`, `paymentSubscriptionId`, `paymentPlanId`)
  na fase de pagamentos, por migration apresentada antes de rodar. Nenhum endpoint,
  evento ou payload da ValidaPay pode ser escrito antes da documentação oficial.
- **Um usuário pertence a exatamente uma empresa** no MVP. `User.companyId` é
  obrigatório e `User.email` é globalmente único. Não criar tabela de associação,
  não fazer seletor de empresa, não mexer em autenticação ou sessão por causa disso.
  Uma empresa continua podendo ter vários usuários. Multi-empresa por usuário é
  evolução futura, planejada por último justamente por tocar login e toda query.
- **Seis papéis**, implementados de forma incremental: `OWNER`, `ADMIN`, `MANAGER`,
  `OPERATOR`, `FINANCE`, `VIEWER`. `PRODUCTION` fica para quando a produção for
  ampliada. Permissão se valida no service, nunca escondendo botão.
- **A redação de campos financeiros é por omissão de chave, não por valor nulo.**
  `redactOrderFinancials` e `toClientProduct` descartam as chaves por
  desestruturação, então elas não existem no objeto serializado. Passar `null`
  no lugar manteria o formato mas confundiria "sem permissão" com "sem valor" —
  e `costPrice` nulo já significa "produto sem custo cadastrado". As variáveis
  `_descartadas` que aparecem nesses arquivos existem para isso; o eslint está
  configurado para aceitar o prefixo `_`.
- **`ClientProduct` não tem `costPrice`; `ClientProductWithCosts` tem.** São dois
  tipos em vez de um campo opcional, para o compilador cobrar a escolha em cada
  ponto de uso em vez de deixar passar por esquecimento.
- **Cinco status de pedido** por enquanto (`PENDING → PROCESSING → READY →
  COMPLETED`, mais `CANCELLED`). A ampliação para dez exige proposta própria
  mostrando impacto em schema, máquina de estados, Kanban, filtros, notificações,
  CSV, relatórios, testes e dados existentes.


- **`Customer`, não `Client`.** O model se chama `Customer` em todo o código.
- **Status do pedido:** `PENDING → PROCESSING → READY → COMPLETED`, mais `CANCELLED`.
  Não existe `DRAFT` — um pedido já nasce como compromisso de venda (é o que dispara o débito de estoque).
- **`orderNumber`:** sequencial por empresa com 4 dígitos (`0001`), gerado por contador atômico
  (`Company.nextOrderNumber`) dentro da transação de criação. É à prova de corrida e sem buracos.
  O formato `YYYY-MM-#####` proposto nos docs antigos exigiria um `SELECT` do último número,
  o que abre condição de corrida sob concorrência.
- **IDs são `cuid()`, não UUID.** Nada de `@db.Uuid`.
- **Mutações via Server Actions**, não rotas REST. A única rota de API de negócio é o upload
  de anexos, porque precisa de `multipart/form-data`.
- **Schemas Zod em `schemas/*.schema.ts`**, não num `lib/schemas.ts` único.
- **Rotas em `app/dashboard/`**, não `app/(dashboard)/`.
- **Preço do item nunca vem do frontend.** É sempre resolvido a partir do `Product` no servidor,
  para impedir manipulação de preço via requisição forjada.
- **A sessão é resolvida contra o banco a cada request** (`lib/session-resolver.ts`), não lida
  do JWT. O token guarda `companyId` e `role` no login e vale 7 dias — confiar nele faria com
  que remover alguém da equipe ou rebaixar seu papel só tivesse efeito na expiração do token.
  O custo é uma query por request; a alternativa é acesso revogado que continua funcionando.
- **O pool do banco tem teto de 3 conexões** (`lib/db.ts`). Não é chute: com o padrão do pg
  (10), o Painel — que dispara ~7 queries simultâneas, só `getStats` faz 5 — abria mais
  conexões do que o servidor aceita, e as excedentes eram fechadas do outro lado, derrubando
  a página com P1017. Medido: 16 falhas em 20 navegações com o padrão, zero em 40 com o teto.
  **Aumentar esse número traz o bug de volta.**
- **Os gráficos são SVG escrito à mão, sem biblioteca.** Não é teimosia: são três formas
  (uma linha e dois rankings de barra), e `recharts` custaria ~500 kB para desenhá-las. Como
  está, os rankings são Server Components que não mandam nenhum JavaScript, e a rota inteira
  fecha em 2,85 kB / 109 kB de First Load. Se um dia entrarem formas de verdade variadas
  (dispersão, heatmap, eixo duplo), aí a biblioteca passa a valer.
- **Uma única query em SQL cru** (`PrismaReportRepository.getRevenueByDay`). O Prisma não
  trunca data dentro de `groupBy`; a alternativa seria carregar todos os pedidos do período
  para agrupar em JS — dezenas de milhares de linhas para produzir 365 números. Os valores
  vão como parâmetros do statement pela template tag do Prisma, não por concatenação.
- **Os dias sem venda são preenchidos com zero no Service.** Sem isso, o gráfico de linha
  ligaria os dois dias vizinhos numa reta e desenharia faturamento que não existiu.
- **`--chart-1..5` não são usados nos gráficos.** O bloco `.dark` de `app/globals.css` repete
  os mesmos valores do `:root`, então `--chart-5` (L=0.269) cairia sobre um card dark
  (L=0.205) e ficaria invisível. Os gráficos usam `--primary`, que inverte corretamente entre
  os modos. Os tokens `--chart-*` continuam quebrados para quem os usar — ver pendência abaixo.
- **Toda célula de CSV que comece com `= + - @` recebe um apóstrofo antes** (`lib/csv.ts`).
  Excel e Sheets avaliam essas células como fórmula, e o nome do cliente vem do usuário:
  um cadastro chamado `=HYPERLINK(...)` viraria código na máquina de quem abre a planilha.
  Escapar aspas não resolve — o problema não está no parser de CSV, e sim no que a planilha
  faz com a célula depois. Números negativos são exceção, senão virariam texto e o Excel
  pararia de somar a coluna.
- **A exportação é Route Handler, não Server Action.** O download depende de
  `Content-Type` e `Content-Disposition`, que uma Server Action não controla — mesma razão
  da rota de anexos.
- **O CSV é gerado em streaming, com cursor** (`streamForExport` + `streamOrdersCsv`).
  Materializar a planilha inteira antes de responder seguraria o histórico completo da
  empresa em memória. O `orderBy` desempata por `id` além de `createdAt`: sem isso, dois
  pedidos no mesmo instante fariam o cursor pular ou repetir linhas na virada do lote —
  há teste de integração com `EXPORT_BATCH_SIZE + 1` pedidos de `createdAt` idêntico.
- **`list` e `streamForExport` compartilham `buildOrderFilter`.** Se cada um montasse o
  `where` por conta própria, um filtro novo entraria em um e não no outro, e a planilha
  divergiria da tela sem ninguém perceber.
- **Notificação guarda evento, nunca condição.** "Estoque baixo" e "pedido atrasado" são
  estado corrente e continuam derivados por query no Painel. Gravá-los como linha exigiria
  apagar a notificação quando a condição cessasse (repor o estoque não deve deixar o aviso
  para trás) e reexecutar a checagem duplicaria o aviso. Só entram fatos com hora marcada.
- **Uma linha por destinatário**, para o "lido" ser individual. A alternativa — uma linha e
  uma tabela de leituras — economiza espaço mas cobra um join em toda listagem; para o
  tamanho de equipe deste produto, o fan-out na escrita é o lado certo.
- **Um único `ORDER_STATUS_CHANGED`**, com o status novo dentro de `data`, em vez de um
  valor de enum por status: acrescentar uma etapa ao fluxo do pedido não deve exigir
  migration.
- **O texto é resolvido na leitura, a partir do tipo** (`describeNotification`), não gravado.
  Corrigir uma frase não exige migrar linhas, e o mesmo evento nunca aparece escrito de dois
  jeitos por ter sido gravado em versões diferentes. O que vai no banco é só o snapshot
  mínimo (número do pedido, nome do cliente) — ler das relações mostraria o estado de hoje
  num registro do que aconteceu ontem.
- **Falha ao notificar não derruba a mutação que a disparou.** O erro é registrado e
  engolido: ninguém pode perder a mudança de status do pedido porque o fan-out falhou.
- **Linha com `data` em formato desconhecido não é descartada**, e sim exibida com texto
  genérico. Sumir com ela faria o badge — que conta linhas sem abrir o JSON — divergir da
  lista. O `orderId` é coluna própria, então o link continua funcionando.
- **`markRead` usa `updateMany` com filtro composto**, não `update` por id: `update`
  lançaria ao topar com linha de outro usuário, e o erro em si já revelaria que aquele id
  existe.
- **⚠️ O Prisma NÃO envolve migrations em transação.** Medido em 03/08/2026 com uma
  migration-sonda de dois comandos, o segundo inválido: o primeiro persistiu e a
  migration ficou marcada como falha. **Toda migration nova deve abrir com `BEGIN;`
  e fechar com `COMMIT;`.** A migration `20260803172812_role_expansion` traz um
  comentário afirmando o contrário — ele está errado, e o arquivo não pode ser
  corrigido porque o Prisma guarda checksum das migrations aplicadas. Aquela rodou
  inteira, então não houve dano.
- **Os CHECK constraints não existem no schema Prisma**, só nos arquivos de
  migration (`Payment.amount > 0`, `deliveryFee/surcharge/paidAmount >= 0`). Um
  `migrate reset` os recria pelo histórico; um `db push` a partir do schema, não.
  **Não use `db push` neste projeto.**
- **O ledger financeiro usa `RESTRICT` nos dois sentidos** (`onDelete` e `onUpdate`),
  diferente de todo o resto do schema, que cascateia a partir de Company. O ledger
  não some com exclusão física acidental nem acompanha troca de tenant. Consequência
  prática: **os `afterAll` dos testes precisam apagar `Payment` antes** de order,
  user e company, e uma empresa com pagamentos não pode ser excluída fisicamente.
- **`Payment` referencia `Order` e `User` por chave composta com `companyId`**
  (`@@unique([id, companyId])` nos dois). Pagamento apontar para pedido de outra
  empresa é impossibilidade estrutural, recusada pelo Postgres — não validação de
  código que alguém pode esquecer de chamar.
- **Concorrência no lançamento é bloqueio pessimista** (`SELECT ... FOR UPDATE` no
  pedido, dentro da transação), não isolamento Serializable. Serializable abortaria
  a transação perdedora e exigiria laço de retry em toda operação financeira — e
  retry em código que move dinheiro é onde nasce pagamento duplicado. É a segunda
  query crua do projeto, depois de `getRevenueByDay`.
- **Idempotência compara campos, não hash.** `(companyId, idempotencyKey)` é único;
  mesma chave com mesmos dados devolve o lançamento existente, mesma chave com dados
  diferentes lança `ConflictError` (409) e registra no logger. Um `requestHash`
  exigiria serialização canônica de Decimal e Date, que é justamente onde nascem
  falsos conflitos.
- **`Order.paymentMethod` é a forma COMBINADA, não prova de recebimento.** O método
  de cada entrada de dinheiro vive em `Payment.method` — um pedido combinado em
  boleto pode ser pago metade no PIX. Relatório de recebimento usa `Payment.method`.
- **Tentativa bloqueada vai para o logger, não para o AuditLog.** O AuditLog descreve
  o que aconteceu com os dados; um cancelamento recusado não mudou nada. Gravar
  não-eventos faria "o que aconteceu com este pedido" virar ruído.
- **`requireCompany()` redireciona ao login; `requireCompanyForApi()` lança 401.** São dois
  wrappers do mesmo resolvedor porque Route Handler devolve JSON — redirecionar para HTML ali
  quebraria o cliente. O middleware precisa deixar passar `/login?session=expired`, senão
  devolve a pessoa ao dashboard (o JWT ainda é válido) e cria laço infinito.

---

## 🐞 Problemas conhecidos

### Em aberto — os tokens `--chart-*` não têm variante dark

`app/globals.css` declara `--chart-1` a `--chart-5` no `:root` e repete **os mesmos cinco
valores** dentro de `.dark`. Como são tons de cinza (croma zero), `--chart-5`
(`oklch(0.269 0 0)`) sobre o `--card` do modo dark (`oklch(0.205 0 0)`) fica praticamente
invisível — e `--chart-1` (`oklch(0.87 0 0)`) tem o problema espelhado no modo claro.

Não afeta nada hoje: o dark mode não está ligado (não existe `ThemeProvider`; só
`components/ui/sonner.tsx` importa `useTheme`) e a página de Relatórios usa `--primary`,
que inverte corretamente. Vira bug visível no dia em que alguém ligar o tema escuro **ou**
usar `--chart-*` num componente novo.

### Resolvido — o aviso de hidratação em `/dashboard/settings` não é um bug do Fluxy

Estava registrado aqui como problema em aberto, com a suspeita de que o `caret-color:
transparent` viesse do componente `Input` do Base UI. **A suspeita estava errada.** Medido em
02/08/2026:

| Verificação | Resultado |
|---|---|
| `grep -rn "caretColor\|caret-color" node_modules/@base-ui/` | zero ocorrências — o Base UI 1.6.0 nunca escreve essa propriedade |
| Carga SSR real de `/dashboard/settings` em navegador limpo | zero avisos de hidratação no console |
| `style` inline nos 4 inputs da página | nenhum input tem atributo `style` |
| `getComputedStyle(input).caretColor` | `oklch(0.145 0 0)` (cor de texto normal), não `transparent` |

A origem é uma **extensão do navegador** — gerenciadores de senha e preenchedores de formulário
injetam `caret-color: transparent` para esconder o cursor nativo enquanto sobrepõem a interface
deles. Isso acontece depois do HTML do servidor chegar, que é exatamente o que o React reporta
como divergência de hidratação.

**Não corrija isto no código.** Um `suppressHydrationWarning` nesses inputs silenciaria
divergências reais e futuras no mesmo lugar, para esconder um sintoma que só existe na máquina
de quem tem a extensão instalada. Para confirmar que o aviso é externo, abra a página numa
janela anônima com extensões desativadas.

---

## 🚧 Pendências operacionais

Nenhuma delas é bug de código — são coisas do ambiente e da preparação para
produção que ficaram registradas para não se perderem.

### Backup do banco

- **O dump JSON local não substitui backup nativo do PostgreSQL.** O que existe
  hoje é um export de linhas por tabela, gerado por script antes de migrations
  arriscadas. Ele não guarda sequences, tipos, índices, permissões nem o estado
  do `_prisma_migrations` de forma restaurável — serve para conferir dados, não
  para reconstruir o banco.
- **Antes da produção:** configurar backup nativo (`pg_dump`/`pg_basebackup` ou o
  backup gerenciado do provedor) **e testar a restauração**. Backup que nunca foi
  restaurado é hipótese, não backup. O `pg_dump` não está instalado nesta máquina.

### Migrations

- **Não usar `db push` neste projeto.** Os CHECK constraints (`Payment.amount > 0`,
  `deliveryFee`/`surcharge`/`paidAmount >= 0`) vivem apenas nos arquivos de
  migration, porque o Prisma não os declara no schema. Um `db push` a partir do
  schema recriaria o banco sem eles, e a última linha de defesa do financeiro
  sumiria em silêncio.

### Ambiente local (`prisma dev`)

- **O daemon cai de forma reprodutível sob carga de teste** — cinco ocorrências em
  03/08/2026, sempre com `P1017 ConnectionClosed` ou `ECONNRESET`, e sempre com o
  processo se reportando como "running" e a porta ainda escutando. Reiniciar
  resolve. É PGlite (Postgres em WASM), o que ajuda a explicar a fragilidade sob
  concorrência. **Investigar separadamente** — não é defeito do Fluxy, mas
  atrapalha toda verificação.
- Sintoma associado: sobra um `server.lock.lock` órfão em
  `%LOCALAPPDATA%\prisma-dev-nodejs\Data\durable-streams\default\`, que impede o
  daemon de subir de novo até ser removido.
- **`durable-streams.sqlite` cresceu para ~1,9 GB** (mais ~655 MB no servidor
  `fluxy`, já removido). É o que encheu o disco em 03/08/2026. **Investigar sem
  apagar de forma destrutiva** — o arquivo pode conter estado do WAL necessário
  ao servidor; truncá-lo às cegas pode inutilizar o banco local.

## 🔭 Fase futura: limites e consistência de anexos com R2

Ficou **deliberadamente fora** da fase de limites, porque envolve consistência
entre dois sistemas que não compartilham transação: PostgreSQL e Cloudflare R2.

O fluxo atual sobe o arquivo ao R2 **antes** de gravar a linha
(`app/api/orders/[id]/attachments/route.ts`), então uma falha na gravação deixa
arquivo órfão — invisível e custando armazenamento para sempre.

**A inversão simples foi avaliada e recusada:** gravar antes e subir depois só
troca o órfão invisível por uma linha apontando para arquivo inexistente, que
quebra o download. Uma inconsistência pela outra.

O desenho a avaliar quando a fase chegar:

- estado no anexo (`PENDING` / `READY` / `FAILED`)
- reservar linha e vaga como `PENDING`, sob lock, dentro da transação
- subir ao R2, marcar `READY`
- em falha, marcar `FAILED` ou remover a reserva
- listar e permitir download **apenas** de `READY`
- rotina de conciliação para estados antigos presos em `PENDING`
- proteção de concorrência na última vaga

Só então `maxAttachmentsPerOrder` entra no `Plan`. Criar a coluna antes seria
abrir espaço para um teto que ninguém aplica.

## 🔍 Como verificar o estado por conta própria

Não confie neste arquivo sem checar. Os comandos abaixo levam menos de dois minutos:

```bash
npx tsc --noEmit      # tipos
npx eslint .          # lint
npx vitest run        # testes (unitários + integração contra Postgres real)
npm run build         # build de produção

find app -name "page.tsx"        # páginas que existem de fato
grep "^model " prisma/schema.prisma   # models que existem de fato
ls services/                     # regras de negócio que existem de fato
```

Para saber **como** implementar algo, use a documentação real do projeto — ela está correta
e é mantida junto do código:

- [CLAUDE.md](../../../CLAUDE.md) — regras invioláveis
- [Multi-tenant](../architecture/multi-tenant.md) — isolamento entre empresas
- [Padrões](../architecture/patterns.md) — Repository, Service, DTO
- [Segurança](../features/security.md) · [Testes](../development/testing.md)
