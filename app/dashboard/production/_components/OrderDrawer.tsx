"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PriorityBadge } from "@/components/common/PriorityBadge";
import { OrderTimeline } from "@/app/dashboard/orders/[id]/_components/OrderTimeline";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  ROUTES,
} from "@/lib/constants";
import {
  ROTULO_DE_AVANCO,
  proximaEtapa,
} from "@/app/dashboard/production/_components/etapas";
import {
  formatCalendarDate,
  formatCurrency,
  formatDateTime,
  formatDocument,
  formatOrderNumber,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/generated/prisma/client";
import type { ClientOrderDetail } from "@/types/orders";
import { getOrderDetailAction } from "@/app/dashboard/production/actions";
import { updateOrderStatusAction } from "@/app/dashboard/orders/actions";

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      {/* Quebra em vez de truncar: um e-mail ou endereço cortado com
          reticências deixa de ser informação — e o painel tem altura de sobra
          para a linha crescer. */}
      <dd className="mt-0.5 text-sm break-words">{valor}</dd>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground/80 uppercase">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function LinhaDeValor({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 text-sm",
        destaque && "border-t border-border/70 pt-2.5 text-base font-semibold",
      )}
    >
      <span className={cn(!destaque && "text-muted-foreground")}>{rotulo}</span>
      <span className="font-mono tabular-nums">{valor}</span>
    </div>
  );
}

interface OrderDrawerProps {
  orderId: string | null;
  onOpenChange: (aberto: boolean) => void;
  /** Só quem tem `production:updateStage` recebe true — o portão real está no service. */
  podeAvancar: boolean;
  /** Avisa o board para mover o cartão sem recarregar a página. */
  onEtapaAvancada: (orderId: string, novoStatus: OrderStatus) => void;
}

