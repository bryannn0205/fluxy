# 🏗️ Multi-tenant Architecture

## Princípio Fundamental

**Todo dado obrigatoriamente pertence a uma empresa (tenant).**

Nenhum dado pode existir sem um `companyId`.

Nenhuma query pode ser executada sem filtrar por `companyId`.

Este é um requisito **OBRIGATÓRIO** que nunca pode ser violado.

## Estrutura de Banco de Dados

### Regra: Toda Tabela Tem companyId

```prisma
model Order {
  id            String   @id @default(cuid())
  companyId     String   @db.Uuid  // ✅ OBRIGATÓRIO
  company       Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  orderNumber   String
  status        String

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime? // Soft delete

  @@unique([companyId, orderNumber])  // Unicidade por tenant
  @@index([companyId, status])         // Query performance
  @@index([companyId, createdAt])
  @@index([deletedAt])
}
```

### Padrão Completo

```prisma
model AnyTable {
  id            String    @id @default(cuid())
  companyId     String    @db.Uuid   // SEMPRE presente
  company       Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)

  // Dados
  name          String

  // Timestamps
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime? // Soft delete para auditoria

  // Índices
  @@index([companyId])                // Para WHERE companyId
  @@index([companyId, status])        // Queries comuns
  @@index([deletedAt])                // Soft delete queries
}
```

## Queries - Sempre Filtrar por companyId

### Pattern Obrigatório

```typescript
// ❌ NUNCA FAZER ISTO
const orders = await prisma.order.findMany();

// ✅ SEMPRE FAZER ISTO
const orders = await prisma.order.findMany({
  where: {
    companyId: userCompanyId, // Sempre filtrar!
    deletedAt: null,
  },
});
```

### Queries Seguras

```typescript
// Repository com proteção automática
async function findById(id: string, companyId: string) {
  return prisma.order.findFirst({
    where: {
      id,
      companyId, // Dupla proteção
    },
  });
}

// Nunca retornar sem companyId
async function findByNumber(orderNumber: string, companyId: string) {
  return prisma.order.findFirst({
    where: {
      orderNumber,
      companyId, // OBRIGATÓRIO
    },
  });
}
```

## Segurança: Nunca Confiar no Frontend

### ❌ Inseguro

```typescript
// Frontend envia companyId
const formData = new FormData(form);
const result = await fetch("/api/orders", { method: "POST", body: formData });

// Backend confia no frontend
export async function POST(request: Request) {
  const body = await request.json();

  // ❌ PERIGOSO: Usar companyId do request
  const orders = await prisma.order.create({
    data: {
      companyId: body.companyId, // NUNCA! Frontend pode mentir
      orderNumber: body.orderNumber,
    },
  });
}
```

### ✅ Seguro

```typescript
// Backend obtém companyId da sessão autenticada
export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.user?.companyId) {
    throw new UnauthorizedError();
  }

  const body = await request.json();

  // ✅ CORRETO: Usar companyId da sessão
  const order = await prisma.order.create({
    data: {
      companyId: session.user.companyId, // Do token, não do request!
      orderNumber: body.orderNumber,
    },
  });
}
```

## Autorização: Sempre Backend

### Pattern Obrigatório

```typescript
// Middleware
export async function requireAuth() {
  const session = await getServerSession(authConfig);

  if (!session?.user?.companyId) {
    throw new UnauthorizedError("Não autenticado");
  }

  return session;
}

export async function requireCompanyAccess(companyId: string) {
  const session = await requireAuth();

  if (session.user.companyId !== companyId) {
    throw new ForbiddenError("Sem acesso a esta empresa");
  }

  return session;
}

// Server Action
("use server");
export async function updateOrder(orderId: string, data: any) {
  const session = await requireAuth();

  // Verificar se ordem pertence à empresa do usuário
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      companyId: session.user.companyId,
    },
  });

  if (!order) {
    throw new ForbiddenError("Sem acesso a este pedido");
  }

  // Atualizar com segurança
  return prisma.order.update({
    where: { id: orderId },
    data: {
      companyId: session.user.companyId, // Garantir que não muda
      ...data,
    },
  });
}
```

