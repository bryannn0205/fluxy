# 🧩 Princípios de Design Arquitetural

## Como Arquitetar uma Nova Feature

### Passo 1 — Entender o Domínio

Antes de escrever código, responda:

- Qual problema de negócio isso resolve?
- Quais entidades estão envolvidas?
- Quais são as regras de negócio?
- Como isso se relaciona com o multi-tenant?
- Quem pode acessar? Com quais permissões?

### Passo 2 — Modelar os Dados

```prisma
// 1. Definir modelo com companyId obrigatório
model Product {
  id          String    @id @default(cuid())
  companyId   String    // SEMPRE
  company     Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)

  sku         String
  name        String
  price       Decimal   @db.Decimal(10, 2)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  @@unique([companyId, sku])
  @@index([companyId, deletedAt])
}
```

### Passo 3 — Definir Tipos e Schemas

```typescript
// types/products.ts
export interface Product {
  id: string;
  companyId: string;
  sku: string;
  name: string;
  price: number;
}

// schemas/product.schema.ts
export const createProductSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  price: z.number().positive(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
```

### Passo 4 — Repository

```typescript
// repositories/interfaces/ProductRepository.ts
export interface ProductRepository {
  create(data: CreateProductData): Promise<Product>;
  findById(id: string, companyId: string): Promise<Product | null>;
  findBySku(sku: string, companyId: string): Promise<Product | null>;
  list(companyId: string, options?: ListOptions): Promise<PaginatedResult<Product>>;
  update(id: string, companyId: string, data: UpdateProductData): Promise<Product>;
  softDelete(id: string, companyId: string): Promise<void>;
}
```

### Passo 5 — Service (Regras de Negócio)

```typescript
// services/ProductService.ts
export class ProductService {
  constructor(
    private repository: ProductRepository,
    private logger: Logger,
  ) {}

  async create(input: CreateProductInput, companyId: string): Promise<Product> {
    const existing = await this.repository.findBySku(input.sku, companyId);
    if (existing) {
      throw new DuplicateSkuError(input.sku);
    }

    return this.repository.create({ ...input, companyId });
  }
}
```

### Passo 6 — Server Action / API

```typescript
// app/(dashboard)/products/actions.ts
"use server";

export async function createProductAction(input: CreateProductInput) {
  const session = await requireAuth();

  const validation = createProductSchema.safeParse(input);
  if (!validation.success) {
    return { error: validation.error.flatten() };
  }

  const product = await productService.create(validation.data, session.user.companyId);

  revalidatePath("/products");
  return { data: ProductMapper.toDto(product) };
}
```

### Passo 7 — UI

```typescript
// app/(dashboard)/products/_components/CreateProductDialog.tsx
'use client'

export function CreateProductDialog() {
  const form = useForm<CreateProductInput>({
    resolver: zodResolver(createProductSchema),
  })

  async function onSubmit(values: CreateProductInput) {
    const result = await createProductAction(values)
    if (result.error) {
      toast.error('Falha ao criar produto')
      return
    }
    toast.success('Produto criado')
  }

  return <Form {...form}>{/* campos */}</Form>
}
```

## Fluxo de Dados

```
UI Component (Client)
     ↓ chama
Server Action (validação + autorização)
     ↓ chama
Service (regras de negócio)
     ↓ chama
Repository (acesso a dados)
     ↓ chama
Prisma → PostgreSQL
```

**Regra**: Nunca pule camadas. UI nunca chama Prisma diretamente.

## Decisões Arquiteturais

### Quando criar um Service?

- ✅ Existe regra de negócio além de CRUD
- ✅ Múltiplas operações precisam ser coordenadas
- ✅ Side effects (email, webhook, audit)
- ❌ CRUD puro e simples sem regras

### Quando criar um Repository?

- ✅ Sempre. Isola acesso a dados e facilita testes.

### Quando usar Server Action vs API Route?

| Cenário                 | Escolha       |
| ----------------------- | ------------- |
| Form submit interno     | Server Action |
| Mutation de UI          | Server Action |
| Webhook externo         | API Route     |
| Integração de terceiros | API Route     |
| Mobile app futura       | API Route     |

### Quando usar Server Component vs Client Component?

| Cenário                            | Escolha          |
| ---------------------------------- | ---------------- |
| Buscar dados                       | Server Component |
| Renderizar conteúdo estático       | Server Component |
| Interatividade (onClick, useState) | Client Component |
| Hooks do React                     | Client Component |
| Acesso a browser APIs              | Client Component |

**Padrão**: Server Component por default. `'use client'` apenas na folha da árvore.

## Extensibilidade para IA

Toda arquitetura deve permitir futura integração de IA sem acoplar.

```typescript
// ❌ IA acoplada à regra de negócio
class OrderService {
  async create(input: CreateOrderInput) {
    const aiSuggestion = await openai.complete(...)  // NÃO
    // ...
  }
}

// ✅ IA como camada separada, plugável
interface OrderEnricher {
  enrich(order: Order): Promise<OrderEnrichment>
}

class AIOrderEnricher implements OrderEnricher {
  async enrich(order: Order) { /* chamada IA */ }
}

class NoopOrderEnricher implements OrderEnricher {
  async enrich() { return {} }
}

// Service não sabe se é IA ou não
class OrderService {
  constructor(private enricher: OrderEnricher) {}
}
```

**Regra**: IA nunca deve estar no caminho crítico de uma transação de negócio.

## Anti-patterns a Evitar

### God Object

```typescript
// ❌ Uma classe que faz tudo
class AppService {
  createOrder() {}
  sendEmail() {}
  processPayment() {}
  generateReport() {}
  uploadFile() {}
}
```

### Anemic Domain Model

```typescript
// ❌ Modelo sem comportamento, tudo em service
// Prefira colocar regras próximas do domínio quando fizer sentido
```

### Leaky Abstraction

```typescript
// ❌ Repository expondo detalhes do Prisma
interface OrderRepository {
  findMany(args: Prisma.OrderFindManyArgs): Promise<Order[]>; // Vaza Prisma
}

// ✅ Interface agnóstica
interface OrderRepository {
  list(companyId: string, options: ListOptions): Promise<Order[]>;
}
```

### Premature Optimization

```typescript
// ❌ Cache complexo antes de medir
// ✅ Meça primeiro, otimize depois
```

## Checklist para Nova Feature

- [ ] Modelo tem `companyId` e índices
- [ ] Schema Zod definido (frontend + backend)
- [ ] Repository com interface
- [ ] Service com regras de negócio
- [ ] Server Action valida e autoriza
- [ ] Todos os estados de UI (loading, empty, error, success)
- [ ] Testes de service e regras críticas
- [ ] Logs estruturados em pontos importantes
- [ ] Audit log se ação for crítica
- [ ] Documentação da API/Service

---

**Ver também:**

- [Patterns](./patterns.md)
- [Multi-tenant](./multi-tenant.md)
- [Workflow](../development/workflow.md)
