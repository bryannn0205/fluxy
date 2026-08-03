import { Download } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ExportOrdersButtonProps {
  search?: string | undefined;
  status?: string | undefined;
}

/**
 * Âncora de verdade, não botão com `onClick`: o download já vem do
 * `Content-Disposition` da resposta, então o navegador resolve sozinho. Isso
 * mantém o componente no servidor, sem JavaScript, e de quebra habilita
 * "abrir em nova aba" e "copiar endereço" do menu de contexto.
 */
export function ExportOrdersButton({ search, status }: ExportOrdersButtonProps) {
  // Os filtros ativos entram na URL para a planilha sair igual à tela — quem
  // filtrou por "cancelados" espera exportar cancelados, não tudo.
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);

  const query = params.toString();

  return (
    <a
      href={`/api/orders/export${query ? `?${query}` : ""}`}
      className={cn(buttonVariants({ variant: "outline" }))}
    >
      <Download className="size-4" aria-hidden="true" />
      Exportar CSV
    </a>
  );
}
