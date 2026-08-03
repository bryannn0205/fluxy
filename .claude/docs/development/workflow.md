# 🔄 Workflow de Desenvolvimento

## Processo Obrigatório

Antes de implementar qualquer funcionalidade, siga estas etapas. **Nunca pule etapas.**

```
1. Explique a estratégia (rapidamente)
   ↓
2. Implemente
   ↓
3. Revise
   ↓
4. Refatore
   ↓
5. Teste
```

### 1. Explicar a Estratégia

Antes de escrever código, exponha em poucas frases:

- O que será construído
- Quais arquivos serão criados/modificados
- Qual a abordagem arquitetural
- Quais trade-offs existem

Isso permite correção de rumo **antes** do custo de implementação.

```
Exemplo:
"Vou criar o módulo de Produtos seguindo o padrão existente de Pedidos:
- prisma/schema.prisma: modelo Product com companyId e índice em (companyId, sku)
- schemas/product.schema.ts: validação Zod
- repositories/: interface + implementação Prisma
- services/ProductService.ts: regra de SKU único por empresa
- app/(dashboard)/products/: página, actions e componentes

Trade-off: vou usar soft delete para preservar histórico de pedidos que
referenciam produtos removidos."
```

### 2. Implementar

Siga a ordem de camadas (de baixo para cima):

```
Schema Prisma → Types/Zod → Repository → Service → Action/API → UI
```

Isso garante que cada camada tem sua dependência pronta.

### 3. Revisar

Antes de considerar concluído, revise o próprio código:

- [ ] Sem `any` ou `@ts-ignore`
- [ ] Todas as queries filtram `companyId`
- [ ] Entradas validadas com Zod no backend
- [ ] Erros tratados e tipados
- [ ] Sem código duplicado
- [ ] Sem código morto ou comentado
- [ ] Funções < 50 linhas, arquivos < 400 linhas
- [ ] Estados de UI: loading, empty, error, success

### 4. Refatorar

Se a revisão apontou problemas, corrija **agora**. Débito técnico não se acumula neste projeto.

Sinais de que precisa refatorar:

- Você copiou e colou um bloco
- Uma função ficou difícil de nomear
- Um arquivo passou de 400 linhas
- Você precisou de um comentário para explicar _o que_ o código faz

### 5. Testar

```bash
npm run type-check
```

```bash
npm run lint
```

```bash
npm run test
```

Para mudanças de UI, **execute a aplicação e use a feature no navegador**. Type-check e testes verificam corretude de código, não de funcionalidade.

## Git

### Commits Pequenos

Um commit = uma mudança lógica coerente.

```
❌ "adiciona módulo de produtos, corrige bug no login, atualiza deps"
✅ "adiciona modelo Product com isolamento por tenant"
✅ "corrige validação de senha no login"
```

### Mensagens Objetivas

Formato: `<tipo>: <descrição no imperativo>`

| Tipo       | Uso                                      |
| ---------- | ---------------------------------------- |
| `feat`     | Nova funcionalidade                      |
| `fix`      | Correção de bug                          |
| `refactor` | Refatoração sem mudança de comportamento |
| `perf`     | Melhoria de performance                  |
| `test`     | Adição ou correção de testes             |
| `docs`     | Documentação                             |
| `chore`    | Build, deps, configuração                |

```
feat: adiciona listagem paginada de produtos
fix: corrige vazamento de dados entre tenants na busca
refactor: extrai OrderMapper para DTOs
perf: adiciona índice composto em (companyId, status)
```

### Nunca Modificar Dezenas de Arquivos Sem Necessidade

Se um commit toca 40 arquivos, provavelmente deveria ser 5 commits.

Exceções legítimas: rename automatizado, formatação de projeto inteiro, geração de migration.

### Branches

```
main                    # produção
├── feat/products       # nova feature
├── fix/tenant-leak     # correção
└── refactor/services   # refatoração
```

Nunca commite direto em `main`.

## Scripts do Projeto

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```

## Antes de Abrir um PR

- [ ] `npm run type-check` passa
- [ ] `npm run lint` passa
- [ ] `npm run test` passa
- [ ] Feature testada manualmente no navegador
- [ ] Migration criada se houve mudança de schema
- [ ] Sem `console.log` remanescente
- [ ] Sem secrets commitados
- [ ] Documentação atualizada se aplicável

## Ordem de Prioridade em Decisões

Quando houver conflito entre objetivos, siga esta ordem:

```
1. Segurança / isolamento de tenant
2. Corretude
3. Manutenibilidade
4. Performance
5. Velocidade de entrega
```

Segurança nunca cede para prazo. Se não dá tempo de fazer seguro, não entrega.

## Quando Propor Melhorias

Você tem autonomia para propor melhorias técnicas. Proponha quando:

- Identificar duplicação estrutural entre módulos
- Notar um padrão que não escala
- Encontrar uma vulnerabilidade
- Ver uma query sem índice adequado
- Perceber acoplamento desnecessário

Proponha **antes** de implementar mudanças grandes fora do escopo pedido.

---

**Ver também:**

- [Testing](./testing.md)
- [Design Principles](../architecture/design-principles.md)
- [Code Standards](../quality/code-standards.md)
