# 📖 Documentação

## Princípio

**Toda funcionalidade importante deve possuir documentação.**

Mas documentação não é comentário. O código bem escrito se explica; a documentação registra o que o código **não consegue** dizer: contratos, decisões, exemplos de uso e restrições externas.

## Regra sobre Comentários no Código

**Padrão: não escreva comentários.**

Escreva **apenas** quando o _porquê_ não for óbvio.

```typescript
// ❌ Explica o óbvio
// incrementa o contador
count++;

// ❌ Descreve o que o código já diz
// Função que cria um pedido
function createOrder() {}

// ✅ Explica uma restrição externa não óbvia
// Asaas rejeita valores com mais de 2 casas decimais
const amount = Math.round(total * 100) / 100;

// ✅ Explica uma decisão contra-intuitiva
// Buscamos antes de criar porque a constraint única não cobre soft-deletes
const existing = await repository.findByNumber(orderNumber, companyId);
```

**Nunca** escreva comentário de múltiplos parágrafos ou blocos de comentário longos dentro de funções.

## O Que Documentar (Obrigatório)

| Alvo                  | Formato                            | Obrigatório |
| --------------------- | ---------------------------------- | ----------- |
| **APIs** (rotas REST) | JSDoc + exemplos                   | ✅ Sim      |
| **Services**          | JSDoc na classe e métodos públicos | ✅ Sim      |
| **Hooks**             | JSDoc com exemplo de uso           | ✅ Sim      |
| Server Actions        | JSDoc curto                        | ✅ Sim      |
| Repositories          | JSDoc na interface                 | Recomendado |
| Componentes públicos  | Props tipadas + exemplo            | Recomendado |
| Funções internas      | Nome descritivo basta              | Não         |

## Documentando APIs

```typescript
/**
 * Lista pedidos da empresa autenticada, com paginação e filtros.
 *
 * @route GET /api/orders
 * @auth Requer sessão válida
 *
 * @query page      - Página (padrão: 1)
 * @query pageSize  - Itens por página (padrão: 20, máx: 100)
 * @query status    - Filtro por status: PENDING | PROCESSING | COMPLETED | CANCELLED
 * @query search    - Busca por número do pedido ou nome do cliente
 *
 * @returns 200 - PaginatedResult<OrderResponseDto>
 * @returns 401 - Não autenticado
 * @returns 400 - Parâmetros inválidos
 *
 * @example
 * GET /api/orders?page=1&pageSize=20&status=PENDING
 *
 * {
 *   "data": [
 *     { "id": "clx...", "orderNumber": "PED-001", "status": "PENDING", "total": 1500 }
 *   ],
 *   "pagination": { "total": 43, "page": 1, "pageSize": 20, "totalPages": 3 }
 * }
 */
export async function GET(request: Request) {}
```

```typescript
/**
 * Cria um novo pedido para a empresa autenticada.
 *
 * @route POST /api/orders
 * @auth Requer sessão válida
 *
 * @body CreateOrderInput
 *
 * @returns 201 - OrderResponseDto
 * @returns 409 - Já existe pedido com este número na empresa
 * @returns 422 - Dados inválidos (campo `fields` detalha os erros)
 *
 * @example Request
 * {
 *   "orderNumber": "PED-001",
 *   "customerId": "clx...",
 *   "items": [{ "productId": "clx...", "quantity": 2, "unitPrice": 750 }]
 * }
 */
export async function POST(request: Request) {}
```

## Documentando Services

```typescript
/**
 * Gerencia o ciclo de vida de pedidos.
 *
 * Todas as operações são escopadas por `companyId` — nunca acessa dados
 * de outra empresa. O `companyId` deve vir sempre da sessão autenticada,
 * nunca da entrada do usuário.
 */
export class OrderService {
  /**
   * Cria um pedido.
   *
   * O número do pedido é único **por empresa** — empresas diferentes podem
   * usar o mesmo número.
   *
   * @param input     - Dados já validados pelo schema Zod
   * @param companyId - Empresa proprietária (da sessão)
   *
   * @throws {DuplicateOrderError}  Já existe pedido com este número na empresa
   * @throws {CustomerNotFoundError} Cliente não existe ou pertence a outra empresa
   * @throws {BlockedCustomerError}  Cliente está bloqueado para novos pedidos
   */
  async create(input: CreateOrderInput, companyId: string): Promise<Order> {}

  /**
   * Altera o status de um pedido, respeitando as transições válidas.
   *
   * Transições permitidas:
   * - PENDING    → PROCESSING | CANCELLED
   * - PROCESSING → COMPLETED  | CANCELLED
   * - COMPLETED  → (final)
   * - CANCELLED  → (final)
   *
   * @throws {InvalidStatusTransitionError} Transição não permitida
   */
  async updateStatus(
    orderId: string,
    companyId: string,
    status: OrderStatus,
  ): Promise<Order> {}
}
```

## Documentando Hooks

```typescript
/**
 * Busca pedidos da empresa com paginação e filtros.
 *
 * A busca textual é debounced em 300ms. Os dados anteriores são mantidos
 * durante a troca de página para evitar flash de loading.
 *
 * @param companyId - Empresa da sessão
 * @param filters   - Filtros de status, busca e paginação
 *
 * @example
 * const { data, isLoading, error } = useOrders(companyId, {
 *   status: 'PENDING',
 *   page: 1,
 * })
 *
 * if (isLoading) return <OrderListSkeleton />
 * if (error) return <ErrorState onRetry={refetch} />
 * if (!data.data.length) return <EmptyState />
 */
export function useOrders(companyId: string, filters: OrderFilters) {}
```

