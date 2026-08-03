# 📁 Estrutura de Pastas

## Visão Geral

```
fluxy/
├── .claude/                  # Documentação para Claude
│   ├── CLAUDE.md
│   └── docs/
│
├── app/                      # Next.js App Router
│   ├── (auth)/              # Route group: autenticação
│   ├── (dashboard)/         # Route group: área logada
│   ├── api/                 # API Routes
│   ├── layout.tsx
│   ├── page.tsx
│   ├── error.tsx
│   └── not-found.tsx
│
├── components/              # Componentes React
│   ├── ui/                  # shadcn/ui base
│   ├── forms/
│   ├── tables/
│   ├── layout/
│   └── common/
│
├── services/                # Business logic
├── repositories/            # Data access
├── lib/                     # Utilities & config
├── hooks/                   # React hooks
├── types/                   # TypeScript types
├── schemas/                 # Zod schemas
├── prisma/                  # Database
├── tests/                   # Testes
└── public/                  # Assets estáticos
```

## `app/` — Rotas & Páginas

```
app/
├── (auth)/                          # Route group (não afeta URL)
│   ├── layout.tsx                   # Layout de auth
│   ├── login/
│   │   ├── page.tsx
│   │   └── _components/
│   │       └── LoginForm.tsx
│   ├── register/
│   ├── forgot-password/
│   └── verify-email/
│
├── (dashboard)/
│   ├── layout.tsx                   # Layout com sidebar
│   ├── page.tsx                     # Dashboard home
│   │
│   ├── orders/
│   │   ├── page.tsx                 # Lista de pedidos
│   │   ├── actions.ts               # Server Actions
│   │   ├── loading.tsx              # Loading state
│   │   ├── error.tsx                # Error boundary
│   │   ├── _components/             # Componentes locais
│   │   │   ├── OrderTable.tsx
│   │   │   ├── OrderFilters.tsx
│   │   │   └── CreateOrderDialog.tsx
│   │   │
│   │   ├── [id]/
│   │   │   ├── page.tsx             # Detalhe do pedido
│   │   │   ├── edit/page.tsx
│   │   │   └── _components/
│   │   │
│   │   └── new/
│   │       └── page.tsx
│   │
│   ├── customers/
│   ├── products/
│   └── settings/
│       ├── page.tsx
│       ├── profile/
│       ├── company/
│       └── billing/
│
└── api/
    ├── orders/
    │   ├── route.ts                 # GET, POST /api/orders
    │   └── [id]/route.ts            # GET, PATCH, DELETE
    ├── auth/
    │   └── [...nextauth]/route.ts
    ├── upload/route.ts
    └── webhooks/
        └── asaas/route.ts
```

### Convenções `app/`

- `_components/` — componentes privados da rota (underscore = não vira rota)
- `actions.ts` — Server Actions da rota
- `loading.tsx` — Suspense boundary
- `error.tsx` — Error boundary
- `(group)/` — agrupamento sem afetar URL

## `components/` — Componentes Compartilhados

```
components/
├── ui/                              # shadcn/ui (não modificar internos)
│   ├── button.tsx
│   ├── input.tsx
│   ├── dialog.tsx
│   ├── table.tsx
│   └── ...
│
├── forms/
│   ├── FormField.tsx                # Wrapper genérico
│   ├── FormSelect.tsx
│   ├── FormDatePicker.tsx
│   └── FormCurrencyInput.tsx
│
├── tables/
│   ├── DataTable.tsx                # Tabela genérica
│   ├── DataTablePagination.tsx
│   ├── DataTableToolbar.tsx
│   └── DataTableColumnHeader.tsx
│
├── layout/
│   ├── Sidebar.tsx
│   ├── Header.tsx
│   ├── UserMenu.tsx
│   └── Breadcrumbs.tsx
│
└── common/
    ├── EmptyState.tsx
    ├── ErrorState.tsx
    ├── LoadingSpinner.tsx
    ├── ConfirmDialog.tsx
    └── PageHeader.tsx
```

### Regra

- Componente usado em **2+ rotas** → `components/`
- Componente usado em **1 rota** → `app/[rota]/_components/`

## `services/` — Lógica de Negócio