export function OrderDrawer({
  orderId,
  onOpenChange,
  podeAvancar,
  onEtapaAvancada,
}: OrderDrawerProps) {
  const [pedido, setPedido] = useState<ClientOrderDetail | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aba, setAba] = useState<"detalhes" | "atividades">("detalhes");
  const [avancando, setAvancando] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    let cancelado = false;
    setCarregando(true);
    setPedido(null);
    setAba("detalhes");

    void getOrderDetailAction(orderId).then((resultado) => {
      // Descarta a resposta se o painel já foi fechado ou trocou de pedido —
      // sem isso, uma consulta lenta sobrescreveria o pedido aberto depois.
      if (cancelado) return;

      if (resultado.error || !resultado.data) {
        toast.error(resultado.error ?? "Não foi possível carregar o pedido");
        onOpenChange(false);
        setCarregando(false);
        return;
      }

      setPedido(resultado.data);
      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [orderId, onOpenChange]);

  const destino = pedido ? proximaEtapa(pedido.status) : null;

  async function avancar() {
    if (!pedido || !destino) return;

    setAvancando(true);
    const resultado = await updateOrderStatusAction({
      orderId: pedido.id,
      status: destino,
    });
    setAvancando(false);

    if (resultado.error) {
      toast.error(resultado.error);
      return;
    }

    toast.success(`Pedido movido para "${ORDER_STATUS_LABELS[destino]}"`);
    onEtapaAvancada(pedido.id, destino);
    setPedido({ ...pedido, status: destino });
  }

  return (
    <Sheet open={orderId !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[30rem]"
      >
        {carregando || !pedido ? (
          <div className="space-y-4 p-5">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <span className="sr-only" role="status">
              Carregando pedido
            </span>
          </div>
        ) : (
          <>
            <SheetHeader className="gap-3 border-b border-border p-5 pr-14">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono text-lg font-semibold tabular-nums">
                  {formatOrderNumber(pedido.orderNumber)}
                </SheetTitle>
                <PriorityBadge priority={pedido.priority} />
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge status={pedido.status} />
                <span className="truncate font-medium text-foreground">
                  {pedido.customer.name}
                </span>
              </SheetDescription>

              <div
                role="tablist"
                aria-label="Seções do pedido"
                className="mt-1 flex gap-1 rounded-lg border border-border bg-muted/40 p-1"
              >
                {(["detalhes", "atividades"] as const).map((chave) => (
                  <button
                    key={chave}
                    type="button"
                    role="tab"
                    id={`aba-${chave}`}
                    aria-selected={aba === chave}
                    aria-controls={`painel-${chave}`}
                    onClick={() => setAba(chave)}
                    className={cn(
                      "min-h-9 flex-1 rounded-md px-3 text-sm font-medium capitalize transition-colors duration-150",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      aba === chave
                        ? "bg-primary/15 text-[var(--panel-lavender)]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {chave}
                  </button>
                ))}
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {aba === "detalhes" ? (
                <div
                  id="painel-detalhes"
                  role="tabpanel"
                  aria-labelledby="aba-detalhes"
                  className="space-y-4"
                >
                  <Bloco titulo="Cliente">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <Campo rotulo="Nome" valor={pedido.customer.name} />
                      {pedido.customer.document && (
                        <Campo
                          rotulo="CPF/CNPJ"
                          valor={formatDocument(pedido.customer.document)}
                        />
                      )}
                      {pedido.customer.phone && (
                        <Campo rotulo="Telefone" valor={pedido.customer.phone} />
                      )}
                      {pedido.customer.email && (
                        <Campo rotulo="E-mail" valor={pedido.customer.email} />
                      )}
                      {pedido.customer.address && (
                        <Campo rotulo="Endereço" valor={pedido.customer.address} />
                      )}
                    </dl>
                  </Bloco>

                  <Bloco titulo="Pedido">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <Campo
                        rotulo="Criado em"
                        valor={formatDateTime(pedido.createdAt)}
                      />
                      {pedido.expectedDeliveryDate && (
                        <Campo
                          rotulo="Previsão de entrega"
                          valor={formatCalendarDate(pedido.expectedDeliveryDate)}
                        />
                      )}
                      {/* `createdBy` é quem lançou o pedido no sistema. Não é
                          vendedor nem responsável pela produção — o modelo não
                          tem esse dado, e rotular assim seria inventar. */}
                      {pedido.createdBy && (
                        <Campo rotulo="Lançado por" valor={pedido.createdBy.name} />
                      )}
                    </dl>
                  </Bloco>

                  <Bloco titulo={`Itens (${pedido.items.length})`}>
                    <ul className="divide-y divide-border/60">
                      {pedido.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {item.productName}
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {item.quantity} un.
                              {item.unitPrice !== null &&
                                ` × ${formatCurrency(item.unitPrice)}`}
                            </p>
                          </div>
                          {item.total !== null && (
                            <span className="shrink-0 font-mono text-sm tabular-nums">
                              {formatCurrency(item.total)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Bloco>

                  {/* Ausente por completo para papéis sem `orders:viewFinancials`:
                      `financials` é null e nenhum valor chegou ao navegador. */}
                  {pedido.financials && (
                    <Bloco titulo="Resumo financeiro">
                      <div className="space-y-2.5">
                        <LinhaDeValor
                          rotulo="Subtotal"
                          valor={formatCurrency(pedido.financials.subtotal)}
                        />
                        {pedido.financials.discount > 0 && (
                          <LinhaDeValor
                            rotulo="Desconto"
                            valor={`- ${formatCurrency(pedido.financials.discount)}`}
                          />
                        )}
                        {pedido.financials.deliveryFee > 0 && (
                          <LinhaDeValor
                            rotulo="Frete"
                            valor={formatCurrency(pedido.financials.deliveryFee)}
                          />
                        )}
                        {pedido.financials.surcharge > 0 && (
                          <LinhaDeValor
                            rotulo="Acréscimo"
                            valor={formatCurrency(pedido.financials.surcharge)}
                          />
                        )}
                        <LinhaDeValor
                          rotulo="Total"
                          valor={formatCurrency(pedido.financials.total)}
                          destaque
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2.5 text-sm">
                          <span className="text-muted-foreground">Pagamento</span>
                          <span className="text-right">
                            {PAYMENT_STATUS_LABELS[pedido.financials.paymentStatus]}
                            {pedido.financials.paymentMethod && (
                              <span className="text-muted-foreground">
                                {" · "}
                                {PAYMENT_METHOD_LABELS[pedido.financials.paymentMethod]}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </Bloco>
                  )}

                  {/* Só existe quando há texto: um bloco "Observações" vazio
                      ocupa espaço para dizer que não há nada a dizer. */}
                  {pedido.notes && (
                    <Bloco titulo="Observações">
                      <p className="text-sm text-pretty text-muted-foreground">
                        {pedido.notes}
                      </p>
                    </Bloco>
                  )}
                </div>
              ) : (
                <div
                  id="painel-atividades"
                  role="tabpanel"
                  aria-labelledby="aba-atividades"
                >
                  <OrderTimeline auditLogs={pedido.activities} />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-border p-5">
              {podeAvancar && destino && (
                <Button onClick={() => void avancar()} disabled={avancando}>
                  {avancando ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ArrowRight className="size-4" aria-hidden="true" />
                  )}
                  {ROTULO_DE_AVANCO[destino] ??
                    `Mover para ${ORDER_STATUS_LABELS[destino]}`}
                </Button>
              )}
              <Link
                href={ROUTES.ORDER_DETAIL(pedido.id)}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium transition-colors duration-150 hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Ver pedido completo
                <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
