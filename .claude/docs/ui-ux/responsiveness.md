# 📱 Responsividade

## Estratégia: Desktop First

Fluxy é uma ferramenta de trabalho. O uso principal é **desktop**, em telas grandes, com muitos dados visíveis.

Ordem de prioridade:

1. **Desktop** (1280px+) — experiência completa e densa
2. **Tablet** (768–1279px) — layout adaptado
3. **Mobile** (< 768px) — funcional, focado em consulta e ações rápidas

**Regra**: nunca quebrar layout. Se não cabe, adapte — não deixe estourar.

## Breakpoints Tailwind

| Prefixo | Largura | Dispositivo    |
| ------- | ------- | -------------- |
| (base)  | 0px     | Mobile         |
| `sm:`   | 640px   | Mobile grande  |
| `md:`   | 768px   | Tablet         |
| `lg:`   | 1024px  | Laptop         |
| `xl:`   | 1280px  | Desktop        |
| `2xl:`  | 1536px  | Desktop grande |

⚠️ Tailwind é mobile-first nas classes (o prefixo aplica **a partir** daquele tamanho). Desktop-first é a estratégia de **design**, não de escrita de CSS.

```tsx
// Base = mobile, prefixos ampliam
<div className="p-4 md:p-6 lg:p-8">
```

## Layout de Página

```tsx
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar: escondida em mobile, drawer */}
      <Sidebar className="hidden lg:flex lg:w-64 lg:flex-col" />

      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
```

## Sidebar Responsiva

```tsx
export function Navigation() {
  return (
    <>
      {/* Desktop: sidebar fixa */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r">
        <NavContent />
      </aside>

      {/* Mobile/tablet: drawer */}
      <Sheet>
        <SheetTrigger asChild className="lg:hidden">
          <Button variant="ghost" size="icon" aria-label="Abrir menu">
            <Menu className="size-5" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navegação</SheetTitle>
          <NavContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
```

## Tabelas

O maior desafio de responsividade. Duas estratégias:

### Estratégia 1 — Scroll horizontal

```tsx
<div className="w-full overflow-x-auto rounded-lg border">
  <table className="w-full min-w-[720px]">
    {/* colunas mantêm largura mínima legível */}
  </table>
</div>
```

⚠️ O container deve rolar, **nunca a página inteira**.

### Estratégia 2 — Cards em mobile

Melhor UX para tabelas com muitas colunas.

```tsx
export function OrderList({ orders }: { orders: Order[] }) {
  return (
    <>
      {/* Desktop: tabela */}
      <div className="hidden md:block">
        <OrderTable orders={orders} />
      </div>

      {/* Mobile: cards */}
      <div className="space-y-3 md:hidden">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>
    </>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-sm font-medium">#{order.orderNumber}</span>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{order.customerName}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {formatDate(order.createdAt)}
        </span>
        <span className="font-mono text-sm font-medium tabular-nums">
          {formatCurrency(order.total)}
        </span>
      </div>
    </div>
  );
}
```

### Estratégia 3 — Esconder colunas secundárias

```tsx
<TableHead className="hidden lg:table-cell">Criado em</TableHead>
<TableCell className="hidden lg:table-cell">{formatDate(order.createdAt)}</TableCell>
```

## Grid Adaptativo

```tsx
// Cards de métricas
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
  <MetricCard />
  <MetricCard />
  <MetricCard />
  <MetricCard />
</div>

// Layout de conteúdo + sidebar
<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
  <div className="lg:col-span-2">{/* conteúdo principal */}</div>
  <div>{/* sidebar contextual */}</div>
</div>
```

## Formulários

```tsx
// Campos lado a lado no desktop, empilhados no mobile
<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
  <FormField name="firstName" />
  <FormField name="lastName" />
</div>

// Campo que ocupa a linha inteira
<div className="md:col-span-2">
  <FormField name="address" />
</div>
```

### Botões de ação

```tsx
// Mobile: empilhados e full-width. Desktop: em linha à direita.
<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
  <Button variant="outline" className="w-full sm:w-auto">
    Cancelar
  </Button>
  <Button className="w-full sm:w-auto">Salvar</Button>
</div>
```

⚠️ `flex-col-reverse` em mobile coloca a ação primária no topo — mais alcançável com o polegar.

## Modais

```tsx
// Dialog em desktop, drawer em mobile
export function CreateOrderModal({ open, onOpenChange }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>Novo Pedido</DialogTitle>
          <CreateOrderForm />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerTitle>Novo Pedido</DrawerTitle>
        <div className="p-4">
          <CreateOrderForm />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

```typescript
// hooks/useMediaQuery.ts
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);

  return matches;
}
```

## Alvos de Toque

Em mobile, alvos interativos precisam ter no mínimo **44×44px**.

```tsx
// ❌ Muito pequeno para toque
<button className="size-6"><X /></button>

// ✅ Área de toque adequada
<button className="flex size-11 items-center justify-center">
  <X className="size-4" aria-hidden="true" />
</button>
```

## Tipografia Responsiva

```tsx
// Título de página
<h1 className="text-xl font-semibold tracking-tight md:text-2xl">

// Corpo permanece 14px — legível em qualquer tela
<p className="text-sm">
```

⚠️ Nunca use fonte menor que 14px em mobile — iOS dá zoom em inputs com fonte < 16px.

```tsx
// Evita zoom automático no iOS
<Input className="text-base md:text-sm" />
```

## Imagens

```tsx
<Image
  src={product.image}
  alt={product.name}
  width={800}
  height={600}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  className="h-auto w-full"
/>
```

## Overflow: Nunca Quebrar

```tsx
// Texto longo sem quebra
<p className="truncate">{customer.name}</p>
<p className="line-clamp-2">{order.notes}</p>

// URLs e emails longos
<span className="break-all">{email}</span>

// Container que não deixa filho estourar
<div className="min-w-0 flex-1">
  <p className="truncate">{longText}</p>
</div>
```

⚠️ `min-w-0` é necessário em filhos flex para o `truncate` funcionar.

## Testes Manuais

Teste sempre nestes tamanhos:

| Largura | Dispositivo                    |
| ------- | ------------------------------ |
| 375px   | iPhone SE                      |
| 768px   | iPad retrato                   |
| 1024px  | iPad paisagem / laptop pequeno |
| 1440px  | Desktop comum                  |
| 1920px  | Desktop grande                 |

Verifique também:

- Zoom em 200% (acessibilidade)
- Rotação de tablet
- Scroll horizontal indesejado na página

## Checklist

- [ ] Nenhum scroll horizontal na página (só em containers de tabela)
- [ ] Sidebar vira drawer em telas < 1024px
- [ ] Tabelas com scroll container ou versão em cards
- [ ] Botões full-width em mobile, inline em desktop
- [ ] Ação primária acima em mobile (`flex-col-reverse`)
- [ ] Alvos de toque ≥ 44px
- [ ] Inputs com `text-base` em mobile (evita zoom iOS)
- [ ] Textos longos com `truncate` ou `line-clamp`
- [ ] `min-w-0` em filhos flex com truncate
- [ ] Imagens com `sizes` apropriado
- [ ] Testado em 375px, 768px, 1440px
- [ ] Usável com zoom em 200%

---

**Ver também:**

- [Design System](./design-system.md)
- [UX Principles](./ux-principles.md)
- [Accessibility](../features/accessibility.md)
