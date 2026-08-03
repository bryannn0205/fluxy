# 🎯 Padrões de Arquitetura

## SOLID Principles

### S — Single Responsibility Principle

Uma classe/função tem **uma única razão para mudar**.

```typescript
// ❌ Ruim - Faz muita coisa
class OrderManager {
  createOrder() {}
  sendEmail() {}
  processPayment() {}
  generateInvoice() {}
}

// ✅ Bom - Cada classe uma responsabilidade
class OrderService {
  create(input: CreateOrderInput, companyId: string): Promise<Order> {}
}

class EmailService {
  sendOrderConfirmation(order: Order): Promise<void> {}
}

class PaymentService {
  process(order: Order): Promise<Payment> {}
}
```

### O — Open/Closed Principle

Aberto para **extensão**, fechado para **modificação**.

```typescript
// ✅ Extensível sem modificar
interface PaymentProcessor {
  process(amount: number): Promise<Payment>;
}

class PixProcessor implements PaymentProcessor {
  async process(amount: number) {
    /* PIX */
  }
}

class CreditCardProcessor implements PaymentProcessor {
  async process(amount: number) {
    /* Cartão */
  }
}

class BoletoProcessor implements PaymentProcessor {
  async process(amount: number) {
    /* Boleto */
  }
}

// Adicionar novo tipo sem modificar existentes
class PaymentService {
  constructor(private processor: PaymentProcessor) {}

  async pay(amount: number) {
    return this.processor.process(amount);
  }
}
```

### L — Liskov Substitution

Classes derivadas podem substituir a base sem quebrar.

```typescript
interface Repository<T> {
  findById(id: string, companyId: string): Promise<T | null>;
  create(data: Partial<T>): Promise<T>;
}

// Ambas seguem o contrato
class PrismaOrderRepository implements Repository<Order> {}
class MockOrderRepository implements Repository<Order> {}

// Substituíveis
const repo: Repository<Order> = new PrismaOrderRepository();
```

### I — Interface Segregation

Interfaces específicas, não genéricas.

```typescript
// ❌ Ruim - Interface muito grande
interface Service {
  create(): void;
  read(): void;
  update(): void;
  delete(): void;
  export(): void;
  import(): void;
}

// ✅ Bom - Interfaces específicas
interface Readable<T> {
  findById(id: string, companyId: string): Promise<T | null>;
  findAll(companyId: string): Promise<T[]>;
}

interface Writable<T> {
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
}

interface Deletable {
  delete(id: string, companyId: string): Promise<void>;
}
```

### D — Dependency Inversion

Dependa de **abstrações**, não implementações.

```typescript
// ✅ Depende da interface, não da implementação
class OrderService {
  constructor(
    private repository: OrderRepository, // Interface
    private logger: Logger, // Interface
    private eventBus: EventBus, // Interface
  ) {}

  async create(data: CreateOrderInput, companyId: string) {
    const order = await this.repository.create({ ...data, companyId });
    this.logger.info("Order created", { orderId: order.id });
    await this.eventBus.publish("order.created", order);
    return order;
  }
}

// Injeção de dependência
const orderService = new OrderService(
  new PrismaOrderRepository(prisma),
  new StructuredLogger(),
  new RedisEventBus(redis),
);
```

## DRY (Don't Repeat Yourself)

```typescript
// ❌ Ruim - Duplicação
function calculateOrderTotal(items: OrderItem[]) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function calculateInvoiceTotal(items: InvoiceItem[]) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// ✅ Bom - Reutilizável
interface Priceable {
  price: number;
  quantity: number;
}

function calculateTotal<T extends Priceable>(items: T[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
```

## KISS (Keep It Simple, Stupid)

```typescript
// ❌ Complexo demais
class OrderStateMachine {
  private states = new Map<string, State>();
  private transitions = new Map<string, Transition[]>();
  // 200 linhas de complexidade
}

// ✅ Simples e claro
type OrderStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
```

## YAGNI (You Aren't Gonna Need It)

```typescript
// ❌ Sobre-engenharia
class OrderService {
  // Suporta 5 tipos de exports que ninguém pediu
  exportToCSV() {}
  exportToXML() {}
  exportToJSON() {}
  exportToPDF() {}
  exportToExcel() {}
}

// ✅ Implementar apenas o necessário
class OrderService {
  create(data: CreateOrderInput, companyId: string): Promise<Order> {}
  findById(id: string, companyId: string): Promise<Order | null> {}
  list(companyId: string): Promise<Order[]> {}
}
```

## Repository Pattern

