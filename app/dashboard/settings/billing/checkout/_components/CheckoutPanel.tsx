"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";

import {
  iniciarCheckoutAction,
  recuperarCheckoutAction,
} from "@/app/dashboard/settings/billing/actions";
import { CheckoutStatusPoller } from "@/app/dashboard/settings/billing/checkout/_components/CheckoutStatusPoller";
import { PixPayment } from "@/app/dashboard/settings/billing/checkout/_components/PixPayment";
import {
  aguardandoPagamento,
  type EstadoDoCheckout,
} from "@/app/dashboard/settings/billing/checkout/_components/estado";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BillingInterval } from "@/lib/generated/prisma/enums";

interface CheckoutPanelProps {
  planId: string;
  planName: string;
  billingInterval: BillingInterval;
  /** Formatado no servidor — a tela não recalcula preço. */
  precoFormatado: string;
  /**
   * `false` quando o plano ainda não tem preço na ValidaPay. Decidido no
   * servidor, a partir do banco: a tela nunca cria produto nem preço.
   */
  disponivelParaContratacao: boolean;
}

interface DadosPix {
  emv: string;
  qrCodeImage: string | null;
}

export function CheckoutPanel({
  planId,
  planName,
  billingInterval,
  precoFormatado,
  disponivelParaContratacao,
}: CheckoutPanelProps) {
  const [estado, setEstado] = useState<EstadoDoCheckout>(
    disponivelParaContratacao ? "IDLE" : "PLAN_UNAVAILABLE",
  );
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [pix, setPix] = useState<DadosPix | null>(null);
  const [mensagemDeErro, setMensagemDeErro] = useState<string | null>(null);
  const [emAndamento, iniciarTransicao] = useTransition();

  function iniciar() {
    setMensagemDeErro(null);
    setEstado("INICIANDO");

    iniciarTransicao(async () => {
      const resultado = await iniciarCheckoutAction({ planId, billingInterval });

      if (resultado.data) {
        setCheckoutId(resultado.data.checkoutId);
        setPix(resultado.data.pix);
        setEstado(resultado.data.pix ? "PENDING" : "TIMEOUT_RECOVERABLE");
        return;
      }

      // A action já devolve mensagem destinada ao usuário; o erro técnico
      // ficou no log do servidor. Não há detalhe de gateway nesta tela.
      setMensagemDeErro(resultado.error ?? "Não foi possível iniciar a contratação.");
      setEstado("TIMEOUT_RECOVERABLE");
    });
  }

  function recuperar() {
    if (!checkoutId) {
      // Sem tentativa registrada não há o que recuperar — recomeçar aqui
      // criaria uma segunda tentativa, exatamente o que se quer evitar.
      iniciar();
      return;
    }

    setMensagemDeErro(null);

    iniciarTransicao(async () => {
      // MESMA tentativa: o service reusa o `externalId` determinístico e
      // recupera o `chargeId` original por 409, sem cobrar duas vezes.
      const resultado = await recuperarCheckoutAction(checkoutId);

      if (resultado.data) {
        setPix(resultado.data.pix);
        setEstado(resultado.data.pix ? "PENDING" : "TIMEOUT_RECOVERABLE");
        return;
      }

      setMensagemDeErro(
        resultado.error ?? "Ainda não foi possível confirmar a cobrança.",
      );
      setEstado("TIMEOUT_RECOVERABLE");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">{planName}</h2>
          <span className="text-sm text-muted-foreground">{precoFormatado}</span>
        </div>

        {estado === "PLAN_UNAVAILABLE" && (
          <p
            role="status"
            className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-medium">
                Contratação temporariamente indisponível.
              </span>{" "}
              Este plano ainda não está liberado para pagamento online. Nenhuma alteração
              foi feita na sua assinatura.
            </span>
          </p>
        )}

        {estado === "IDLE" && (
          <Button type="button" onClick={iniciar} className="w-full">
            Gerar cobrança Pix
          </Button>
        )}

        {estado === "INICIANDO" && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Gerando a cobrança…
          </p>
        )}

        {estado === "PENDING" && pix && (
          <>
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Clock className="size-4 shrink-0" aria-hidden="true" />
              Aguardando o pagamento. A confirmação aparece aqui automaticamente.
            </p>
            <PixPayment emv={pix.emv} qrCodeImage={pix.qrCodeImage} />
          </>
        )}

        {estado === "TIMEOUT_RECOVERABLE" && (
          <div
            role="status"
            className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <p className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium">
                  Não conseguimos confirmar a criação da cobrança ainda.
                </span>{" "}
                {mensagemDeErro ??
                  "Isso não significa que algo deu errado — pode ser só demora."}
              </span>
            </p>
            <Button
              type="button"
              onClick={recuperar}
              disabled={emAndamento}
              variant="outline"
              className="w-full"
            >
              {emAndamento ? "Verificando…" : "Tentar novamente"}
            </Button>
          </div>
        )}

        {estado === "COMPLETED" && (
          <p
            role="status"
            className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-medium">Pagamento confirmado.</span> Seu plano já está
              ativo.
            </span>
          </p>
        )}

        {estado === "FAILED" && (
          <p
            role="status"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm"
          >
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <span>
              <span className="font-medium">
                Não foi possível concluir a contratação.
              </span>{" "}
              Nenhuma cobrança foi confirmada. Tente novamente a partir da tela de planos.
            </span>
          </p>
        )}

        {checkoutId && (
          <CheckoutStatusPoller
            checkoutId={checkoutId}
            ativo={aguardandoPagamento(estado)}
            onEstado={setEstado}
          />
        )}
      </CardContent>
    </Card>
  );
}
