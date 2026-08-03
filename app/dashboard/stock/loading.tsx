import { Skeleton } from "@/components/ui/skeleton";

export default function StockLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-2 rounded-lg border p-4" role="status" aria-live="polite">
        <span className="sr-only">Carregando estoque</span>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
