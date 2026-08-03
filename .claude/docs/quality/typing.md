# 🔤 Tipagem TypeScript

## Regra Absoluta

**Todo código deve ser totalmente tipado. Nunca utilizar `any`.**

## Configuração Estrita

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## Alternativas ao `any`

### `unknown` + Type Guards

```typescript
// ✅ Entrada desconhecida
function handleWebhook(payload: unknown) {
  const result = webhookSchema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  // result.data agora é tipado
  processWebhook(result.data);
}
```

### Generics

```typescript
// ❌ any
function first(arr: any[]): any {
  return arr[0];
}

// ✅ Generic
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}
```

### Union Types

```typescript
// ❌ any
function format(value: any): string {}

// ✅ Union
function format(value: string | number | Date): string {}
```

## Tipos Reutilizáveis

### Centralizar em `types/`

```typescript
// types/common.ts
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface ActionResult<T> {
  data?: T;
  error?: string;
}

export type Nullable<T> = T | null;
export type Maybe<T> = T | undefined;

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TenantScoped {
  companyId: string;
}
```

### Composição de Tipos

```typescript
// types/orders.ts
import type { Timestamps, TenantScoped } from "./common";

export interface Order extends Timestamps, TenantScoped {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
}

export type CreateOrderData = Omit<Order, "id" | keyof Timestamps>;
export type UpdateOrderData = Partial<Pick<Order, "status" | "total">>;
export type OrderSummary = Pick<Order, "id" | "orderNumber" | "status" | "total">;
```

## Utility Types

```typescript
// Tornar campos opcionais
type PartialOrder = Partial<Order>;

// Tornar campos obrigatórios
type RequiredOrder = Required<Order>;

// Selecionar campos
type OrderId = Pick<Order, "id">;

// Remover campos
type OrderWithoutTimestamps = Omit<Order, "createdAt" | "updatedAt">;

// Somente leitura
type ImmutableOrder = Readonly<Order>;

// Record
type OrdersByStatus = Record<OrderStatus, Order[]>;

// Extrair tipo de retorno
type OrderServiceResult = Awaited<ReturnType<typeof orderService.create>>;

// Tornar alguns campos opcionais
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type OrderInput = PartialBy<Order, "status">;
```

## Enums vs Const Objects

```typescript
// ✅ Preferir const object + tipo derivado (melhor tree-shaking)
export const OrderStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

// Uso
const status: OrderStatus = OrderStatus.PENDING;
```

## Type Guards

```typescript
// Type predicate
export function isOrder(value: unknown): value is Order {
  return (
    typeof value === "object" && value !== null && "id" in value && "orderNumber" in value
  );
}

// Discriminated union
type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function handle(result: ActionResult<Order>) {
  if (result.success) {
    console.log(result.data); // TypeScript sabe que data existe
  } else {
    console.log(result.error); // TypeScript sabe que error existe
  }
}
```

## Inferência de Zod

```typescript
// Fonte única de verdade: o schema
export const createOrderSchema = z.object({
  orderNumber: z.string().min(1),
  total: z.number().positive(),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED"]),
});

// Tipo derivado automaticamente
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
```

## Tipos do Prisma

```typescript
import type { Prisma, Order as PrismaOrder } from "@prisma/client";

// Tipo com relações incluídas
export type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: true };
}>;

// Tipo com select específico
export type OrderSummary = Prisma.OrderGetPayload<{
  select: { id: true; orderNumber: true; status: true };
}>;
```

## Augmentation de Módulos

```typescript
// types/next-auth.d.ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      companyId: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    companyId: string;
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    companyId: string;
    role: UserRole;
  }
}
```

## Variáveis de Ambiente Tipadas

```typescript
// lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),
  ASAAS_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(["development", "production", "test"]),
});

export const env = envSchema.parse(process.env);
// Agora env.DATABASE_URL é string, com validação em runtime
```

## Componentes React Tipados

```typescript
// Props explícitas
interface OrderTableProps {
  orders: Order[];
  onSelect: (order: Order) => void;
  isLoading?: boolean;
}

export function OrderTable({ orders, onSelect, isLoading = false }: OrderTableProps) {
  // ...
}

// Componente genérico
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ data, columns, onRowClick }: DataTableProps<T>) {
  // ...
}
```

## Hooks Tipados

```typescript
export function useOrders(companyId: string) {
  return useQuery<PaginatedResult<Order>, Error>({
    queryKey: ["orders", companyId],
    queryFn: () => fetchOrders(companyId),
  });
}
```

## Checklist

- [ ] `strict: true` no tsconfig
- [ ] Zero ocorrências de `any`
- [ ] Zero ocorrências de `@ts-ignore`
- [ ] Tipos compartilhados em `types/`
- [ ] Schemas Zod como fonte de tipos de entrada
- [ ] Env vars validadas e tipadas
- [ ] Props de componentes com interface explícita
- [ ] Retornos de funções assíncronas tipados

---

**Ver também:**

- [Code Standards](./code-standards.md)
- [Validation](./validation.md)