```typescript
/**
 * Retorna o valor após um período sem alterações.
 *
 * @param value - Valor a observar
 * @param delay - Espera em ms (padrão: 300)
 *
 * @example
 * const [search, setSearch] = useState('')
 * const debouncedSearch = useDebounce(search, 500)
 */
export function useDebounce<T>(value: T, delay = 300): T {}
```

## Documentando Componentes

Props tipadas já documentam a interface. Adicione JSDoc quando houver comportamento não óbvio.

```typescript
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  /** Chamado ao clicar em uma linha. Omitir desabilita a interação. */
  onRowClick?: (row: T) => void;
  /** Ativa virtualização. Use acima de ~200 linhas. */
  virtualized?: boolean;
}

/**
 * Tabela genérica com ordenação, seleção e paginação.
 *
 * Em telas < 768px, renderize `<DataCards />` no lugar — esta tabela
 * usa scroll horizontal, que é aceitável mas não ideal em mobile.
 *
 * @example
 * <DataTable
 *   data={orders}
 *   columns={orderColumns}
 *   onRowClick={order => router.push(`/orders/${order.id}`)}
 * />
 */
export function DataTable<T>({ data, columns, onRowClick }: DataTableProps<T>) {}
```

## README de Módulo

Para módulos complexos, um `README.md` na pasta.

```markdown
# Módulo de Pagamentos

Integração com Asaas para cobranças e assinaturas.

## Fluxo de Cobrança

1. `PaymentService.createCharge()` cria a cobrança no Asaas
2. Asaas retorna URL de pagamento (PIX/boleto) ou processa cartão
3. Webhook `POST /api/webhooks/asaas` recebe a confirmação
4. `PaymentService.confirmPayment()` atualiza o pedido para PAID
5. `NotificationService` envia email ao cliente

## Estados de Pagamento

PENDING → CONFIRMED → RECEIVED
→ OVERDUE
→ REFUNDED

## Variáveis de Ambiente

| Variável              | Descrição                     |
| --------------------- | ----------------------------- |
| `ASAAS_API_KEY`       | Chave da API                  |
| `ASAAS_ENV`           | `sandbox` ou `production`     |
| `ASAAS_WEBHOOK_TOKEN` | Token de validação do webhook |

## Webhooks

O endpoint valida o header `asaas-access-token` antes de processar.
Eventos não reconhecidos retornam 200 (evita retry infinito do Asaas).

## Gotchas

- Asaas rejeita valores com mais de 2 casas decimais
- Webhooks podem chegar fora de ordem — sempre verifique o estado atual
- Sandbox não envia webhooks de assinatura recorrente automaticamente
```

## Documentando Decisões (ADR)

Para decisões arquiteturais relevantes, registre em `docs/decisions/`.

```markdown
# ADR 001 — Soft Delete em vez de Hard Delete

**Data:** 2026-08-01
**Status:** Aceito

## Contexto

Pedidos excluídos ainda são referenciados por relatórios financeiros e
auditoria fiscal. A legislação exige retenção de 5 anos.

## Decisão

Usar soft delete (`deletedAt`) em todas as entidades de negócio.
Hard delete apenas em dados temporários (sessões, tokens de verificação).

## Consequências

**Positivas**

- Histórico preservado para auditoria
- Recuperação de exclusões acidentais
- Relatórios permanecem consistentes

**Negativas**

- Toda query precisa filtrar `deletedAt: null` — risco de esquecer
- Constraints únicas precisam considerar registros deletados
- Crescimento contínuo das tabelas

## Mitigações

- Índice em `deletedAt` em todas as tabelas
- Teste de isolamento verifica que registros deletados não aparecem
- Job de arquivamento após 5 anos (a implementar)
```

## Documentação de Setup

```markdown
# Fluxy — Setup Local

## Pré-requisitos

- Node.js 20+
- Docker (Postgres e Redis)

## Passos

1. Instale as dependências
   npm install

2. Copie as variáveis de ambiente
   cp .env.example .env.local

3. Suba os serviços
   docker compose up -d

4. Rode as migrations
   npm run db:migrate

5. Popule o banco
   npm run db:seed

6. Inicie o servidor
   npm run dev

Acesse http://localhost:3000

## Credenciais de Teste

Email: admin@teste.com
Senha: Teste@123
```

Mantenha `.env.example` sempre atualizado com todas as variáveis (sem valores reais).

## O Que NÃO Documentar

- ❌ Comentários que repetem o nome da função
- ❌ Documentos de planejamento ou análise (use o histórico de PRs)
- ❌ Changelog manual (o git log é a fonte)
- ❌ Estrutura de pastas duplicada da realidade (fica desatualizada)
- ❌ Referências a tarefas ou PRs no código (`// adicionado para issue #123`)

## Manutenção

Documentação desatualizada é pior que documentação ausente.

**Regra**: se você mudou o comportamento, atualize a documentação **no mesmo commit**.

| Mudança                      | Atualizar               |
| ---------------------------- | ----------------------- |
| Assinatura de método público | JSDoc do método         |
| Novo endpoint                | JSDoc da rota           |
| Nova variável de ambiente    | `.env.example` + README |
| Novo fluxo de integração     | README do módulo        |
| Decisão arquitetural         | Novo ADR                |

## Checklist

- [ ] Toda rota de API com JSDoc (params, returns, erros, exemplo)
- [ ] Todo Service público com JSDoc (throws documentados)
- [ ] Todo Hook com JSDoc e exemplo de uso
- [ ] Módulos complexos com README
- [ ] Decisões arquiteturais registradas como ADR
- [ ] `.env.example` completo
- [ ] Zero comentários redundantes no código
- [ ] Documentação atualizada no mesmo commit da mudança

---

**Ver também:**

- [Code Standards](../quality/code-standards.md)
- [Workflow](./workflow.md)
