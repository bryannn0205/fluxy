# ✔️ Validação

## Regra Fundamental

**Toda entrada deve ser validada. Nunca confiar no frontend.**

Validação acontece em **duas camadas**:

1. **Frontend** (Zod) — UX rápida, feedback imediato
2. **Backend** (Zod) — segurança real, não negociável

O backend **sempre** revalida, mesmo que o frontend já tenha validado.

## Schemas Compartilhados

```typescript
// schemas/order.schema.ts
import { z } from "zod";

export const createOrderSchema = z.object({
  orderNumber: z
    .string()
    .min(1, "Número do pedido é obrigatório")
    .max(50, "Número muito longo")
    .regex(/^[A-Z0-9-]+$/, "Use apenas letras maiúsculas, números e hífen"),

  customerId: z.string().cuid("Cliente inválido"),

  items: z
    .array(
      z.object({
        productId: z.string().cuid(),
        quantity: z.number().int().positive("Quantidade deve ser maior que zero"),
        unitPrice: z.number().positive("Preço deve ser maior que zero"),
      }),
    )
    .min(1, "Adicione ao menos um item"),

  notes: z.string().max(1000).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderSchema = createOrderSchema.partial();
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
```

## Schemas Reutilizáveis

```typescript
// schemas/common.schema.ts
export const emailSchema = z.string().email("Email inválido").toLowerCase().trim();

export const passwordSchema = z
  .string()
  .min(8, "Mínimo de 8 caracteres")
  .regex(/[A-Z]/, "Precisa de uma letra maiúscula")
  .regex(/[a-z]/, "Precisa de uma letra minúscula")
  .regex(/[0-9]/, "Precisa de um número");

export const cnpjSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 14, "CNPJ deve ter 14 dígitos")
  .refine(isValidCnpj, "CNPJ inválido");

export const cpfSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 11, "CPF deve ter 11 dígitos")
  .refine(isValidCpf, "CPF inválido");

export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 11, "Telefone inválido");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
```

## Frontend — React Hook Form + Zod

```typescript
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

export function CreateOrderForm() {
  const form = useForm<CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      orderNumber: '',
      items: [],
    },
  })

  async function onSubmit(values: CreateOrderInput) {
    const result = await createOrderAction(values)

    if (result.error) {
      // Erros de validação do servidor mapeados para os campos
      if (typeof result.error === 'object') {
        Object.entries(result.error).forEach(([field, messages]) => {
          form.setError(field as keyof CreateOrderInput, {
            message: messages[0],
          })
        })
        return
      }
      toast.error(result.error)
      return
    }

    toast.success('Pedido criado com sucesso')
    form.reset()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="orderNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número do Pedido</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Criar Pedido
        </Button>
      </form>
    </Form>
  )
}
```

## Backend — Server Action

```typescript
"use server";

export async function createOrderAction(
  input: unknown, // Nunca tipar como CreateOrderInput — vem do cliente
): Promise<ActionResult<OrderResponseDto>> {
  // 1. Autenticação
  const session = await requireAuth();

  // 2. Validação (obrigatória, mesmo se o frontend validou)
  const validation = createOrderSchema.safeParse(input);
  if (!validation.success) {
    return { error: validation.error.flatten().fieldErrors };
  }

  // 3. Autorização + execução
  try {
    const order = await orderService.create(
      validation.data,
      session.user.companyId, // Nunca do input!
    );
    revalidatePath("/orders");
    return { data: OrderMapper.toDto(order) };
  } catch (error) {
    if (error instanceof DuplicateOrderError) {
      return { error: "Já existe um pedido com este número" };
    }
    logger.error("Failed to create order", { error, companyId: session.user.companyId });
    return { error: "Não foi possível criar o pedido" };
  }
}
```

## Backend — API Route

```typescript
export async function POST(request: Request) {
  const session = await requireAuth();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const validation = createOrderSchema.safeParse(body);
  if (!validation.success) {
    return Response.json(
      { error: "Dados inválidos", details: validation.error.flatten() },
      { status: 422 },
    );
  }

  const order = await orderService.create(validation.data, session.user.companyId);
  return Response.json(OrderMapper.toDto(order), { status: 201 });
}
```

## Validação de Query Params

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const querySchema = paginationSchema.extend({
    status: z.enum(["PENDING", "PROCESSING", "COMPLETED"]).optional(),
    search: z.string().max(100).optional(),
  });

  const validation = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!validation.success) {
    return Response.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const { page, pageSize, status, search } = validation.data;
  // ...
}
```

## Validação de Upload

```typescript
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const uploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size <= MAX_FILE_SIZE, "Arquivo deve ter no máximo 5MB")
    .refine((f) => ALLOWED_TYPES.includes(f.type), "Tipo de arquivo não permitido"),
});
```

## Validação de Regras de Negócio

Validação de **formato** é Zod. Validação de **regra de negócio** é no Service.

```typescript
export class OrderService {
  async create(input: CreateOrderInput, companyId: string) {
    // Formato já validado pelo Zod na Action

    // Regras de negócio aqui
    const existing = await this.repository.findByNumber(input.orderNumber, companyId);
    if (existing) {
      throw new DuplicateOrderError(input.orderNumber);
    }

    const customer = await this.customerRepository.findById(input.customerId, companyId);
    if (!customer) {
      throw new CustomerNotFoundError();
    }

    if (customer.isBlocked) {
      throw new BlockedCustomerError();
    }

    return this.repository.create({ ...input, companyId });
  }
}
```

## Erros de Validação Amigáveis

```typescript
// Sempre em português, sempre acionáveis
z.string().min(1, "Número do pedido é obrigatório"); // ✅
z.string().min(1, "Required"); // ❌
z.number().positive("Valor deve ser maior que zero"); // ✅
z.number().positive("Invalid"); // ❌
```

## Checklist

- [ ] Schema Zod para toda entrada do usuário
- [ ] Backend revalida tudo que o frontend validou
- [ ] `companyId` nunca vem do input
- [ ] Query params validados
- [ ] Uploads validados (tipo e tamanho)
- [ ] Mensagens de erro em português e acionáveis
- [ ] Schemas reutilizáveis centralizados
- [ ] Regras de negócio no Service, não no schema

---

**Ver também:**

- [Typing](./typing.md)
- [Security](../features/security.md)
- [Multi-tenant](../architecture/multi-tenant.md)
