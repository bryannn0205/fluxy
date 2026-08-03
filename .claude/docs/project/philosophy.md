# 🧠 Filosofia de Desenvolvimento

## Pensamento de Escala

Sempre pense como se o sistema tivesse:

```
10 usuários hoje
↓
100.000 usuários amanhã
```

Nunca escreva código pensando apenas em "fazer funcionar".

Pense em:

- **Manutenção** — Como alguém vai manter isto daqui a 2 anos?
- **Crescimento** — Isso aguenta 100x mais dados?
- **Segurança** — Está protegido contra ataques?
- **Facilidade de Evolução** — Como será fácil adicionar features novas?

## Decisões Técnicas

### Antes de Implementar Qualquer Coisa

Faça-se essas perguntas:

1. **Isso escala?**
   - Funciona com 10 mil usuários?
   - Funciona com 100 mil usuários?
   - Funciona com 1 milhão de registros?

2. **Isso é reutilizável?**
   - Posso usar isso em outro contexto?
   - Existe duplicação desnecessária?
   - Pode ser uma função/componente/hook genérico?

3. **Isso é seguro?**
   - Pode vazar dados?
   - Há vulnerabilidades?
   - Está protegido contra força bruta?
   - Valida entrada corretamente?

4. **Isso pode ser simplificado?**
   - Há uma forma mais elegante?
   - Uso muitos abstractions desnecessários?
   - Posso remover linhas sem perder funcionalidade?

5. **Existe duplicação?**
   - Estou repetindo código que já existe?
   - Posso extrair para uma função reutilizável?

6. **Existe uma arquitetura melhor?**
   - É realmente a melhor solução?
   - Existe um padrão que não conheci?
   - Isso cria acoplamento desnecessário?

Se a resposta for **"não"** em qualquer pergunta, **refatore antes de prosseguir**.

## Princípios Fundamentais

### SOLID

- **S**ingle Responsibility — Uma classe = uma responsabilidade
- **O**pen/Closed — Aberto para extensão, fechado para modificação
- **L**iskov Substitution — Derivadas podem substituir a base
- **I**nterface Segregation — Interfaces específicas, não genéricas
- **D**ependency Inversion — Dependa de abstrações, não implementações

### DRY (Don't Repeat Yourself)

- Código duplicado é um erro
- Extraia para functions/components quando repetir
- Centralize lógica comum

### KISS (Keep It Simple, Stupid)

- Prefira simplicidade
- A solução mais complexa nem sempre é a melhor
- Se alguém demora 5 minutos para entender, está muito complexo

### YAGNI (You Aren't Gonna Need It)

- Não implemente features que "podem ser úteis no futuro"
- Implemente apenas o que é necessário agora
- Sobre-engenharia é tão ruim quanto sub-engenharia

## Qualidade sobre Velocidade

### A Regra Ouro

**Nunca escolha a solução mais rápida.**

Escolha a **solução mais profissional**.

| Quando confrontado com...                           | Escolha...   |
| --------------------------------------------------- | ------------ |
| 30 min de gambiarra vs 3 dias de arquitetura sólida | 3 dias       |
| Copy-paste vs abstração reutilizável                | Abstração    |
| Hardcode vs configuração dinâmica                   | Configuração |
| Código rápido vs código legível                     | Legível      |
| Tudo em um arquivo vs modular                       | Modular      |

### Velocidade de Desenvolvimento

A qualidade inicial **pareça lenta**, mas é **extremamente rápida**:

```
Dia 1-3:  Implementação lenta, code review rigorosa
Dia 4-30: Adições rápidas na base sólida
↓
3 meses: Equipe inteira produtiva
vs
Dia 1:    Gambiarras rápidas, sem review
Dia 2-10: Débito técnico acumula
Dia 11:   Novas features demoram 10x mais
↓
3 meses: Atolado em débito técnico
```

## Pedagogia do Código

Seu código é **linguagem**.

Comunique seus pensamentos através de:

- **Nomes significativos** — `getTotalOrderAmount()` não `getTotal()`
- **Estrutura clara** — organização que faz sentido
- **Código auto-explicativo** — não precisa de comentário para entender
- **Funções pequenas** — uma coisa por função
- **Componentes focados** — uma responsabilidade por componente

Um junior deve entender seu código **sem pedir ajuda**.

Se ele precisa perguntar, o código está obscuro.

## O Que NÃO Fazer

### 🚫 Nunca Fazer

- ❌ Usar `any` em TypeScript
- ❌ Usar `@ts-ignore`
- ❌ Duplicar código
- ❌ Gambiarras temporárias
- ❌ Hardcode desnecessário
- ❌ Comentar código morto
- ❌ Funções gigantes (>50 linhas)
- ❌ Arquivos gigantes (>500 linhas)
- ❌ Componentes não reutilizáveis
- ❌ SQL raw quando Prisma resolve

### ✅ Sempre Fazer

- ✅ Tipos completos e específicos
- ✅ Validação de entrada
- ✅ Testes para regras de negócio
- ✅ Separação clara de responsabilidades
- ✅ Composição sobre herança
- ✅ Componentes pequenos e reutilizáveis
- ✅ Logs estruturados
- ✅ Tratamento de erros consistente

## Exemplo: Bom vs Ruim

### ❌ Ruim

```typescript
// Função gigante, faz muita coisa, sem tipos
function process(data: any) {
  // 200 linhas de lógica mista
  if (data.type === "order") {
    // SQL raw
    const res = db.query(`SELECT * FROM orders WHERE ...`);
    // Lógica de validação
    if (res.length > 0) {
      // Lógica de processamento
      // Tudo junto, difícil de testar
    }
  }
}
```

### ✅ Bom

```typescript
// Funções pequenas e específicas
async function processOrder(orderId: string, companyId: string): Promise<void> {
  const order = await orderRepository.findById(orderId, companyId);

  if (!order) {
    throw new OrderNotFoundError();
  }

  validateOrder(order);
  await orderService.process(order);
}

// Tipos explícitos, validação clara, testes fáceis
async function validateOrder(order: Order): Promise<void> {
  const validation = orderValidator.validate(order);
  if (!validation.isValid) {
    throw new OrderValidationError(validation.errors);
  }
}
```

## Mentalidade

Construa o Fluxy como se fosse:

- ✅ Produto principal de uma empresa avaliada em **milhões de reais**
- ✅ Um projeto que será mantido por **décadas**
- ✅ Uma base de código que será lida por **centenas de desenvolvedores**
- ✅ Um sistema que processará **bilhões de transações**
- ✅ Uma plataforma crítica para negócios de clientes

Cada decisão deve refletir esse nível de qualidade.

---

**Ver também:**

- [Mission](./mission.md)
- [Code Standards](../quality/code-standards.md)
- [Architecture Patterns](../architecture/patterns.md)
