# 🎨 Frontend Stack

## Framework & Runtime

### Next.js 15 + React 19

- **App Router** obrigatório (não Pages Router)
- **Server Components** como padrão
- **Server Actions** para mutations
- **Client Components** apenas quando necessário

## Linguagem & Tipagem

### TypeScript

- ✅ **Totalmente tipado** — sem `any`
- ✅ **Tipos reutilizáveis** — centralizados em `types/`
- ✅ **Interfaces específicas** — nunca genéricas demais
- ✅ Tipos importados como `import type {}`

Exemplo correto:

```typescript
// ❌ Ruim
interface Data {
  value: any;
}

// ✅ Bom
interface OrderData {
  id: string;
  orderNumber: string;
  total: number;
  status: OrderStatus;
}
```

## Styling

### TailwindCSS

- ✅ Utility-first sempre
- ✅ Sem CSS raw desnecessário
- ✅ Extensível via `tailwind.config.js`
- ✅ Componentes reutilizáveis com classes

### shadcn/ui

- ✅ Componentes base de qualidade
- ✅ Customizar conforme design system
- ✅ Nunca modificar internos do shadcn
- ✅ Composição para novas variações

## Componentes & UI

### shadcn/ui + TailwindCSS

Use componentes prontos:

- Button
- Input
- Select
- Dialog
- Dropdown
- Table
- Form (integrado com React Hook Form)
- etc.

### Componentes Custom

Quando necessário criar componentes próprios:

- Pequenos e focados
- Reutilizáveis
- Bem tipados
- Com testes

## Forms & Validação

### React Hook Form

- ✅ Gerenciamento de state de forms
- ✅ Integração perfeita com Zod
- ✅ Validação client-side

### Zod

- ✅ Schemas de validação
- ✅ Type-safe
- ✅ Mensagens de erro customizáveis

Exemplo:

```typescript
const createOrderSchema = z.object({
  orderNumber: z.string().min(1, "Número obrigatório"),
  total: z.number().positive("Valor deve ser positivo"),
  status: z.enum(['pending', 'processing', 'completed']),
})

type CreateOrderInput = z.infer<typeof createOrderSchema>

export function CreateOrderForm() {
  const form = useForm<CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* campos */}
    </form>
  )
}
```

## Data Fetching

### TanStack Query (React Query)

- ✅ Gerenciamento de async state
- ✅ Cache automático
- ✅ Revalidação automática
- ✅ Retry automático

```typescript
export function useOrders(companyId: string) {
  return useQuery({
    queryKey: ["orders", companyId],
    queryFn: async () => {
      const response = await fetch(`/api/orders?companyId=${companyId}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
}
```

## Ícones

### Lucide Icons

- ✅ SVG baseado
- ✅ Componentizado
- ✅ Performático

```typescript
import { Plus, Trash2, Download } from 'lucide-react'

export function OrderActions() {
  return (
    <>
      <Plus size={20} />
      <Trash2 size={20} />
      <Download size={20} />
    </>
  )
}
```

## Animações

### Framer Motion (Raramente)

- ⚠️ Usar **apenas quando realmente necessário**
- ⚠️ Priorizar usabilidade sobre efeitos visuais
- ⚠️ Nunca animar apenas por animar

**Bom uso:**

- Transições suaves entre páginas
- Hover subtle em botões
- Slide de modais

**Evitar:**

- Animações complexas que atraem atenção
- Efeitos que deixam lento
- Parallax e efeitos desnecessários

## Project Structure

```
app/
├── (auth)/                    # Rotas de autenticação
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── forgot-password/page.tsx
├── (dashboard)/               # Rotas autenticadas
│   ├── orders/
│   │   ├── page.tsx          # Listagem
│   │   ├── [id]/page.tsx     # Detalhe
│   │   ├── _components/      # Componentes específicos
│   │   └── actions.ts        # Server Actions
│   ├── settings/
│   └── layout.tsx
├── api/                       # API routes
│   ├── orders/
│   ├── auth/
│   └── webhooks/
└── error.tsx, layout.tsx, etc.

components/
├── ui/                        # shadcn/ui customizado
├── forms/                     # Form components
├── tables/                    # Table components
├── modals/                    # Modal components
└── common/                    # Componentes genéricos

hooks/
├── useOrders.ts
├── useAuth.ts
└── useNotification.ts

lib/
├── utils.ts
├── constants.ts
└── helpers.ts

types/
├── orders.ts
├── auth.ts
├── api.ts
└── common.ts
```

## Performance

- ✅ **Lazy Loading** — importar componentes dinamicamente quando necessário
- ✅ **Dynamic Import** — `next/dynamic` para grandes componentes
- ✅ **Server Components** — renderizar no servidor quando possível
- ✅ **Memoization** — usar `memo()` para componentes puros
- ✅ **Image Optimization** — `next/image` sempre

```typescript
// Lazy load componente pesado
import dynamic from 'next/dynamic'

const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <div>Carregando...</div>,
})

export default function Dashboard() {
  return <HeavyChart />
}
```

## Responsividade

- ✅ **Desktop first** — design para desktop, adaptar para menor
- ✅ **Tailwind responsive** — `md:`, `lg:`, `sm:` classes
- ✅ **Mobile considerar** — não quebrar layout

```typescript
export function OrderTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        {/* Responde bem em mobile */}
      </table>
    </div>
  )
}
```

## Acessibilidade

- ✅ **ARIA labels** — elementos interativos
- ✅ **Semantic HTML** — `<button>`, `<nav>`, `<main>`
- ✅ **Navegação por teclado** — Tab funciona
- ✅ **Contraste** — texto legível
- ✅ **Focus visible** — saber onde você está

---

**Ver também:**

- [Design System](../ui-ux/design-system.md)
- [Code Standards](../quality/code-standards.md)
- [Backend Stack](./backend.md)
