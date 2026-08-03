# 💡 Princípios de UX

## Os Quatro Estados Obrigatórios

**Toda tela que carrega dados precisa tratar quatro estados.** Nenhum é opcional.

```tsx
export function OrderList() {
  const { data, isLoading, error, refetch } = useOrders(companyId);

  if (isLoading) return <OrderListSkeleton />;
  if (error) return <ErrorState onRetry={refetch} />;
  if (!data?.length) return <EmptyState />;

  return <OrderTable orders={data} />;
}
```

### 1. Loading

Use **skeleton** que espelha o layout final — não spinner genérico. Evita layout shift.

```tsx
export function OrderListSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <span className="sr-only">Carregando pedidos</span>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
```

### 2. Empty State

Um empty state bom **explica** e **oferece a próxima ação**.

```tsx
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <Icon className="size-12 text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-4 text-base font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
```

```tsx
// Sem dados ainda
<EmptyState
  icon={Package}
  title="Nenhum pedido ainda"
  description="Crie seu primeiro pedido para começar a acompanhar suas vendas."
  action={<Button><Plus className="size-4" />Criar Pedido</Button>}
/>

// Busca sem resultado — ação diferente
<EmptyState
  icon={SearchX}
  title="Nenhum resultado"
  description="Nenhum pedido corresponde aos filtros aplicados."
  action={<Button variant="outline" onClick={clearFilters}>Limpar filtros</Button>}
/>
```

### 3. Error State

Erro precisa dizer **o que aconteceu** e **o que fazer**.

```tsx
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-16 text-center">
      <AlertCircle className="size-12 text-destructive" aria-hidden="true" />
      <h3 className="mt-4 text-base font-medium">Não foi possível carregar</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Ocorreu um erro ao buscar os dados. Verifique sua conexão e tente novamente.
      </p>
      <Button variant="outline" onClick={onRetry} className="mt-6">
        <RefreshCw className="size-4" aria-hidden="true" />
        Tentar novamente
      </Button>
    </div>
  );
}
```

### 4. Success State

Confirme visualmente toda ação bem-sucedida.

```tsx
toast.success("Pedido criado com sucesso");
toast.success("Pedido #1234 atualizado");
```

## Feedback Visual

### Toast

```tsx
// Sucesso — curto e específico
toast.success("Pedido criado");

// Erro — o que fazer
toast.error("Não foi possível salvar. Tente novamente.");

// Com ação de desfazer
toast.success("Pedido excluído", {
  action: {
    label: "Desfazer",
    onClick: () => restoreOrder(id),
  },
});
```

### Botões em Estado de Carregamento

```tsx
<Button disabled={isSubmitting}>
  {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
  {isSubmitting ? "Salvando..." : "Salvar"}
</Button>
```

⚠️ Sempre desabilite o botão durante o submit — evita duplo envio.

### Optimistic Updates

Para ações rápidas e de baixo risco, atualize a UI antes da confirmação do servidor.

```tsx
const { mutate } = useMutation({
  mutationFn: updateOrderStatus,
  onMutate: async (newStatus) => {
    await queryClient.cancelQueries({ queryKey: ["orders"] });
    const previous = queryClient.getQueryData(["orders"]);

    queryClient.setQueryData(["orders"], (old) =>
      old.map((o) => (o.id === id ? { ...o, status: newStatus } : o)),
    );

    return { previous };
  },
  onError: (_err, _vars, context) => {
    queryClient.setQueryData(["orders"], context.previous);
    toast.error("Não foi possível atualizar o status");
  },
});
```

## Confirmações

Peça confirmação apenas para ações **destrutivas ou irreversíveis**.

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Excluir</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Excluir pedido #1234?</AlertDialogTitle>
      <AlertDialogDescription>
        Esta ação não pode ser desfeita. O pedido e todos os seus itens serão removidos.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Regra**: o título da confirmação nomeia o objeto específico ("Excluir pedido #1234?"), não algo genérico ("Tem certeza?").

### Confirmação por digitação (ações críticas)

```tsx
// Excluir empresa, cancelar assinatura
<Input placeholder="Digite EXCLUIR para confirmar" />
<Button disabled={confirmText !== 'EXCLUIR'}>Excluir empresa</Button>
```

**Prefira desfazer a confirmar** quando a ação é reversível — é menos atrito.

## Atalhos de Teclado

Produtos como Linear e Raycast ganham velocidade com atalhos. Fluxy deve seguir.

| Atalho         | Ação                        |
| -------------- | --------------------------- |
| `Cmd/Ctrl + K` | Command palette             |
| `Cmd/Ctrl + S` | Salvar formulário           |
| `Esc`          | Fechar modal / limpar busca |
| `/`            | Focar busca                 |
| `N`            | Novo item (na listagem)     |
| `?`            | Mostrar atalhos             |

