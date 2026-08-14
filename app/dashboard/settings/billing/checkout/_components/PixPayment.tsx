"use client";

import { useState } from "react";
import { Check, Copy, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PixPaymentProps {
  /** Copia-e-cola. Vem do servidor e serve só para exibir e copiar. */
  emv: string;
  /** Imagem do QR em data URI, quando a API a devolveu. */
  qrCodeImage: string | null;
}

/**
 * Exibição do Pix.
 *
 * **Não fala com a ValidaPay** e não recebe credencial: o código chega pronto
 * do servidor, que é quem tem o token. O componente exibe, copia e nada mais.
 *
 * O `emv` NUNCA vai para log, telemetria ou mensagem de erro — é o código que
 * move dinheiro. Também não é gravado em `localStorage` nem em cookie: vive na
 * memória da página e some com ela.
 */
export function PixPayment({ emv, qrCodeImage }: PixPaymentProps) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(emv);
      setCopiado(true);
      // Volta ao estado normal para o botão poder ser usado de novo, e para a
      // confirmação não ficar na tela sugerindo que a cópia é permanente.
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Área de transferência negada pelo navegador. O código continua
      // visível e selecionável na tela — e o erro NÃO carrega o `emv`.
      setCopiado(false);
    }
  }

  return (
    <div className="space-y-4">
      {qrCodeImage ? (
        // `alt` descreve a função, não a aparência: um leitor de tela não
        // consegue usar o QR, então a saída acessível é o copia-e-cola abaixo.
        //
        // `<img>` e não `next/image`: a imagem é um data URI vindo do gateway,
        // que o otimizador não tem o que otimizar — e passá-la pelo `/_next/image`
        // mandaria o código de pagamento para um serviço de imagens.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrCodeImage}
          alt="QR Code para pagamento via Pix. Use o código copia e cola abaixo como alternativa."
          className="mx-auto size-56 rounded-lg border border-border bg-white p-2"
        />
      ) : (
        <div
          className="mx-auto flex size-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground"
          role="status"
        >
          <QrCode className="size-8" aria-hidden="true" />
          <span className="text-xs">Use o código copia e cola</span>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="pix-copia-e-cola" className="text-sm font-medium text-foreground">
          Código copia e cola
        </label>
        <textarea
          id="pix-copia-e-cola"
          readOnly
          value={emv}
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs break-all"
        />
        <Button type="button" onClick={copiar} variant="outline" className="w-full">
          {copiado ? (
            <>
              <Check className="size-4" aria-hidden="true" />
              Código copiado
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" />
              Copiar código Pix
            </>
          )}
        </Button>
        {/* Texto, não só a troca de ícone: confirmação por cor/ícone sozinha
            não chega a quem usa leitor de tela. */}
        <p role="status" aria-live="polite" className="sr-only">
          {copiado ? "Código Pix copiado para a área de transferência." : ""}
        </p>
      </div>
    </div>
  );
}
