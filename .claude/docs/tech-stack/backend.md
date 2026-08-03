# ⚙️ Backend Stack

## Framework

### Next.js App Router

- ✅ **App Router** obrigatório
- ✅ **Server Components** por padrão
- ✅ **Server Actions** para mutations
- ✅ Evitar Page Router completamente

## API Routes

### REST API (quando necessário)

```typescript
// app/api/orders/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  // Validar companyId
  if (!companyId) {
    return Response.json({ error: "companyId obrigatório" }, { status: 400 });
  }

  // Buscar dados
  const orders = await orderService.listByCompany(companyId);

  return Response.json(orders);
}

export async function POST(request: Request) {
  const body = await request.json();

  // Validar e processar
  const order = await orderService.create(body);

  return Response.json(order, { status: 201 });
}
```

## Server Actions

### Mutations via Server Actions

```typescript
// app/orders/_components/CreateOrderForm.tsx
'use client'

import { createOrderAction } from './actions'

export function CreateOrderForm() {
  const handleSubmit = async (formData: FormData) => {
    const result = await createOrderAction(formData)

    if (result.error) {
      // mostrar erro
    } else {
      // redirecionar ou revalidar
    }
  }

  return <form action={handleSubmit}>...</form>
}
```

```typescript
// app/orders/_components/actions.ts
"use server";

import { revalidatePath } from "next/cache";

export async function createOrderAction(formData: FormData) {
  try {
    // Pegar dados
    const orderNumber = formData.get("orderNumber");

    // Validar
    const validation = orderSchema.safeParse({ orderNumber });
    if (!validation.success) {
      return { error: validation.error };
    }

    // Autorizar (verificar companyId)
    const session = await getSession();

    // Criar
    const order = await orderService.create(validation.data, session.companyId);

    // Revalidar cache
    revalidatePath("/orders");

    return { success: true, order };
  } catch (error) {
    return { error: "Falha ao criar pedido" };
  }
}
```

## Middleware & Autorização

### Middleware Next.js

```typescript
// middleware.ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // Verificar autenticação
  const token = request.cookies.get("session")?.value;

  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Adicionar headers
  const response = NextResponse.next();
  response.headers.set("X-Request-ID", crypto.randomUUID());

  return response;
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*"],
};
```

### Autenticação

```typescript
// lib/auth.ts
import { getServerSession } from "next-auth";

export async function requireAuth() {
  const session = await getServerSession(authConfig);

  if (!session) {
    throw new UnauthorizedError();
  }

  return session;
}

export async function getUserCompanyId() {
  const session = await requireAuth();
  return session.user.companyId;
}
```

## Validação

### Zod no Backend

```typescript
// lib/schemas.ts
export const createOrderSchema = z.object({
  orderNumber: z.string().min(1),
  total: z.number().positive(),
  status: z.enum(["pending", "processing", "completed"]),
});

// app/api/orders/route.ts
export async function POST(request: Request) {
  const body = await request.json();
  const result = createOrderSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 });
  }

  // processar result.data
}
```

## Service Layer

```typescript
// services/OrderService.ts
export class OrderService {
  constructor(
    private orderRepository: OrderRepository,
    private logger: Logger,
  ) {}

  async create(data: CreateOrderInput, companyId: string): Promise<Order> {
    this.logger.info("Creating order", { companyId });

    // Validação
    const validation = createOrderSchema.safeParse(data);
    if (!validation.success) {
      throw new ValidationError(validation.error);
    }

    // Duplicação?
    const existing = await this.orderRepository.findByNumber(data.orderNumber, companyId);
    if (existing) {
      throw new DuplicateOrderError();
    }

    // Criar
    const order = await this.orderRepository.create({
      ...validation.data,
      companyId,
    });

    this.logger.info("Order created", { orderId: order.id });

    return order;
  }

  async list(companyId: string): Promise<Order[]> {
    return this.orderRepository.findByCompany(companyId);
  }
}
```

## Repository Pattern

```typescript
// repositories/OrderRepository.ts
export interface OrderRepository {
  create(data: CreateOrderInput & { companyId: string }): Promise<Order>;
  findById(id: string, companyId: string): Promise<Order | null>;
  findByCompany(companyId: string): Promise<Order[]>;
  findByNumber(orderNumber: string, companyId: string): Promise<Order | null>;
  update(id: string, companyId: string, data: UpdateOrderInput): Promise<Order>;
  delete(id: string, companyId: string): Promise<void>;
}

// implementations/PrismaOrderRepository.ts
export class PrismaOrderRepository implements OrderRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data) {
    return this.prisma.order.create({ data });
  }

  async findById(id, companyId) {
    return this.prisma.order.findFirst({
      where: { id, companyId },
    });
  }

  // ...
}
```

## Error Handling

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor() {
    super("NOT_FOUND", 404, "Recurso não encontrado");
  }
}

export class ValidationError extends AppError {
  constructor(public errors: any) {
    super("VALIDATION_ERROR", 400, "Dados inválidos");
  }
}

// app/api/orders/route.ts
export async function POST(request: Request) {
  try {
    const result = await orderService.create(data);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json(
        { code: error.code, message: error.message },
        { status: error.statusCode },
      );
    }

    // Log unexpected errors
    logger.error("Unexpected error", { error });

    return Response.json(
      { code: "INTERNAL_ERROR", message: "Erro interno" },
      { status: 500 },
    );
  }
}
```

## Background Jobs (Preparado)

```typescript
// lib/jobs/JobQueue.ts
export class JobQueue {
  async enqueue<T>(
    name: string,
    payload: T,
    options?: { delay?: number; retry?: number },
  ): Promise<void> {
    // Redis, Bull, ou similar
    // Preparado para futura implementação
  }
}

// lib/jobs/processors.ts
export async function processOrderNotification(orderId: string) {
  // Enviar notificação
  // Registrar em audit log
}
```

## Estrutura de Pastas

```
app/
├── api/
│   ├── orders/
│   ├── auth/
│   └── webhooks/
├── dashboard/
│   ├── orders/
│   ├── _components/
│   └── actions.ts

services/
├── OrderService.ts
├── AuthService.ts
└── NotificationService.ts

repositories/
├── OrderRepository.ts
└── implementations/

lib/
├── auth.ts
├── db.ts
├── errors.ts
├── schemas.ts
├── logger.ts
└── jobs.ts

types/
├── orders.ts
├── auth.ts
└── api.ts
```

---

**Ver também:**

- [Database](./database.md)
- [Security](../features/security.md)
- [Code Standards](../quality/code-standards.md)
