# ♿ Acessibilidade

## Princípio

Acessibilidade não é opcional. Um SaaS empresarial precisa ser usável por todos — incluindo usuários de leitor de tela, navegação por teclado e baixa visão.

Alvo: **WCAG 2.1 nível AA**.

## HTML Semântico

```tsx
// ❌ Divs para tudo
<div onClick={handleClick}>Salvar</div>
<div className="header">...</div>

// ✅ Elementos corretos
<button onClick={handleClick}>Salvar</button>
<header>...</header>
<nav aria-label="Navegação principal">...</nav>
<main>...</main>
<aside>...</aside>
```

### Estrutura de headings

```tsx
// Um h1 por página, hierarquia sem pular níveis
<h1>Pedidos</h1>
  <h2>Filtros</h2>
  <h2>Resultados</h2>
    <h3>Pedido #1234</h3>
```

## Navegação por Teclado

Todo elemento interativo deve ser alcançável e acionável via teclado.

| Tecla       | Comportamento esperado        |
| ----------- | ----------------------------- |
| `Tab`       | Próximo elemento focável      |
| `Shift+Tab` | Anterior                      |
| `Enter`     | Ativa botão/link              |
| `Space`     | Ativa botão, marca checkbox   |
| `Esc`       | Fecha modal/dropdown          |
| `Setas`     | Navega em listas, menus, tabs |

```tsx
// ❌ Div clicável sem suporte a teclado
<div onClick={handleClick}>Ação</div>

// ✅ Botão nativo (já funciona com teclado)
<button onClick={handleClick}>Ação</button>

// ✅ Se realmente precisar de div interativa
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }}
>
  Ação
</div>
```

### Focus Trap em Modais

```tsx
// shadcn/ui Dialog (Radix) já implementa focus trap,
// retorno de foco e fechamento por Esc
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogTitle>Criar Pedido</DialogTitle>
    <DialogDescription>Preencha os dados do pedido</DialogDescription>
    {/* ... */}
  </DialogContent>
</Dialog>
```

⚠️ `DialogTitle` é obrigatório para leitores de tela. Se visualmente não quiser exibir, use `VisuallyHidden`.

### Skip Link

```tsx
// app/layout.tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-background focus:px-4 focus:py-2"
>
  Pular para o conteúdo
</a>
<main id="main-content">{children}</main>
```

## Focus Visible

```css
/* Nunca remova o outline sem substituir */
/* ❌ */
*:focus {
  outline: none;
}

/* ✅ Anel de foco visível e consistente */
:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

```tsx
// Tailwind
<button className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none">
  Salvar
</button>
```

## Labels e Formulários

```tsx
// ❌ Sem label
<input placeholder="Email" />

// ✅ Label associado
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// ✅ Com shadcn/ui Form (associação automática)
<FormField
  control={form.control}
  name="email"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl>
        <Input type="email" {...field} />
      </FormControl>
      <FormDescription>Usaremos para enviar notificações</FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

### Erros acessíveis

```tsx
<input
  id="orderNumber"
  aria-invalid={!!error}
  aria-describedby={error ? "orderNumber-error" : undefined}
/>;
{
  error && (
    <p id="orderNumber-error" role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}
```

### Campos obrigatórios

```tsx
<label htmlFor="name">
  Nome <span aria-hidden="true">*</span>
</label>
<input id="name" required aria-required="true" />
```

## ARIA

**Regra de ouro**: prefira HTML semântico. ARIA é o último recurso.

```tsx
// Botão apenas com ícone precisa de nome acessível
<button aria-label="Excluir pedido">
  <Trash2 aria-hidden="true" />
</button>

// Estado de expansão
<button aria-expanded={isOpen} aria-controls="menu-content">
  Menu
</button>
<div id="menu-content" hidden={!isOpen}>...</div>

// Região dinâmica (toasts, notificações)
<div role="status" aria-live="polite">
  {message}
</div>

// Erros críticos
<div role="alert" aria-live="assertive">
  {errorMessage}
</div>

// Loading
<div role="status" aria-live="polite">
  <Spinner aria-hidden="true" />
  <span className="sr-only">Carregando pedidos</span>
</div>
```