```tsx
// hooks/useKeyboardShortcut.ts
export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options: { meta?: boolean } = {},
) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const metaMatch = options.meta ? e.metaKey || e.ctrlKey : true;
      if (e.key === key && metaMatch) {
        e.preventDefault();
        callback();
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [key, callback, options.meta]);
}
```

### Command Palette

```tsx
<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="Buscar ou executar comando..." />
  <CommandList>
    <CommandEmpty>Nenhum resultado.</CommandEmpty>
    <CommandGroup heading="Navegação">
      <CommandItem onSelect={() => router.push("/dashboard/orders")}>
        <Package className="size-4" aria-hidden="true" />
        Pedidos
      </CommandItem>
    </CommandGroup>
    <CommandGroup heading="Ações">
      <CommandItem onSelect={openCreateOrder}>
        <Plus className="size-4" aria-hidden="true" />
        Novo Pedido
      </CommandItem>
    </CommandGroup>
  </CommandList>
</CommandDialog>
```

## Formulários

### Validação no momento certo

```tsx
const form = useForm({
  resolver: zodResolver(schema),
  mode: "onBlur", // valida ao sair do campo
  reValidateMode: "onChange", // depois do primeiro erro, valida ao digitar
});
```

Não mostre erro enquanto o usuário ainda está digitando pela primeira vez.

### Preservar dados em caso de erro

Nunca limpe o formulário quando o submit falha. O usuário perde o trabalho.

### Autofocus no primeiro campo

```tsx
<Input autoFocus {...field} />
```

### Indicar campos opcionais, não obrigatórios

Se a maioria é obrigatória, marque os **opcionais** — reduz ruído visual.

```tsx
<FormLabel>
  Observações <span className="text-muted-foreground">(opcional)</span>
</FormLabel>
```

## Navegação e Contexto

### Breadcrumbs

```tsx
<Breadcrumb>
  <BreadcrumbItem>
    <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
  </BreadcrumbItem>
  <BreadcrumbSeparator />
  <BreadcrumbItem>
    <BreadcrumbLink href="/dashboard/orders">Pedidos</BreadcrumbLink>
  </BreadcrumbItem>
  <BreadcrumbSeparator />
  <BreadcrumbItem>
    <BreadcrumbPage>#1234</BreadcrumbPage>
  </BreadcrumbItem>
</Breadcrumb>
```

### Estado na URL

Filtros, busca e paginação devem viver na URL — permite compartilhar e voltar.

```tsx
const searchParams = useSearchParams();
const page = Number(searchParams.get("page") ?? 1);
const status = searchParams.get("status");
```

### Preservar posição de scroll ao voltar

Next.js App Router faz isso por padrão em navegação com `<Link>`.

## Microcopy

| ❌ Evite         | ✅ Prefira                         |
| ---------------- | ---------------------------------- |
| "Erro"           | "Não foi possível salvar o pedido" |
| "Sucesso!"       | "Pedido #1234 criado"              |
| "Sem dados"      | "Nenhum pedido ainda"              |
| "Tem certeza?"   | "Excluir pedido #1234?"            |
| "Enviar"         | "Criar Pedido"                     |
| "Campo inválido" | "Email deve conter @"              |

**Regra**: o texto do botão descreve o que vai acontecer, não a mecânica.

## Percepção de Velocidade

- Skeleton em vez de spinner
- Optimistic updates em ações rápidas
- `placeholderData: keepPreviousData` ao paginar (evita flash)
- Prefetch em hover de links
- Streaming com Suspense

```tsx
// Prefetch ao passar o mouse
<Link href={`/orders/${id}`} prefetch>
  Ver detalhes
</Link>
```

## Checklist de UX

- [ ] Loading, empty, error e success tratados
- [ ] Skeleton espelha o layout real
- [ ] Empty state com próxima ação
- [ ] Erro diz o que fazer
- [ ] Toast em toda ação bem-sucedida
- [ ] Botão desabilitado durante submit
- [ ] Confirmação apenas em ações destrutivas
- [ ] Confirmação nomeia o objeto específico
- [ ] Desfazer preferido a confirmar quando reversível
- [ ] Formulário preserva dados em erro
- [ ] Filtros e paginação na URL
- [ ] Atalhos de teclado nas ações frequentes
- [ ] Microcopy específica e em português

---

**Ver também:**

- [Design System](./design-system.md)
- [Accessibility](../features/accessibility.md)
- [Responsiveness](./responsiveness.md)
