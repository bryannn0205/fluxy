"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  onRetry?: () => void;
  message?: string;
}

export function ErrorState({ onRetry, message }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 py-16 text-center">
      <AlertCircle className="size-12 text-destructive" aria-hidden="true" />
      <h3 className="mt-4 text-base font-medium">Não foi possível carregar</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {message ??
          "Ocorreu um erro ao buscar os dados. Verifique sua conexão e tente novamente."}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-6">
          <RefreshCw className="size-4" aria-hidden="true" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