```typescript
// repositories/interfaces/OrderRepository.ts
export interface OrderRepository {
  create(data: CreateOrderData): Promise<Order>;
  findById(id: string, companyId: string): Promise<Order | null>;
  findByCompany(companyId: string, options?: FindOptions): Promise<Order[]>;
  update(id: string, companyId: string, data: UpdateOrderData): Promise<Order>;
  softDelete(id: string, companyId: string): Promise<void>;
  count(companyId: string, filters?: OrderFilters): Promise<number>;
}

// repositories/implementations/PrismaOrderRepository.ts
export class PrismaOrderRepository implements OrderRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateOrderData): Promise<Order> {
    return this.prisma.order.create({ data });
  }

  async findById(id: string, companyId: string): Promise<Order | null> {
    return this.prisma.order.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { items: true },
    });
  }

  async findByCompany(companyId: string, options: FindOptions = {}): Promise<Order[]> {
    const { skip = 0, take = 20, status } = options;

    return this.prisma.order.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(status && { status }),
      },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    await this.prisma.order.updateMany({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    });
  }
}
```

## Service Layer

```typescript
// services/OrderService.ts
export class OrderService {
  constructor(
    private repository: OrderRepository,
    private paymentService: PaymentService,
    private notificationService: NotificationService,
    private logger: Logger,
  ) {}

  async create(
    input: CreateOrderInput,
    companyId: string,
    userId: string,
  ): Promise<Order> {
    this.logger.info("Creating order", { companyId, userId });

    // 1. Validar
    const validation = createOrderSchema.safeParse(input);
    if (!validation.success) {
      throw new ValidationError(validation.error);
    }

    // 2. Regras de negócio
    const existing = await this.repository.findByNumber(input.orderNumber, companyId);
    if (existing) {
      throw new DuplicateOrderError(input.orderNumber);
    }

    // 3. Criar
    const order = await this.repository.create({
      ...validation.data,
      companyId,
      createdBy: userId,
    });

    // 4. Side effects
    await this.notificationService.notifyOrderCreated(order);

    this.logger.info("Order created", { orderId: order.id });

    return order;
  }
}
```

## DTO (Data Transfer Objects)

```typescript
// dtos/CreateOrderDto.ts
export interface CreateOrderDto {
  orderNumber: string;
  customerId: string;
  items: CreateOrderItemDto[];
  notes?: string;
}

export interface CreateOrderItemDto {
  productId: string;
  quantity: number;
  unitPrice: number;
}

// dtos/OrderResponseDto.ts
export interface OrderResponseDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  items: OrderItemResponseDto[];
}

// mappers/OrderMapper.ts
export class OrderMapper {
  static toDto(order: Order): OrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: Number(order.total),
      createdAt: order.createdAt.toISOString(),
      items: order.items.map(this.itemToDto),
    };
  }

  private static itemToDto(item: OrderItem): OrderItemResponseDto {
    return {
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      price: Number(item.price),
    };
  }
}
```

## Dependency Injection

```typescript
// lib/container.ts
class Container {
  private services = new Map<string, any>();

  register<T>(name: string, factory: () => T): void {
    this.services.set(name, factory);
  }

  get<T>(name: string): T {
    const factory = this.services.get(name);
    if (!factory) throw new Error(`Service ${name} not registered`);
    return factory();
  }
}

export const container = new Container();

// Registrar
container.register("prisma", () => prisma);
container.register("logger", () => new StructuredLogger());
container.register(
  "orderRepository",
  () => new PrismaOrderRepository(container.get("prisma")),
);
container.register(
  "orderService",
  () => new OrderService(container.get("orderRepository"), container.get("logger")),
);

// Usar
const orderService = container.get<OrderService>("orderService");
```

## Composition over Inheritance

```typescript
// ❌ Herança - rígida
class BaseService {
  log() {}
  validate() {}
}

class OrderService extends BaseService {
  // Herda tudo, mesmo que não precise
}

// ✅ Composição - flexível
class OrderService {
  constructor(
    private logger: Logger,
    private validator: Validator,
  ) {}

  async create(input: CreateOrderInput) {
    this.validator.validate(input);
    this.logger.info("Creating order");
    // ...
  }
}
```

## Clean Architecture Layers

```
┌─────────────────────────────────────┐
│  Presentation (React Components)     │  ← UI
├─────────────────────────────────────┤
│  Application (Server Actions/API)    │  ← Orchestration
├─────────────────────────────────────┤
│  Domain (Services + Business Rules)  │  ← Business Logic
├─────────────────────────────────────┤
│  Infrastructure (Repositories, DB)   │  ← Data Access
└─────────────────────────────────────┘
```

**Regra**: Camadas superiores dependem de inferiores, nunca o contrário.

---

**Ver também:**

- [Folder Structure](./folder-structure.md)
- [Design Principles](./design-principles.md)
- [Code Standards](../quality/code-standards.md)
