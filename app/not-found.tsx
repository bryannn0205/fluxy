import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <FileQuestion className="size-12 text-muted-foreground" aria-hidden="true" />
      <div>
        <h1 className="text-lg font-medium">Página não encontrada</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
      </div>
      <Link href="/dashboard" className={cn(buttonVariants())}>
        Ir para o painel
      </Link>
    </div>
  );
}
