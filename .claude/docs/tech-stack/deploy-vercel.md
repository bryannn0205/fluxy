# 🚀 Deploy na Vercel

**Última verificação:** 03/08/2026 — conferido contra o código, não contra suposição.

> Este documento descreve o deploy **como o projeto está hoje**. Onde algo ainda
> não existe, está marcado como pendente em vez de descrito como se existisse.

---

## Por que não existe `vercel.json`

A Vercel detecta Next.js sozinha. Um `vercel.json` só passa a ser necessário
quando há algo que a detecção não cobre — e hoje não há:

| Motivo comum para criar o arquivo | Situação no Fluxy |
| --- | --- |
| Headers customizados | Já estão em `next.config.ts` (`headers()`), que a Vercel aplica nativamente |
| Redirects / rewrites | Não existem |
| `crons` | Não existe nenhuma tarefa agendada |
| `regions` / `memory` / `maxDuration` | Nenhuma rota declara `runtime`, `preferredRegion` ou `maxDuration` |
| Build ou install command customizado | Já vive em `package.json` (`"build": "prisma generate && next build"`) |

**Criar o arquivo sem um desses motivos adiciona configuração que ninguém mantém.**

### Quando ele passará a fazer falta

- **Exportação de CSV crescer.** `GET /api/orders/export` transmite em streaming com
  cursor, então não estoura memória — mas estoura *tempo*. O teto padrão de execução
  de função na Vercel é de segundos; uma empresa com histórico grande vai bater nele.
  Aí entra `maxDuration` (na rota ou no `vercel.json`). Sintoma: o download corta no
  meio, sem erro na aplicação.
- **Entrar tarefa agendada** (cobrar assinatura vencida, alertar trial acabando).
- **Fixar região** perto do banco, para reduzir latência por query.

---

## Configuração do projeto na Vercel

| Campo | Valor |
| --- | --- |
| Framework Preset | Next.js (detectado) |
| Root Directory | `./` — o `package.json` está na raiz do repositório |
| Build Command | `npm run build` (= `prisma generate && next build`) |
| Install Command | `npm install` (padrão) |
| Output Directory | detectado — não sobrescrever |
| Node.js Version | 20.x ou superior |

### `prisma generate` no build não é opcional

`lib/generated/prisma` está no `.gitignore` — o client do Prisma **não vai no
repositório** e é gerado a cada build. Se o build command for reduzido a
`next build`, o deploy falha com erro de módulo não encontrado.

---

## Runtime

**Node.js, não Edge.** A aplicação depende de:

- `@node-rs/argon2` — binário nativo, não roda em Edge
- `@prisma/adapter-pg` + `pg` — socket TCP, não roda em Edge

O **middleware** é a exceção: ele roda em Edge por imposição da plataforma, e por
isso `lib/auth.config.ts` é separado de `lib/auth.ts` — a config do middleware não
importa Prisma nem argon2. **Não unifique esses dois arquivos**; o deploy quebra.

---

## Variáveis de ambiente

Configurar em *Settings → Environment Variables*. A lista autoritativa é o schema
Zod em `lib/env.ts`: se faltar uma obrigatória, a aplicação **não sobe** — a
validação lança no import, o que é proposital.

### Obrigatórias

| Variável | Observação |
| --- | --- |
| `DATABASE_URL` | Connection string **pooled** do provedor |
| `AUTH_SECRET` | Mínimo 32 caracteres. Gere com `npx auth secret` |

### Opcionais — cada ausência desliga um recurso, sem quebrar o build

| Variável | O que fica indisponível |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Assume `http://localhost:3000`; **defina em produção** |
| `AUTH_URL` | Ver "Callbacks de autenticação" abaixo |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Login com Google |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Cache e **rate limiting** |
| `CLOUDFLARE_*` (5 variáveis) | Upload de anexos |
| `RESEND_API_KEY` | Envio real de e-mail (sem ela, e-mails são só logados) |
| `EMAIL_FROM` | Remetente; tem padrão |
| `ENCRYPTION_KEY` | Criptografia em repouso |
| `SENTRY_DSN` | Observabilidade |
| `ASAAS_*` (3 variáveis) | Nada hoje — não há código de cobrança. Ver nota no `.env.example` |

