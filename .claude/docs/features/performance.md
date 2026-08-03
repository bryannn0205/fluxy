# ⚡ Performance

## Metas

| Métrica                         | Alvo    |
| ------------------------------- | ------- |
| LCP (Largest Contentful Paint)  | < 2.5s  |
| INP (Interaction to Next Paint) | < 200ms |
| CLS (Cumulative Layout Shift)   | < 0.1   |
| TTFB                            | < 600ms |
| Query de banco (p95)            | < 100ms |
| API response (p95)              | < 300ms |

## Server Components

Padrão: Server Component. `'use client'` apenas onde há interatividade.

```typescript
// ✅ Server Component — zero JS enviado ao cliente
export default async function OrdersPage() {
  const session = await requireAuth()
  const orders = await orderService.list(session.user.companyId)

  return (
    <div>
      <h1>Pedidos</h1>
      <OrderTable orders={orders} />   {/* pode ser Server Component */}
      <CreateOrderButton />             {/* 'use client' apenas aqui */}
    </div>
  )
}
```

### Empurre `'use client'` para as folhas

```typescript
// ❌ Client Component na raiz — tudo abaixo vira client
'use client'
export default function Page() {
  return (
    <Layout>
      <HeavyStaticContent />   {/* desnecessariamente client */}
      <InteractiveButton />
    </Layout>
  )
}

// ✅ Só o botão é client
export default function Page() {
  return (
    <Layout>
      <HeavyStaticContent />
      <InteractiveButton />   {/* 'use client' dentro deste arquivo */}
    </Layout>
  )
}
```

## Dynamic Import & Lazy Loading

```typescript
import dynamic from 'next/dynamic'

// Componente pesado carregado sob demanda
const OrderChart = dynamic(() => import('./OrderChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,  // se depender de browser APIs
})

// Modal só carrega quando aberto
const ExportDialog = dynamic(() => import('./ExportDialog'))
```

## Otimização de Queries

### Evitar N+1

```typescript
// ❌ N+1 — 1 query + N queries
const orders = await prisma.order.findMany({ where: { companyId } });
for (const order of orders) {
  order.items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
}

// ✅ 1 query
const orders = await prisma.order.findMany({
  where: { companyId },
  include: { items: true },
});
```

### Select apenas o necessário

```typescript
// ❌ Traz todas as colunas
const orders = await prisma.order.findMany({ where: { companyId } });

// ✅ Só o que a UI precisa
const orders = await prisma.order.findMany({
  where: { companyId },
  select: {
    id: true,
    orderNumber: true,
    status: true,
    total: true,
    createdAt: true,
  },
});
```

### Paginação sempre

```typescript
// ❌ Sem limite — quebra com 100k registros
const orders = await prisma.order.findMany({ where: { companyId } });

// ✅ Paginado
export async function listOrders(
  companyId: string,
  { page = 1, pageSize = 20 }: PaginationParams,
): Promise<PaginatedResult<Order>> {
  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where: { companyId, deletedAt: null },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.count({ where: { companyId, deletedAt: null } }),
  ]);

  return {
    data,
    pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  };
}
```

### Cursor pagination para listas grandes

```typescript
// Mais eficiente que offset em tabelas grandes
const orders = await prisma.order.findMany({
  where: { companyId },
  take: 20,
  ...(cursor && { skip: 1, cursor: { id: cursor } }),
  orderBy: { createdAt: "desc" },
});
```

### Índices corretos

```prisma
model Order {
  companyId  String
  status     String
  createdAt  DateTime

  @@index([companyId, status])         // WHERE companyId AND status
  @@index([companyId, createdAt(sort: Desc)])  // ORDER BY createdAt
  @@index([deletedAt])
}
```

**Regra**: toda coluna usada em `WHERE`, `ORDER BY` ou `JOIN` frequente precisa de índice.

## Cache com Redis

```typescript
// lib/cache.ts
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;

  const data = await fetcher();
  await redis.setEx(key, ttlSeconds, JSON.stringify(data));
  return data;
}

// Uso
const products = await cached(`products:${companyId}`, CACHE_TTL.PRODUCTS, () =>
  productRepository.list(companyId),
);
```

