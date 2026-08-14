# Fluxy

SaaS multi-tenant de gestão de pedidos, produção e financeiro — em evolução para um ERP completo. Cada empresa (tenant) tem seus dados completamente isolados por `companyId`.

## Stack

- **Next.js 15** (App Router) + **React 19** + TypeScript estrito
- **Prisma 7** + PostgreSQL (`@prisma/adapter-pg`)
- **Auth.js v5** (credenciais + Google OAuth opcional)
- **Tailwind** + shadcn/ui + Base UI
- **Vitest** + Testing Library para testes
- Pagamentos: **ValidaPay** (sandbox — ver `docs/STATUS-VALIDAPAY.md`)

Arquitetura: Repository → Service → Server Action/API → UI. Ver `.claude/docs/` para os padrões e regras do projeto.

## Como rodar localmente

1. Copie `.env.example` para `.env` e preencha os valores (veja os comentários no próprio arquivo — só `DATABASE_URL` e `AUTH_SECRET` são obrigatórios para subir a aplicação).
2. Instale as dependências e gere o client do Prisma:

   ```bash
   npm install
   npx prisma generate
   ```

3. Aplique as migrations no banco de desenvolvimento:

   ```bash
   npx prisma migrate deploy
   ```

4. Rode o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

   Abra [http://localhost:3000](http://localhost:3000).

## Scripts úteis

| Comando              | O que faz                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run dev`        | Servidor de desenvolvimento (`next dev`)                                                            |
| `npm run build`      | `prisma generate && next build`                                                                     |
| `npm start`          | Servidor de produção (após `build`)                                                                 |
| `npm run type-check` | `tsc --noEmit`                                                                                      |
| `npm run lint`       | ESLint                                                                                              |
| `npm test`           | Testes (Vitest) — requer `TEST_DATABASE_URL` separado, nunca aponta para o banco de desenvolvimento |
| `npm run db:studio`  | Prisma Studio                                                                                       |
| `npm run db:seed`    | Popula planos e dados base                                                                          |

## Documentação

A documentação completa do projeto (arquitetura, padrões de código, deploy, segurança etc.) vive em [`.claude/docs/`](.claude/docs/). O estado real e atualizado da integração de pagamentos está em [`docs/STATUS-VALIDAPAY.md`](docs/STATUS-VALIDAPAY.md) — sempre a fonte de verdade antes de qualquer suposição.

## Deploy

Deploy na Vercel. Ver [`.claude/docs/tech-stack/deploy-vercel.md`](.claude/docs/tech-stack/deploy-vercel.md) para variáveis de ambiente, runtime e o passo a passo de migrations em produção.