**`SHADOW_DATABASE_URL` não vai para a Vercel.** Ela só serve ao
`prisma migrate dev` em desenvolvimento; `prisma migrate deploy` não cria banco sombra.

> Rate limiting merece atenção: sem Upstash configurado, login, cadastro e convite
> ficam **sem limite de tentativa** em produção.

### `APPLY_APPROVED_PLAN_PRICE_CHANGE` — flag temporária, nunca permanente

**Não configure esta variável na Vercel.** Ela existe para uma execução
deliberada do seed e nada mais.

- O seed normal **não altera preço de plano existente** — sincroniza apenas
  nome, módulos e limites, e cria planos que faltem com o preço inicial deles.
- Reajuste comercial é procedimento explícito: exige a flag valendo exatamente
  `"true"` **e** que o preço atual seja o de origem aprovado. Qualquer outro
  valor é preservado, não sobrescrito.
- Ative apenas na execução em que o reajuste for intencional e **remova logo
  depois**. Mantê-la ligada faz o próximo `db:seed` de qualquer pessoa mexer no
  que o cliente paga.

Aplicado no ambiente local em 04/08/2026 (standard: 59/590 → 29/290). Em
produção, quando for o caso, rodar como sessão isolada — no PowerShell:

```powershell
$env:APPLY_APPROVED_PLAN_PRICE_CHANGE="true"
npm run db:seed
Remove-Item Env:APPLY_APPROVED_PLAN_PRICE_CHANGE
```

---

## Callbacks de autenticação

O Auth.js v5 resolve a URL base a partir dos cabeçalhos da requisição quando
`AUTH_URL` não está definida, o que funciona na Vercel. Definir `AUTH_URL`
explicitamente com o domínio final continua sendo mais previsível, sobretudo com
domínio customizado atrás de proxy.

**Google OAuth** — cadastrar no Google Cloud Console, em *Authorized redirect URIs*:

```
https://SEU-DOMINIO/api/auth/callback/google
```

Cada ambiente precisa da sua própria URI, incluindo os domínios de preview se o
login com Google for testado neles.

---

## Domínio

Apontar em *Settings → Domains*. Depois de definir o domínio final:

1. Atualizar `NEXT_PUBLIC_APP_URL` — é o que monta os links dos e-mails
   transacionais (recuperação de senha, verificação, convite de equipe). Errada,
   os links do e-mail apontam para o lugar errado.
2. Atualizar `AUTH_URL`, se estiver definida.
3. Acrescentar a redirect URI do Google.

---

## Migrations em produção

Não rodam no build. `prisma migrate deploy` é um passo próprio, executado com a
connection string **direta** (sem pooler) — ver o comentário em `prisma.config.ts`.

```bash
DATABASE_URL="<connection string DIRETA>" npx prisma migrate deploy
```

Rodar migration através do pooler pode falhar ou travar: DDL precisa de sessão
estável, e o pooler pode trocar a conexão por baixo.

---

## Webhooks (ainda não existem)

Não há `app/api/webhooks/`. Quando a fase de pagamentos chegar, o endpoint vive em
`app/api/webhooks/<provedor>/route.ts` e a URL a cadastrar no provedor é:

```
https://SEU-DOMINIO/api/webhooks/<provedor>
```

Três exigências já decididas, registradas aqui para não se perderem:

- A rota precisa **validar a assinatura** do webhook antes de qualquer efeito
- O processamento é **idempotente**, guardando o id do evento — o mesmo evento
  chegando duas vezes não pode duplicar assinatura, pagamento, e-mail ou notificação
- Plano **nunca** é liberado pela página de sucesso do checkout, só por webhook
  autenticado ou consulta autenticada à API

---

## Antes do primeiro deploy

```bash
npx tsc --noEmit      # tipos
npx eslint .          # lint
npx vitest run        # testes
npm run build         # o mesmo comando que a Vercel roda
```

## Pendências conhecidas

- **Não há remote git configurado** (`git remote -v` vazio) — o repositório é local.
  Sem remote não há deploy automático.
- **Não existe `.github/workflows/`.** O pipeline descrito em `infrastructure.md`
  é uma proposta, não algo em funcionamento.
- **Não há ambiente de preview configurado.**