### Invalidação

```typescript
export async function invalidateCompanyCache(companyId: string, resource: string) {
  await redis.del(`${resource}:${companyId}`);
}

// Após mutação
await productRepository.create(data);
await invalidateCompanyCache(companyId, "products");
```

### O que cachear

| Dado              | TTL               | Justificativa  |
| ----------------- | ----------------- | -------------- |
| Lista de produtos | 15 min            | Muda pouco     |
| Dados da empresa  | 30 min            | Muda raramente |
| Configurações     | 1 hora            | Quase estático |
| Lista de pedidos  | 1 min ou nada     | Muda muito     |
| Dados de sessão   | Duração da sessão | —              |

**Nunca cacheie** dados sem incluir `companyId` na chave.

## Cache do Next.js

```typescript
// Revalidação por tempo
export const revalidate = 60;

// Revalidação sob demanda
import { revalidatePath, revalidateTag } from "next/cache";

await revalidatePath("/dashboard/orders");
await revalidateTag(`orders-${companyId}`);

// fetch com tags
const res = await fetch(url, {
  next: { tags: [`orders-${companyId}`], revalidate: 60 },
});
```

## TanStack Query

```typescript
export function useOrders(companyId: string, filters: OrderFilters) {
  return useQuery({
    queryKey: ["orders", companyId, filters],
    queryFn: () => fetchOrders(companyId, filters),
    staleTime: 60_000, // considera fresco por 1 min
    gcTime: 5 * 60_000, // mantém em cache por 5 min
    placeholderData: keepPreviousData, // evita flash ao paginar
  });
}
```

## Memoization

```typescript
// Componente puro que renderiza muito
export const OrderRow = memo(function OrderRow({ order }: { order: Order }) {
  return <tr>{/* ... */}</tr>
})

// Cálculo caro
const total = useMemo(
  () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
  [items],
)

// Callback estável passado para filho memoizado
const handleSelect = useCallback((id: string) => setSelected(id), [])
```

⚠️ Não memoize por padrão — só quando houver problema medido. `memo` tem custo.

## Virtualização

Para listas com centenas de itens:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

export function VirtualOrderList({ orders }: { orders: Order[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 5,
  })

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(item => (
          <div
            key={item.key}
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${item.start}px)`,
              height: item.size,
              width: '100%',
            }}
          >
            <OrderRow order={orders[item.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Otimização de Imagens

```typescript
import Image from 'next/image'

// ✅ Sempre next/image
<Image
  src={product.imageUrl}
  alt={product.name}
  width={400}
  height={300}
  quality={80}
  placeholder="blur"
  blurDataURL={product.blurHash}
/>

// Acima da dobra
<Image src={hero} alt="" priority fill />
```

## Bundle Size

```bash
# Analisar bundle
npm install -D @next/bundle-analyzer
ANALYZE=true npm run build
```

```typescript
// ❌ Importa a lib inteira
import _ from "lodash";

// ✅ Só o necessário
import debounce from "lodash/debounce";

// ✅ Melhor ainda: implementação própria pequena
```

## Streaming e Suspense

```typescript
export default async function DashboardPage() {
  return (
    <div>
      <PageHeader />

      <Suspense fallback={<StatsSkeleton />}>
        <StatsCards />       {/* stream quando pronto */}
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <RecentOrders />     {/* stream independente */}
      </Suspense>
    </div>
  )
}
```

## Connection Pooling

```typescript
// lib/db.ts — singleton evita esgotar conexões
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

Em serverless, use pooler (PgBouncer/Neon pooled connection string).

## Checklist

- [ ] Server Components por padrão
- [ ] `'use client'` apenas nas folhas
- [ ] Componentes pesados com dynamic import
- [ ] Toda listagem paginada
- [ ] `select` específico em queries
- [ ] Sem N+1 (usar `include`)
- [ ] Índices em colunas de filtro/ordenação
- [ ] Cache com `companyId` na chave
- [ ] Imagens via `next/image`
- [ ] Suspense para streaming
- [ ] Bundle analisado

---

**Ver também:**

- [Database](../tech-stack/database.md)
- [Frontend](../tech-stack/frontend.md)