```
services/
├── OrderService.ts
├── CustomerService.ts
├── ProductService.ts
├── AuthService.ts
├── PaymentService.ts
├── NotificationService.ts
├── AuditService.ts
└── index.ts                         # Barrel export
```

## `repositories/` — Acesso a Dados

```
repositories/
├── interfaces/
│   ├── OrderRepository.ts
│   ├── CustomerRepository.ts
│   └── BaseRepository.ts
│
└── implementations/
    ├── PrismaOrderRepository.ts
    ├── PrismaCustomerRepository.ts
    └── index.ts
```

## `lib/` — Utilities & Configuração

```
lib/
├── db.ts                            # Prisma client singleton
├── redis.ts                         # Redis client
├── auth.ts                          # Auth.js config
├── r2.ts                            # Cloudflare R2
├── asaas.ts                         # Asaas API client
├── email.ts                         # Email service
├── logger.ts                        # Structured logging
├── errors.ts                        # Error classes
├── container.ts                     # DI container
├── utils.ts                         # Helpers genéricos
├── constants.ts                     # Constantes
├── formatters.ts                    # Formatação (moeda, data)
└── validators.ts                    # Validadores custom
```

## `hooks/` — React Hooks

```
hooks/
├── useOrders.ts                     # TanStack Query
├── useCustomers.ts
├── useAuth.ts
├── useDebounce.ts
├── useMediaQuery.ts
├── useToast.ts
├── useConfirm.ts
└── index.ts
```

## `types/` — TypeScript Types

```
types/
├── index.ts                         # Barrel export
├── common.ts                        # Tipos genéricos
├── api.ts                           # Request/Response
├── orders.ts
├── customers.ts
├── auth.ts
├── database.ts                      # Extensões do Prisma
└── next-auth.d.ts                   # Augmentation
```

## `schemas/` — Validação Zod

```
schemas/
├── order.schema.ts
├── customer.schema.ts
├── auth.schema.ts
├── common.schema.ts                 # Reutilizáveis (email, cpf, cnpj)
└── index.ts
```

## `prisma/` — Database

```
prisma/
├── schema.prisma
├── migrations/
│   └── 20260801000000_init/
│       └── migration.sql
├── seed.ts
└── seeds/
    ├── companies.ts
    └── users.ts
```

## `tests/` — Testes

```
tests/
├── unit/
│   ├── services/
│   │   └── OrderService.test.ts
│   └── lib/
│       └── formatters.test.ts
│
├── integration/
│   ├── api/
│   │   └── orders.test.ts
│   └── repositories/
│
├── e2e/
│   ├── auth.spec.ts
│   └── orders.spec.ts
│
├── fixtures/
│   └── orders.ts
│
└── helpers/
    ├── db.ts                        # Setup/teardown
    └── auth.ts
```

## Regras de Organização

### ✅ Fazer

- Arquivos pequenos (< 300 linhas)
- Um componente por arquivo
- Nomes descritivos: `CreateOrderDialog.tsx`
- Barrel exports (`index.ts`) para pastas
- Colocar componentes perto do uso

### ❌ Não Fazer

- Arquivos gigantes (> 500 linhas)
- Múltiplos componentes exportados por arquivo
- Nomes genéricos: `utils.ts` com 1000 linhas
- Pastas com 50+ arquivos sem subpastas
- Componentes genéricos usados uma vez só

## Convenções de Nomenclatura

| Tipo             | Convenção                 | Exemplo              |
| ---------------- | ------------------------- | -------------------- |
| Componente React | PascalCase                | `OrderTable.tsx`     |
| Hook             | camelCase com `use`       | `useOrders.ts`       |
| Service          | PascalCase + `Service`    | `OrderService.ts`    |
| Repository       | PascalCase + `Repository` | `OrderRepository.ts` |
| Schema           | camelCase + `.schema`     | `order.schema.ts`    |
| Types            | camelCase                 | `orders.ts`          |
| Utils            | camelCase                 | `formatters.ts`      |
| Constantes       | SCREAMING_SNAKE           | `MAX_PAGE_SIZE`      |
| Rota App Router  | kebab-case                | `forgot-password/`   |

---

**Ver também:**

- [Patterns](./patterns.md)
- [Organization](../quality/organization.md)
