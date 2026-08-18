import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { NotFoundError } from "@/lib/errors";
import { requireCompany } from "@/lib/session";
import { cn } from "@/lib/utils";
import { subscriptionCheckoutService } from "@/services";

export const metadata: Metadata = { title: "Retorno do pagamento" };

interface RetornoPageProps {
  searchParams: Promise<{ checkout?: string; desfecho?: string }>;
}

/**
 * Página de retorno do checkout hospedado.
 *
 * **A URL não prova nada.** A ValidaPay devolve o cliente por `successUrl` ou
 * `failureUrl`, mas quem decide o que mostrar é a consulta ao servidor: o
 * `desfecho` na query nunca é lido, e nem precisa existir para a página
 * funcionar. Alguém que digite `?desfecho=sucesso` à mão vê exatamente o que o
 * estado real disser.
 *
 * A consulta pode ATIVAR, se a fonte oficial confirmar o pagamento — mas quem
 * ativa é o mesmo caminho do webhook e da reconciliação, `GET /v1/charges/:id`
 * com `PAID`. Chegar a esta página nunca é suficiente.
 */
export default async function RetornoDoCheckoutPage({ searchParams }: RetornoPageProps) {
  const { companyId } = await requireCompany();
  const { checkout } = await searchParams;

  if (!checkout) notFound();

  // Escopado à empresa da sessão: uma tentativa de outra empresa não é
  // encontrada, e a página responde como se não existisse.
  const resumo = await subscriptionCheckoutService
    .consultarParaExibicao(checkout, companyId)
    .catch((erro: unknown) => {
      if (erro instanceof NotFoundError) notFound();
      throw erro;
    });

  const estado = ESTADOS[resumo.status];
  const Icone = estado.icone;

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <PageHeader title="Retorno do pagamento" description={estado.descricao} />

      <Card>
        <CardContent className="space-y-6 text-center">
          <Icone className={cn("mx-auto size-12", estado.cor)} aria-hidden="true" />

          <div>
            <p className="text-lg font-semibold">{estado.titulo}</p>
            <p className="mt-2 text-sm text-muted-foreground">{estado.detalhe}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Link
              href={ROUTES.BILLING}
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              Ver minha assinatura
            </Link>

            {/* Só quando ainda dá para pagar: reapresenta a MESMA sessão, nunca
                uma nova. A URL vem do banco, não é remontada aqui. */}
            {resumo.status === "PENDING" && resumo.url && (
              <a
                href={resumo.url}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "w-full",
                )}
              >
                Retomar pagamento
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * O que cada estado da tentativa significa para quem acabou de voltar.
 *
 * `PENDING` é "aguardando", e não "não pago": o pagamento pode ter ocorrido e
 * ainda não ter chegado até nós. Dizer que falhou seria acusar o cliente de
 * algo que a fonte oficial não afirmou.
 */
const ESTADOS = {
  COMPLETED: {
    icone: CheckCircle2,
    cor: "text-emerald-500",
    titulo: "Pagamento confirmado",
    descricao: "Sua assinatura está ativa.",
    detalhe: "Confirmamos o pagamento com a ValidaPay e seu plano já está valendo.",
  },
  PENDING: {
    icone: Clock,
    cor: "text-amber-500",
    titulo: "Aguardando confirmação",
    descricao: "Ainda não recebemos a confirmação do pagamento.",
    detalhe:
      "Se você acabou de pagar, a confirmação pode levar alguns instantes. Esta página pode ser recarregada.",
  },
  FAILED: {
    icone: XCircle,
    cor: "text-destructive",
    titulo: "Pagamento não concluído",
    descricao: "A contratação não foi finalizada.",
    detalhe: "Nenhuma cobrança foi confirmada. Você pode tentar contratar novamente.",
  },
} as const;
