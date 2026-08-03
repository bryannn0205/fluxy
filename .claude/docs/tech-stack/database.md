# 🗄️ Database Stack

## PostgreSQL

### Versão

- Usar latest stable (15+)
- Neon PostgreSQL em produção

### Features Suportadas

- ✅ JSONB para dados semi-estruturados
- ✅ Arrays para relações simples
- ✅ Full-text search
- ✅ UUID para IDs
- ✅ Triggers para auditoria

## Prisma ORM

### Setup

```bash
npm install @prisma/client
npm install -D prisma
```

### Schema Example

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Company {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?

  orders        Order[]
  users         User[]

  @@index([deletedAt])
}

model User {
  id            String   @id @default(cuid())
  email         String
  companyId     String
  company       Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?

  @@unique([email, companyId])
  @@index([companyId])
  @@index([deletedAt])
}

model Order {
  id            String   @id @default(cuid())
  companyId     String
  company       Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  orderNumber   String
  status        OrderStatus @default(PENDING)
  total         Decimal

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?

  items         OrderItem[]

  @@unique([companyId, orderNumber])
  @@index([companyId, status])
  @@index([companyId, createdAt])
  @@index([deletedAt])
}

model OrderItem {
  id            String   @id @default(cuid())
  orderId       String
  order         Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  productName   String
  quantity      Int
  price         Decimal

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([orderId])
}

enum OrderStatus {
  PENDING
  PROCESSING
  COMPLETED
  CANCELLED
}
```

### Usage

```typescript
// lib/db.ts
import { PrismaClient } from "@prisma/client";

// Singleton pattern
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

```typescript
// Queries
const orders = await prisma.order.findMany({
  where: {
    companyId: 'abc123',
    deletedAt: null, // Soft delete
  },
  include: {
    items: true,
  },
  orderBy: {
    createdAt: 'desc',
  },
  take: 10,
})

// Transações
const order = await prisma.$transaction(async (tx) => {
  const o = await tx.order.create({ data: { ... } })
  await tx.orderItem.create({ data: { orderId: o.id, ... } })
  return o
})
```

## Redis Cache

### Setup

```bash
npm install redis
```

### Usage

```typescript
// lib/cache.ts
import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL,
});

export async function getCachedOrders(companyId: string) {
  const cached = await redis.get(`orders:${companyId}`);
  return cached ? JSON.parse(cached) : null;
}

export async function setCachedOrders(companyId: string, orders: Order[]) {
  await redis.setEx(
    `orders:${companyId}`,
    300, // 5 minutos
    JSON.stringify(orders),
  );
}

export async function invalidateOrdersCache(companyId: string) {
  await redis.del(`orders:${companyId}`);
}
```

## Migrations

### Criar Migration

```bash
npx prisma migrate dev --name add_orders_table
```

### Estrutura de Migrations

```sql
-- prisma/migrations/20240101000000_add_orders_table/migration.sql

-- CreateTable Order
CREATE TABLE "Order" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Order_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_companyId_orderNumber_key" ON "Order"("companyId", "orderNumber");
CREATE INDEX "Order_companyId_status_idx" ON "Order"("companyId", "status");
CREATE INDEX "Order_deletedAt_idx" ON "Order"("deletedAt");
```

## Índices

### Sempre Criar Índices Para:

```typescript
// Campos no WHERE
@@index([companyId, status])

// Ordenação
@@index([companyId, createdAt])

// Soft delete
@@index([deletedAt])

// Relacionamentos
@@index([companyId]) // FK
```

## Performance

### Evitar N+1 Queries

```typescript
// ❌ Ruim - N+1 query
const orders = await prisma.order.findMany({
  where: { companyId },
});
orders.forEach((order) => {
  // Cada iteração faz uma query
  const items = prisma.orderItem.findMany({
    where: { orderId: order.id },
  });
});

// ✅ Bom - Uma query
const orders = await prisma.order.findMany({
  where: { companyId },
  include: {
    items: true, // Tudo em uma query
  },
});
```

### Paginação

```typescript
const page = 1;
const take = 20;
const skip = (page - 1) * take;

const orders = await prisma.order.findMany({
  where: { companyId },
  skip,
  take,
  orderBy: { createdAt: "desc" },
});

const total = await prisma.order.count({
  where: { companyId },
});

return {
  data: orders,
  pagination: {
    total,
    page,
    pageSize: take,
    totalPages: Math.ceil(total / take),
  },
};
```

### Select Específico

```typescript
// ❌ Puxar colunas desnecessárias
const orders = await prisma.order.findMany();

// ✅ Apenas necessárias
const orders = await prisma.order.findMany({
  select: {
    id: true,
    orderNumber: true,
    status: true,
  },
});
```

## Soft Delete

### Pattern

```typescript
// Marcar como deletado
await prisma.order.update({
  where: { id },
  data: { deletedAt: new Date() },
});

// Consultar apenas ativos
const activeOrders = await prisma.order.findMany({
  where: {
    companyId,
    deletedAt: null,
  },
});

// Restaurar
await prisma.order.update({
  where: { id },
  data: { deletedAt: null },
});
```

## Transações

```typescript
// Múltiplas operações atomicamente
const result = await prisma.$transaction(async (tx) => {
  // Tudo deve suceder ou nada acontece
  const order = await tx.order.create({
    data: { companyId, orderNumber: "001" },
  });

  await tx.orderItem.create({
    data: {
      orderId: order.id,
      productName: "Item 1",
      quantity: 1,
      price: 100,
    },
  });

  return order;
});
```

## Auditoria

```prisma
model AuditLog {
  id        String    @id @default(cuid())
  companyId String
  userId    String
  action    String    // CREATE, UPDATE, DELETE
  table     String    // orders, users, etc
  recordId  String
  changes   Json      // antes e depois
  createdAt DateTime  @default(now())

  @@index([companyId, createdAt])
  @@index([companyId, table, recordId])
}
```

```typescript
// services/AuditService.ts
async function log(
  companyId: string,
  userId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  table: string,
  recordId: string,
  changes: any,
) {
  await prisma.auditLog.create({
    data: {
      companyId,
      userId,
      action,
      table,
      recordId,
      changes,
    },
  });
}
```

---

**Ver também:**

- [Multi-tenant](../architecture/multi-tenant.md)
- [Backend Stack](./backend.md)
- [Performance](../features/performance.md)
