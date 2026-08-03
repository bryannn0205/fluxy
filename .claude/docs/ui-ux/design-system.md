# 🎨 Design System

## Filosofia Visual

**Minimalista. Muito espaço. Poucas cores. Moderno.**

### Referências

| Produto      | O que absorver                                     |
| ------------ | -------------------------------------------------- |
| **Stripe**   | Clareza em dados densos, hierarquia tipográfica    |
| **Linear**   | Velocidade percebida, atalhos, densidade elegante  |
| **Vercel**   | Preto e branco com um acento, espaçamento generoso |
| **Notion**   | Simplicidade, foco no conteúdo                     |
| **Supabase** | Dashboards técnicos legíveis                       |
| **Raycast**  | Command palette, interações por teclado            |

**Regra**: usabilidade acima de animações. Se um efeito visual atrapalha a leitura ou a velocidade, remova.

## Cores

Poucas cores, com propósito. Preto/branco/cinza como base, **um** acento.

```css
/* app/globals.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;

    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;

    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;

    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;

    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;

    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;

    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;

    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;

    --success: 142 71% 45%;
    --warning: 38 92% 50%;

    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;

    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
}
```

### Cores Semânticas de Status

```typescript
// lib/constants.ts
export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  PROCESSING: "bg-blue-50 text-blue-700 border-blue-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
};
```

⚠️ Status sempre com **ícone + texto**, nunca só cor.

## Tipografia

```typescript
// app/layout.tsx
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
```

### Escala

| Uso                 | Classe                                  | Tamanho |
| ------------------- | --------------------------------------- | ------- |
| Título de página    | `text-2xl font-semibold tracking-tight` | 24px    |
| Título de seção     | `text-lg font-semibold`                 | 18px    |
| Título de card      | `text-base font-medium`                 | 16px    |
| Corpo               | `text-sm`                               | 14px    |
| Secundário / labels | `text-sm text-muted-foreground`         | 14px    |
| Micro / metadados   | `text-xs text-muted-foreground`         | 12px    |
| Números / IDs       | `font-mono text-sm tabular-nums`        | 14px    |

```tsx
// Valores monetários e numéricos alinham melhor com tabular-nums
<span className="font-mono tabular-nums">R$ 1.234,56</span>
```

## Espaçamento

Escala de 4px. Seja generoso — espaço em branco é parte do design.

| Contexto                     | Espaçamento                 |
| ---------------------------- | --------------------------- |
| Dentro de um componente      | `gap-2` (8px)               |
| Entre elementos relacionados | `gap-4` (16px)              |
| Entre seções                 | `gap-6` / `gap-8` (24/32px) |
| Padding de card              | `p-6` (24px)                |
| Padding de página            | `p-6 lg:p-8`                |
| Container máximo             | `max-w-7xl mx-auto`         |

```tsx
// Layout de página padrão
<div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
  <PageHeader />
  <Card>...</Card>
</div>
```

## Bordas e Elevação

```tsx
// Preferir borda a sombra — mais limpo
<div className="rounded-lg border bg-card">...</div>

// Sombra apenas em elementos flutuantes
<div className="rounded-lg border bg-popover shadow-md">...</div>  // dropdown
<div className="rounded-lg border bg-background shadow-lg">...</div>  // modal
```

| Raio               | Uso                    |
| ------------------ | ---------------------- |
| `rounded-md` (6px) | Botões, inputs, badges |
| `rounded-lg` (8px) | Cards, modais          |
| `rounded-full`     | Avatares, pills        |

## Componentes Base

### Button

```tsx
<Button>Salvar</Button>                          {/* primária */}
<Button variant="secondary">Cancelar</Button>
<Button variant="outline">Filtrar</Button>
<Button variant="ghost">Ver mais</Button>
<Button variant="destructive">Excluir</Button>
<Button variant="link">Saiba mais</Button>

<Button size="sm">Pequeno</Button>
<Button size="icon" aria-label="Excluir"><Trash2 /></Button>
```

**Regra**: uma ação primária por tela/seção. O resto é secundário.

### Card

```tsx
<Card>
  <CardHeader>
    <CardTitle>Pedidos Recentes</CardTitle>
    <CardDescription>Últimos 30 dias</CardDescription>
  </CardHeader>
  <CardContent>{/* ... */}</CardContent>
  <CardFooter>{/* ... */}</CardFooter>
</Card>
```

### Badge de Status

```tsx
interface StatusBadgeProps {
  status: OrderStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const Icon = ORDER_STATUS_ICONS[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        ORDER_STATUS_STYLES[status],
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
```

### PageHeader

```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
```

## Ícones

Lucide Icons, tamanho consistente.

| Contexto          | Tamanho         |
| ----------------- | --------------- |
| Dentro de botão   | `size-4` (16px) |
| Navegação lateral | `size-4`        |
| Empty state       | `size-12`       |
| Badge             | `size-3`        |

```tsx
<Button>
  <Plus className="size-4" aria-hidden="true" />
  Novo Pedido
</Button>
```

## Densidade de Informação

Dashboards empresariais precisam mostrar muito sem parecer poluído.

```tsx
// Tabela: linhas compactas, mas com respiro
<TableRow className="h-12">
  <TableCell className="py-2">...</TableCell>
</TableRow>

// Alinhamento: texto à esquerda, números à direita
<TableHead className="text-right">Total</TableHead>
<TableCell className="text-right font-mono tabular-nums">R$ 1.234,56</TableCell>
```

## Animações

Use com moderação. Transições curtas e funcionais.

| Interação           | Duração |
| ------------------- | ------- |
| Hover / cor         | 150ms   |
| Abrir dropdown      | 150ms   |
| Abrir modal         | 200ms   |
| Transição de página | 200ms   |

```tsx
<button className="transition-colors duration-150 hover:bg-accent">
```

**Não use** parallax, animações de entrada elaboradas ou efeitos que atrasem a interação.

## Utilitário `cn`

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Formatadores

```typescript
// lib/formatters.ts
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}
```

## Checklist Visual

- [ ] Uma ação primária por tela
- [ ] Espaçamento generoso e consistente
- [ ] Bordas em vez de sombras (exceto flutuantes)
- [ ] Números com `font-mono tabular-nums`, alinhados à direita
- [ ] Status com ícone + texto, nunca só cor
- [ ] Ícones com tamanho consistente
- [ ] Transições ≤ 200ms
- [ ] Dark mode funcional
- [ ] Valores formatados em pt-BR

---

**Ver também:**

- [UX Principles](./ux-principles.md)
- [Responsiveness](./responsiveness.md)
- [Accessibility](../features/accessibility.md)
