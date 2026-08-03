"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Ver nota em app/dashboard/error.tsx sobre por que é console e não logger.
    console.error("Erro na página de relatórios:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="size-12 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-medium">Algo deu errado</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Não foi possível carregar os relatórios.
      </p>
      <Button variant="outline" onClick={reset} className="mt-6">
        Tentar novamente
      </Button>
    </div>
  );
}
