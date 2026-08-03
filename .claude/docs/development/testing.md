# 🧪 Testes

## O Que Testar (Obrigatório)

| Alvo                                          | Obrigatório | Tipo        |
| --------------------------------------------- | ----------- | ----------- |
| **Services** (regras de negócio)              | ✅ Sim      | Unit        |
| **Regras de negócio** críticas                | ✅ Sim      | Unit        |
| **Utilitários** (formatters, helpers)         | ✅ Sim      | Unit        |
| **Fluxos críticos** (auth, pagamento, pedido) | ✅ Sim      | E2E         |
| **Isolamento multi-tenant**                   | ✅ Sim      | Integration |
| Repositories                                  | Recomendado | Integration |
| Componentes de UI complexos                   | Recomendado | Unit        |
| Componentes de apresentação simples           | Não         | —           |

## Stack de Testes

```bash
npm install -D vitest @vitejs/plugin-react
npm install -D @testing-library/react @testing-library/user-event
npm install -D @playwright/test
```

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["services/**", "lib/**", "repositories/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./") },
  },
});
```

## Testes de Service

```typescript
// tests/unit/services/OrderService.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("OrderService", () => {
  let service: OrderService;
  let repository: MockOrderRepository;

  beforeEach(() => {
    repository = new MockOrderRepository();
    service = new OrderService(repository, mockLogger);
  });

  describe("create", () => {
    it("cria pedido com o companyId fornecido", async () => {
      const order = await service.create(validInput, "company-1");

      expect(order.companyId).toBe("company-1");
      expect(order.orderNumber).toBe(validInput.orderNumber);
    });

    it("rejeita número de pedido duplicado na mesma empresa", async () => {
      await service.create({ ...validInput, orderNumber: "PED-001" }, "company-1");

      await expect(
        service.create({ ...validInput, orderNumber: "PED-001" }, "company-1"),
      ).rejects.toThrow(DuplicateOrderError);
    });

    it("permite mesmo número de pedido em empresas diferentes", async () => {
      await service.create({ ...validInput, orderNumber: "PED-001" }, "company-1");

      const order = await service.create(
        { ...validInput, orderNumber: "PED-001" },
        "company-2",
      );

      expect(order.companyId).toBe("company-2");
    });

    it("rejeita pedido sem itens", async () => {
      await expect(
        service.create({ ...validInput, items: [] }, "company-1"),
      ).rejects.toThrow(ValidationError);
    });
  });
});
```

## Testes de Isolamento Multi-tenant

**Estes testes são obrigatórios para todo módulo novo.**

```typescript
// tests/integration/tenant-isolation.test.ts
describe("Isolamento multi-tenant", () => {
  let companyA: Company;
  let companyB: Company;

  beforeEach(async () => {
    companyA = await createTestCompany();
    companyB = await createTestCompany();
  });

  it("não retorna pedidos de outra empresa na listagem", async () => {
    await createOrder({ companyId: companyA.id, orderNumber: "A-001" });
    await createOrder({ companyId: companyB.id, orderNumber: "B-001" });

    const orders = await orderService.list(companyA.id);

    expect(orders.data).toHaveLength(1);
    expect(orders.data[0].orderNumber).toBe("A-001");
  });

  it("não permite buscar pedido de outra empresa por id", async () => {
    const orderB = await createOrder({ companyId: companyB.id });

    const result = await orderService.findById(orderB.id, companyA.id);

    expect(result).toBeNull();
  });

  it("não permite atualizar pedido de outra empresa", async () => {
    const orderB = await createOrder({ companyId: companyB.id });

    await expect(
      orderService.update(orderB.id, companyA.id, { status: "CANCELLED" }),
    ).rejects.toThrow();
  });

  it("não permite excluir pedido de outra empresa", async () => {
    const orderB = await createOrder({ companyId: companyB.id });

    await expect(orderService.delete(orderB.id, companyA.id)).rejects.toThrow();

    const stillExists = await orderService.findById(orderB.id, companyB.id);
    expect(stillExists).not.toBeNull();
  });
});
```

## Testes de Utilitários

```typescript
// tests/unit/lib/formatters.test.ts
describe("formatCurrency", () => {
  it("formata valor em reais", () => {
    expect(formatCurrency(1234.56)).toBe("R$ 1.234,56");
  });

  it("formata zero", () => {
    expect(formatCurrency(0)).toBe("R$ 0,00");
  });

  it("formata valor negativo", () => {
    expect(formatCurrency(-100)).toBe("-R$ 100,00");
  });
});

