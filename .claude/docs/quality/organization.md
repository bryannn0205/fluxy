# 🧱 Organização de Código

## Princípios

- Componentes **pequenos**
- Componentes **reutilizáveis**
- Funções **pequenas**
- Arquivos **organizados**
- Separação **clara** de responsabilidades
- Nunca criar arquivos gigantes
- Preferir **composição**

## Componentes React

### Um componente, uma responsabilidade

```typescript
// ❌ Componente gigante fazendo tudo
export function OrdersPage() {
  // 400 linhas: fetch, filtros, tabela, modal, paginação, export...
}

// ✅ Composição de componentes focados
export function OrdersPage() {
  return (
    <PageLayout>
      <PageHeader title="Pedidos" action={<CreateOrderButton />} />
      <OrderFilters />
      <OrderTable />
      <OrderPagination />
    </PageLayout>
  )
}
```

### Extrair quando

- O componente passa de ~150 linhas
- Um bloco de JSX se repete
- Uma parte tem estado próprio e independente
- Você precisa de um nome para explicar o bloco

### Componentes de Apresentação vs Container

```typescript
// Container — busca dados, lida com estado
export function OrderTableContainer() {
  const { data, isLoading, error } = useOrders(companyId)

  if (isLoading) return <TableSkeleton />
  if (error) return <ErrorState onRetry={refetch} />
  if (!data?.length) return <EmptyState />

  return <OrderTable orders={data} />
}

// Apresentação — só renderiza, fácil de testar
interface OrderTableProps {
  orders: Order[]
}

export function OrderTable({ orders }: OrderTableProps) {
  return <table>{/* ... */}</table>
}
```

## Composição sobre Props Booleanas

```typescript
// ❌ Explosão de props booleanas
<Card
  showHeader
  showFooter
  headerTitle="Pedidos"
  footerAction="Salvar"
  isCompact
  hasIcon
/>

// ✅ Composição
<Card>
  <CardHeader>
    <CardTitle>Pedidos</CardTitle>
  </CardHeader>
  <CardContent>{/* ... */}</CardContent>
  <CardFooter>
    <Button>Salvar</Button>
  </CardFooter>
</Card>
```

## Funções

### Uma coisa por função

```typescript
// ❌ Faz muitas coisas
async function processOrder(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error();
  if (order.total <= 0) throw new Error();
  const payment = await asaas.charge(order.total);
  await db.order.update({ where: { id: orderId }, data: { status: "PAID" } });
  await sendEmail(order.customerEmail, "Pedido pago");
  await auditLog("ORDER_PAID", orderId);
}

// ✅ Decomposta
async function processOrder(orderId: string, companyId: string): Promise<Order> {
  const order = await findOrderOrThrow(orderId, companyId);
  validateOrderForPayment(order);

  const payment = await paymentService.charge(order);
  const updated = await orderRepository.markAsPaid(order.id, companyId);

  await notificationService.notifyOrderPaid(updated);
  await auditService.log("ORDER_PAID", updated.id, companyId);

  return updated;
}
```

## Custom Hooks

Extraia lógica com estado para hooks quando ela se repete ou polui o componente.

```typescript
// hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

// hooks/useOrders.ts
export function useOrders(filters: OrderFilters) {
  const search = useDebounce(filters.search);

  return useQuery({
    queryKey: ["orders", { ...filters, search }],
    queryFn: () => fetchOrders({ ...filters, search }),
  });
}
```

## Barrel Exports

```typescript
// services/index.ts
export { OrderService } from "./OrderService";
export { CustomerService } from "./CustomerService";
export { PaymentService } from "./PaymentService";

// Uso
import { OrderService, CustomerService } from "@/services";
```

⚠️ Evite barrel exports em pastas muito grandes — pode prejudicar tree-shaking e criar imports circulares.

## Colocação de Arquivos

| Usado em                  | Onde colocar              |
| ------------------------- | ------------------------- |
| 1 rota apenas             | `app/[rota]/_components/` |
| 2+ rotas                  | `components/`             |
| Lógica de negócio         | `services/`               |
| Acesso a dados            | `repositories/`           |
| Helper puro               | `lib/`                    |
| Estado React reutilizável | `hooks/`                  |

## Constantes e Configuração

```typescript
// lib/constants.ts
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

export const CACHE_TTL = {
  ORDERS: 300,
  CUSTOMERS: 600,
  PRODUCTS: 900,
} as const;

export const ROUTES = {
  DASHBOARD: "/dashboard",
  ORDERS: "/dashboard/orders",
  ORDER_DETAIL: (id: string) => `/dashboard/orders/${id}`,
} as const;
```

## Evitar Imports Circulares

```typescript
// ❌ Circular
// services/OrderService.ts importa CustomerService
// services/CustomerService.ts importa OrderService

// ✅ Extrair para uma terceira camada ou inverter dependência
// Ambos dependem de repositories, não um do outro
```

## Sinais de Código Mal Organizado

| Sinal                        | Ação                           |
| ---------------------------- | ------------------------------ |
| Arquivo com 500+ linhas      | Dividir em módulos             |
| Componente com 10+ props     | Composição ou objeto de config |
| Função com 5+ parâmetros     | Objeto de parâmetros           |
| `utils.ts` com 40 funções    | Dividir por domínio            |
| Import com `../../../..`     | Usar alias `@/`                |
| Mesmo bloco JSX em 3 lugares | Extrair componente             |
| Mesma lógica em 2 services   | Extrair helper compartilhado   |

## Aliases de Import

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

```typescript
// ❌ Caminhos relativos profundos
import { Button } from "../../../components/ui/button";

// ✅ Alias
import { Button } from "@/components/ui/button";
```

---

**Ver também:**

- [Folder Structure](../architecture/folder-structure.md)
- [Code Standards](./code-standards.md)
- [Patterns](../architecture/patterns.md)