### Ícones decorativos

```tsx
// Ícone junto de texto — esconder do leitor de tela
<button>
  <Plus aria-hidden="true" />
  Novo Pedido
</button>
```

## Contraste de Cores

| Elemento                           | Contraste mínimo (AA) |
| ---------------------------------- | --------------------- |
| Texto normal (< 18px)              | 4.5:1                 |
| Texto grande (≥ 18px ou 14px bold) | 3:1                   |
| Componentes de UI (bordas, ícones) | 3:1                   |
| Estado de foco                     | 3:1                   |

```tsx
// ❌ Cinza claro em branco — falha
<p className="text-gray-400">Texto importante</p>

// ✅ Contraste adequado
<p className="text-muted-foreground">Texto secundário</p>  // definido com contraste AA
```

⚠️ Nunca comunique informação **apenas** por cor. Use ícone ou texto junto.

```tsx
// ❌ Só cor
<span className="text-red-500">Cancelado</span>

// ✅ Cor + ícone + texto
<Badge variant="destructive">
  <XCircle aria-hidden="true" />
  Cancelado
</Badge>
```

## Tabelas Acessíveis

```tsx
<table>
  <caption className="sr-only">Lista de pedidos da empresa</caption>
  <thead>
    <tr>
      <th scope="col">Número</th>
      <th scope="col">Cliente</th>
      <th scope="col">Status</th>
      <th scope="col">Total</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">#1234</th>
      <td>Empresa A</td>
      <td>Pendente</td>
      <td>R$ 1.500,00</td>
    </tr>
  </tbody>
</table>
```

## Texto Alternativo

```tsx
// Imagem informativa
<Image src={product.image} alt={`Foto do produto ${product.name}`} />

// Imagem decorativa
<Image src={pattern} alt="" />

// Gráfico — descreva o dado, não a forma
<Chart aria-label="Vendas mensais: crescimento de 15% em julho comparado a junho" />
```

## Movimento Reduzido

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

```tsx
// Framer Motion
import { useReducedMotion } from 'framer-motion'

const shouldReduceMotion = useReducedMotion()

<motion.div animate={{ x: shouldReduceMotion ? 0 : 100 }} />
```

## Classe `sr-only`

```tsx
// Conteúdo apenas para leitores de tela
<span className="sr-only">Carregando</span>
```

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

## Idioma

```tsx
// app/layout.tsx
<html lang="pt-BR">
```

## Ferramentas de Teste

```bash
# Lint de acessibilidade
npm install -D eslint-plugin-jsx-a11y

# Testes automatizados
npm install -D @axe-core/playwright
```

```typescript
// tests/e2e/accessibility.spec.ts
import AxeBuilder from "@axe-core/playwright";

test("página de pedidos sem violações de acessibilidade", async ({ page }) => {
  await page.goto("/dashboard/orders");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
```

### Teste manual

1. Navegue a página inteira **só com o teclado**
2. Verifique se o foco é sempre visível
3. Teste com leitor de tela (NVDA no Windows, VoiceOver no Mac)
4. Aumente o zoom para 200% — o layout deve continuar usável

## Checklist

- [ ] `lang="pt-BR"` no html
- [ ] HTML semântico (button, nav, main, header)
- [ ] Um h1 por página, hierarquia correta
- [ ] Todo interativo alcançável por Tab
- [ ] Foco sempre visível
- [ ] Modais com focus trap e fechamento por Esc
- [ ] Todo input com label associado
- [ ] Erros com `role="alert"` e `aria-describedby`
- [ ] Botões só com ícone têm `aria-label`
- [ ] Ícones decorativos com `aria-hidden`
- [ ] Contraste AA (4.5:1 texto normal)
- [ ] Informação nunca só por cor
- [ ] Imagens com alt apropriado
- [ ] `prefers-reduced-motion` respeitado
- [ ] Skip link presente
- [ ] eslint-plugin-jsx-a11y ativo

---

**Ver também:**

- [UX Principles](../ui-ux/ux-principles.md)
- [Design System](../ui-ux/design-system.md)