describe("cnpjSchema", () => {
  it("aceita CNPJ válido com máscara", () => {
    expect(cnpjSchema.parse("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("rejeita CNPJ com dígito verificador inválido", () => {
    expect(() => cnpjSchema.parse("11.222.333/0001-00")).toThrow();
  });
});
```

## Testes de Componentes

Teste comportamento, não implementação.

```typescript
// tests/unit/components/OrderTable.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('OrderTable', () => {
  it('exibe os pedidos fornecidos', () => {
    render(<OrderTable orders={[mockOrder]} />)

    expect(screen.getByText('PED-001')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.500,00')).toBeInTheDocument()
  })

  it('chama onSelect ao clicar em uma linha', async () => {
    const onSelect = vi.fn()
    render(<OrderTable orders={[mockOrder]} onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('row', { name: /PED-001/ }))

    expect(onSelect).toHaveBeenCalledWith(mockOrder)
  })
})
```

```typescript
// Estados obrigatórios
describe('OrderList', () => {
  it('exibe skeleton durante carregamento', () => {
    render(<OrderList isLoading />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('exibe empty state quando não há pedidos', () => {
    render(<OrderList orders={[]} />)
    expect(screen.getByText('Nenhum pedido ainda')).toBeInTheDocument()
  })

  it('exibe error state e permite tentar novamente', async () => {
    const onRetry = vi.fn()
    render(<OrderList error={new Error()} onRetry={onRetry} />)

    await userEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))
    expect(onRetry).toHaveBeenCalled()
  })
})
```

## Testes E2E (Fluxos Críticos)

```typescript
// tests/e2e/orders.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Fluxo de pedidos", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("cria um pedido do início ao fim", async ({ page }) => {
    await page.goto("/dashboard/orders");
    await page.getByRole("button", { name: "Novo Pedido" }).click();

    await page.getByLabel("Número do Pedido").fill("PED-999");
    await page.getByLabel("Cliente").selectOption("Cliente Teste");
    await page.getByRole("button", { name: "Adicionar item" }).click();
    await page.getByLabel("Produto").selectOption("Produto A");
    await page.getByLabel("Quantidade").fill("2");

    await page.getByRole("button", { name: "Criar Pedido" }).click();

    await expect(page.getByText("Pedido criado")).toBeVisible();
    await expect(page.getByText("PED-999")).toBeVisible();
  });

  test("bloqueia acesso a pedido de outra empresa", async ({ page }) => {
    await page.goto("/dashboard/orders/order-de-outra-empresa");
    await expect(page.getByText("não encontrado")).toBeVisible();
  });
});
```

### Fluxos E2E obrigatórios

- [ ] Login com email/senha
- [ ] Login com Google
- [ ] Recuperação de senha
- [ ] Criação de pedido
- [ ] Fluxo de pagamento
- [ ] Tentativa de acesso cross-tenant (deve falhar)

## Helpers de Teste

```typescript
// tests/helpers/db.ts
export async function resetDatabase() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
}

export async function createTestCompany(overrides?: Partial<Company>) {
  return prisma.company.create({
    data: {
      name: `Empresa ${crypto.randomUUID()}`,
      email: `${crypto.randomUUID()}@test.com`,
      ...overrides,
    },
  });
}
```

```typescript
// tests/fixtures/orders.ts
export const mockOrder: Order = {
  id: "order-1",
  companyId: "company-1",
  orderNumber: "PED-001",
  status: "PENDING",
  total: 1500,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  deletedAt: null,
};

export function buildOrder(overrides?: Partial<Order>): Order {
  return { ...mockOrder, ...overrides };
}
```

## Banco de Dados em Testes

**Nunca mocke o banco em testes de integração.** Use um Postgres real.

```typescript
// tests/setup.ts
import { beforeAll, afterEach, afterAll } from "vitest";

beforeAll(async () => {
  execSync("prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
});

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

```yaml
# docker-compose.test.yml
services:
  postgres-test:
    image: postgres:15
    environment:
      POSTGRES_DB: fluxy_test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"
```

## Boas Práticas

### Nomes descritivos

```typescript
// ❌
it("works", () => {});
it("test 1", () => {});

// ✅
it("rejeita pedido com número duplicado na mesma empresa", () => {});
it("permite mesmo número de pedido em empresas diferentes", () => {});
```

### Arrange, Act, Assert

```typescript
it("calcula o total do pedido somando os itens", () => {
  // Arrange
  const items = [
    { quantity: 2, unitPrice: 100 },
    { quantity: 1, unitPrice: 50 },
  ];

  // Act
  const total = calculateOrderTotal(items);

  // Assert
  expect(total).toBe(250);
});
```

### Teste comportamento, não implementação

```typescript
// ❌ Testa detalhe interno
expect(service["repository"].create).toHaveBeenCalled();

// ✅ Testa resultado observável
expect(await service.findById(order.id, companyId)).not.toBeNull();
```

### Um conceito por teste

```typescript
// ❌ Testa várias coisas
it("cria e valida e notifica", () => {});

// ✅ Separado
it("cria o pedido", () => {});
it("rejeita entrada inválida", () => {});
it("envia notificação após criar", () => {});
```

## Checklist

- [ ] Todo Service novo tem testes
- [ ] Toda regra de negócio tem teste
- [ ] Isolamento multi-tenant testado (4 cenários: list, read, update, delete)
- [ ] Utilitários testados incluindo casos limite
- [ ] Fluxos críticos cobertos por E2E
- [ ] Estados de UI (loading, empty, error) testados
- [ ] Testes de integração usam banco real, não mock
- [ ] Nomes de teste descrevem o comportamento
- [ ] Cobertura ≥ 80% em services e lib

---

**Ver também:**

- [Workflow](./workflow.md)
- [Multi-tenant](../architecture/multi-tenant.md)
