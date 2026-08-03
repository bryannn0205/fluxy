"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // O logger estruturado é server-only (lib/env.ts valida secrets que não
    // existem no navegador) — boundaries de erro rodam no cliente, então o
    // reporte aqui é console mesmo (ou Sentry, quando configurado).
    console.error("Erro no painel:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="size-12 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-medium">Algo deu errado</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Não foi possível carregar esta página.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Código: {error.digest}
        </p>
      )}
      <Button variant="outline" onClick={reset} className="mt-6">
        Tentar novamente
      </Button>
    </div>
  );
}