## Isolamento de Dados: Dupla Proteção

### Camada 1: Query

```typescript
// Sempre filtrar companyId
where: {
  id,
  companyId,  // Proteção 1
}
```

### Camada 2: Validação

```typescript
// Verificar autorização
if (order.companyId !== session.user.companyId) {
  throw new ForbiddenError(); // Proteção 2
}
```

### Camada 3: Soft Delete

```typescript
// Auditar tudo
deletedAt: new Date(); // Nunca perder dados
```

## Regra: Impossível Vazar Entre Empresas

### Garantias

1. **Banco de dados**
   - Toda tabela tem `companyId`
   - Toda query filtra por `companyId`
   - Foreign keys com cascata

2. **Aplicação**
   - `companyId` sempre da sessão (nunca frontend)
   - Validação em middleware
   - Testes de segurança

3. **Auditoria**
   - Logs de acesso
   - Soft delete
   - Rastreamento de mudanças

## Exemplo Completo: Create Order

```typescript
// types/orders.ts
export interface CreateOrderInput {
  orderNumber: string
  total: number
  items: CreateOrderItemInput[]
}

export const createOrderSchema = z.object({
  orderNumber: z.string().min(1),
  total: z.number().positive(),
  items: z.array(z.object({
    productName: z.string(),
    quantity: z.number().positive(),
    price: z.number().positive(),
  })),
})

// services/OrderService.ts
export class OrderService {
  async create(
    input: CreateOrderInput,
    companyId: string,  // Do session, não frontend
  ) {
    // Validação
    const result = createOrderSchema.safeParse(input)
    if (!result.success) {
      throw new ValidationError(result.error)
    }

    // Verificar duplicação (por tenant)
    const existing = await prisma.order.findFirst({
      where: {
        companyId,  // Buscar apenas nesta empresa
        orderNumber: input.orderNumber,
      },
    })

    if (existing) {
      throw new DuplicateOrderError()
    }

    // Transação
    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          companyId,  // OBRIGATÓRIO
          orderNumber: input.orderNumber,
          total: input.total,
        },
      })

      // Criar itens
      for (const item of input.items) {
        await tx.orderItem.create({
          data: {
            orderId: o.id,
            companyId,  // Manter isolamento
            ...item,
          },
        })
      }

      return o
    })

    return order
  }

  async findById(orderId: string, companyId: string) {
    return prisma.order.findFirst({
      where: {
        id: orderId,
        companyId,  // Dupla proteção
      },
      include: {
        items: true,
      },
    })
  }
}

// app/orders/actions.ts
'use server'
export async function createOrderAction(input: CreateOrderInput) {
  // 1. Autenticar
  const session = await getSession()
  if (!session?.user?.companyId) {
    throw new UnauthorizedError()
  }

  // 2. Criar (companyId do session, não input)
  const order = await orderService.create(
    input,
    session.user.companyId  // NUNCA do frontend!
  )

  // 3. Revalidar cache
  revalidatePath(`/dashboard/orders`)

  return order
}

// app/orders/[id]/page.tsx
'use server'
export default async function OrderDetailPage({ params }) {
  const session = await getSession()

  // Verificar autorização
  const order = await orderService.findById(
    params.id,
    session.user.companyId  // Filtrar por tenant
  )

  if (!order) {
    notFound()  // Ou 403 Forbidden
  }

  return <OrderDetail order={order} />
}
```

## Checklist de Segurança Multi-tenant

- [ ] Toda tabela tem `companyId`
- [ ] Toda query filtra por `companyId`
- [ ] `companyId` vem da sessão, não frontend
- [ ] Middleware valida autorização
- [ ] Testes de isolation
- [ ] Soft delete em produção
- [ ] Logs de acesso
- [ ] Nenhum `findMany()` sem where
- [ ] Foreign keys com cascata
- [ ] Índices em companyId

---

**Ver também:**

- [Product](../project/product.md)
- [Security](../features/security.md)
- [Database](../tech-stack/database.md)
