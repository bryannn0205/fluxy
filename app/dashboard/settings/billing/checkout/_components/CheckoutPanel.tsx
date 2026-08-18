"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { iniciarCheckoutAction } from "@/app/dashboard/settings/billing/actions";
import type { BillingInterval } from "@/lib/generated/prisma/enums";

interface CheckoutPanelProps {
  planId: string;
  planName: string;
  billingInterval: BillingInterval;
  precoFormatado: string;
  disponivelParaContratacao: boolean;
}

/**
 * Confirmação antes de ir para o pagamento.
 *
 * **Não pergunta a forma de pagamento.** Pix ou cartão é escolha do cliente
 * dentro da ValidaPay — perguntar aqui duplicaria uma decisão que a página
 * hospedada já apresenta, e obrigaria o Fluxy a conhecer meios de pagamento
 * que ele deliberadamente não processa.
 *
 * O botão só manda abrir a sessão; **nada do que esta tela envia decide preço,
 * plano ou empresa**. O servidor resolve os três — `planId` chega pela URL e é
 * revalidado contra o banco, e `companyId` vem da sessão.
 */
export function CheckoutPanel({
  planId,
  planName,
  billingInterval,
  precoFormatado,
  disponivelParaContratacao,
}: CheckoutPanelProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciarTransicao] = useTransition();

  function irParaPagamento() {
    setErro(null);

    iniciarTransicao(async () => {
      const resultado = await iniciarCheckoutAction({ planId, billingInterval });

      if (resultado.error || !resultado.data?.url) {
        setErro(
          resultado.error ?? "Não foi possível abrir o pagamento. Tente novamente.",
        );
        return;
      }

      // Sai do Fluxy para o ambiente da ValidaPay. `replace` e não `assign`:
      // voltar para esta tela com o botão do navegador reabriria uma segunda
      // ida ao pagamento, e a sessão correta é a que já foi aberta.
      window.location.replace(resultado.data.url);
    });
  }

  if (!disponivelParaContratacao) {
    return (
      <Card>
        <CardContent className="space-y-2">
          <p className="font-medium">Contratação indisponível</p>
          <p className="text-sm text-muted-foreground">
            Este plano ainda não está disponível para contratação. Tente novamente mais
            tarde.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Plano escolhido</p>
          <p className="mt-1 text-lg font-semibold">{planName}</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {precoFormatado}
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <ShieldCheck
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            Você será direcionado para o ambiente seguro da ValidaPay, onde poderá pagar
            com Pix ou cartão de crédito. Seus dados de pagamento não passam pelo Fluxy.
          </p>
        </div>

        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}

        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={irParaPagamento}
          disabled={enviando}
        >
          {enviando ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Abrindo pagamento…
            </>
          ) : (
            <>
              Ir para pagamento
              <ExternalLink className="size-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
