import { cn } from "@/lib/utils";

interface FluxyLogoProps {
  /** Oculta o nome e deixa só a marca — para espaços estreitos. */
  markOnly?: boolean;
  className?: string;
}

/**
 * Marca do Fluxy.
 *
 * SVG inline, e não `<Image>`, por três razões: são poucos bytes, aparece em
 * quase toda tela (cabeçalho, navegação, telas de acesso) e precisa herdar a
 * cor do contexto — `currentColor` faz a marca acompanhar tema claro/escuro e
 * qualquer `text-*` de quem a envolve, sem uma segunda cópia do arquivo.
 *
 * Quando existir um arquivo de marca definitivo, ele entra aqui dentro e mais
 * lugar nenhum.
 *
 * A marca é decorativa: o nome ao lado já é texto legível por leitor de tela.
 * Em `markOnly` o SVG passa a ser o único conteúdo e ganha rótulo próprio.
 */
export function FluxyLogo({ markOnly = false, className }: FluxyLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        className="size-6 shrink-0 text-primary"
        role={markOnly ? "img" : undefined}
        aria-label={markOnly ? "Fluxy" : undefined}
        aria-hidden={markOnly ? undefined : "true"}
      >
        {/* Três barras que encurtam e deslizam para a direita: a ideia de fluxo
            e a silhueta de um "F" na mesma forma. */}
        <rect x="3.5" y="4" width="17" height="4" rx="2" fill="currentColor" />
        <rect
          x="6.5"
          y="10"
          width="12"
          height="4"
          rx="2"
          fill="currentColor"
          opacity="0.72"
        />
        <rect
          x="9.5"
          y="16"
          width="7"
          height="4"
          rx="2"
          fill="currentColor"
          opacity="0.45"
        />
      </svg>
      {!markOnly && <span className="text-lg font-bold tracking-tight">Fluxy</span>}
    </span>
  );
}
