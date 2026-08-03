# ✅ Padrões de Código

## Proibições Absolutas

### 🚫 Nunca usar `any`

```typescript
// ❌ Proibido
function process(data: any) {}
const result: any = await fetch();

// ✅ Correto
function process(data: OrderInput) {}
const result: OrderResponse = await fetch();

// Se realmente não souber o tipo, use unknown + narrowing
function process(data: unknown) {
  if (isOrderInput(data)) {
    // agora data é OrderInput
  }
}
```

### 🚫 Nunca usar `@ts-ignore`

```typescript
// ❌ Proibido
// @ts-ignore
someUntypedThing();

// ✅ Correto — corrija o tipo ou declare corretamente
declare module "untyped-lib" {
  export function someThing(): void;
}
```

### 🚫 Nunca duplicar código

```typescript
// ❌ Proibido
function formatOrderDate(d: Date) {
  return d.toLocaleDateString("pt-BR");
}
function formatInvoiceDate(d: Date) {
  return d.toLocaleDateString("pt-BR");
}

// ✅ Correto
export function formatDate(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}
```

### 🚫 Nunca deixar código morto

```typescript
// ❌ Proibido
// function oldImplementation() {
//   ...
// }

// ✅ Correto — delete. O git guarda o histórico.
```

### 🚫 Nunca hardcode desnecessário

```typescript
// ❌ Proibido
if (user.role === "admin") {
}
const url = "https://api.asaas.com/v3";

// ✅ Correto
if (user.role === UserRole.ADMIN) {
}
const url = env.ASAAS_API_URL;
```

### 🚫 Nunca `console.log` em produção

```typescript
// ❌ Proibido
console.log("order created", order);

// ✅ Correto
logger.info("Order created", { orderId: order.id, companyId });
```

## Nomenclatura

### Variáveis e Funções

```typescript
// ❌ Ruim
const d = new Date();
const arr = orders.filter((o) => o.s === 1);
function calc(a: number, b: number) {}

// ✅ Bom
const createdAt = new Date();
const pendingOrders = orders.filter((order) => order.status === OrderStatus.PENDING);
function calculateOrderTotal(subtotal: number, tax: number): number {}
```

### Booleanos

```typescript
// Prefixos: is, has, can, should
const isActive = true;
const hasPermission = false;
const canEdit = true;
const shouldRevalidate = false;
```

### Funções assíncronas

```typescript
// Verbos que indicam ação
async function fetchOrders() {}
async function createOrder() {}
async function updateOrderStatus() {}
async function deleteOrder() {}
```

### Constantes

```typescript
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_CACHE_TTL = 300;
export const ORDER_STATUSES = ["PENDING", "PROCESSING"] as const;
```

## Tamanho de Funções e Arquivos

| Item             | Limite ideal | Limite máximo              |
| ---------------- | ------------ | -------------------------- |
| Função           | 20 linhas    | 50 linhas                  |
| Componente React | 100 linhas   | 200 linhas                 |
| Arquivo          | 200 linhas   | 400 linhas                 |
| Parâmetros       | 3            | 4 (use objeto acima disso) |

```typescript
// ❌ Muitos parâmetros
function createOrder(
  orderNumber: string,
  customerId: string,
  total: number,
  status: string,
  notes: string,
  companyId: string,
) {}

// ✅ Objeto de parâmetros
interface CreateOrderParams {
  orderNumber: string;
  customerId: string;
  total: number;
  status: OrderStatus;
  notes?: string;
}

function createOrder(params: CreateOrderParams, companyId: string) {}
```

## Early Return

```typescript
// ❌ Nesting profundo
function processOrder(order: Order | null) {
  if (order) {
    if (order.status === "PENDING") {
      if (order.items.length > 0) {
        // lógica aqui, 3 níveis de indentação
      }
    }
  }
}

// ✅ Early return
function processOrder(order: Order | null) {
  if (!order) return;
  if (order.status !== OrderStatus.PENDING) return;
  if (order.items.length === 0) return;

  // lógica aqui, sem indentação extra
}
```

## Imutabilidade

```typescript
// ❌ Mutação
function addItem(order: Order, item: OrderItem) {
  order.items.push(item);
  return order;
}

// ✅ Imutável
function addItem(order: Order, item: OrderItem): Order {
  return {
    ...order,
    items: [...order.items, item],
  };
}
```

## Tratamento de Erros

```typescript
// ❌ Engolir erros
try {
  await createOrder(data);
} catch (e) {
  // silêncio
}

// ❌ Erro genérico
throw new Error("erro");

// ✅ Erros tipados e informativos
try {
  await createOrder(data);
} catch (error) {
  if (error instanceof DuplicateOrderError) {
    return { error: "Já existe um pedido com este número" };
  }
  logger.error("Failed to create order", { error, companyId });
  throw error;
}
```

## Comentários

**Padrão: não escreva comentários.** Código bem nomeado se explica.

Escreva comentário **apenas** quando o _porquê_ não for óbvio:

```typescript
// ✅ Bom — explica uma restrição não óbvia
// Asaas rejeita valores com mais de 2 casas decimais
const amount = Math.round(total * 100) / 100;

// ❌ Ruim — explica o óbvio
// incrementa o contador
counter++;

// ❌ Ruim — documenta o que o código já diz
// Função que cria um pedido
function createOrder() {}
```

## Async/Await

```typescript
// ❌ Promise chains
function getOrder(id: string) {
  return fetch(`/api/orders/${id}`)
    .then((res) => res.json())
    .then((data) => data.order)
    .catch((err) => null);
}

// ✅ async/await
async function getOrder(id: string): Promise<Order | null> {
  try {
    const response = await fetch(`/api/orders/${id}`);
    const data = await response.json();
    return data.order;
  } catch {
    return null;
  }
}
```

### Paralelizar quando independente

```typescript
// ❌ Sequencial desnecessário
const orders = await getOrders(companyId);
const customers = await getCustomers(companyId);

// ✅ Paralelo
const [orders, customers] = await Promise.all([
  getOrders(companyId),
  getCustomers(companyId),
]);
```

## Imports

```typescript
// Ordem: externos → internos → tipos → relativos
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { orderService } from "@/services";

import type { Order } from "@/types/orders";

import { OrderRow } from "./OrderRow";
```

## Checklist de Code Review

- [ ] Sem `any` ou `@ts-ignore`
- [ ] Sem código duplicado
- [ ] Sem código morto ou comentado
- [ ] Sem `console.log`
- [ ] Funções < 50 linhas
- [ ] Arquivos < 400 linhas
- [ ] Nomes descritivos
- [ ] Erros tratados e tipados
- [ ] Queries filtram `companyId`
- [ ] Entradas validadas com Zod
- [ ] Sem comentários desnecessários
- [ ] Imports organizados

---

**Ver também:**

- [Typing](./typing.md)
- [Organization](./organization.md)
- [Validation](./validation.md)
