import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Info,
  PackageCheck,
  PackageSearch,
} from "lucide-react";

import { formatCurrency } from "@/lib/formatters";
import { DEFAULT_PLAN_SLUG, PUBLIC_PLAN_NAMES, ROUTES } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { parsePlanIntent } from "@/lib/plan-intent";
import { requireCompany } from "@/lib/session";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { orderService, productService, reportService } from "@/services";
import { DEFAULT_REPORT_PERIOD, REPORT_PERIOD_LABELS } from "@/types/reports";
import type { SalesReport } from "@/types/reports";
import { StatCard } from "@/app/dashboard/_components/StatCard";
import { RevenueChart } from "@/app/dashboard/_components/RevenueChart";
import { PipelineDonut } from "@/app/dashboard/_components/PipelineDonut";
import { RecentOrders, toLinhaDePedido } from "@/app/dashboard/_components/RecentOrders";

export const metadata: Metadata = { title: "Painel" };

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  // A autorização vem daqui e SÓ daqui: sessão, empresa e papel. A query
  // string abaixo não participa desta linha nem de nenhuma decisão de acesso.
  const { companyId, role } = await requireCompany();

  // Duas permissões distintas porque são dois dados distintos: o faturamento
  // agregado do mês é indicador de vendas; o total de cada pedido é valor do
  // pedido. Um papel pode ter um sem o outro.
  //
  // Quem barra de fato é o servidor — `orderService.getStats` já devolve
  // `monthRevenue: null` sem `reports:viewSales`, `reportService` lança para
  // quem não tem a mesma permissão, e o total do pedido some do objeto antes
  // de virar HTML. As checagens aqui decidem o que renderizar; não são o
  // portão.
  const podeVerFaturamento = can(role, "reports", "viewSales");
  const podeVerValorDoPedido = can(role, "orders", "viewFinancials");

  // Usada exclusivamente para uma mensagem. Revalidada mesmo tendo sido
  // gerada por `buildPostAuthUrl` no passo anterior — a URL é do usuário, e
  // ele pode digitar `?plan=pro` sem nunca ter passado por /plans. Fazer isso
  // não muda nada: o plano real da empresa está no banco, e esta variável não
  // toca em plano, limite nem assinatura.
  const params = await searchParams;
  const planIntent = parsePlanIntent({
    plan: params.plan,
    billing: params.billing,
  });
  // Vale para qualquer plano pago escolhido antes do cadastro, não só o Pro:
  // com três planos, um aviso fixo em "Pro" chamaria o Plus pelo nome errado.
  const planoEscolhido =
    planIntent !== null && planIntent.plan !== DEFAULT_PLAN_SLUG
      ? PUBLIC_PLAN_NAMES[planIntent.plan]
      : null;

  const [stats, recentOrders, lowStockProducts, salesReport] = await Promise.all([
    orderService.getStats(companyId, role),
    orderService.list(companyId, { pageSize: 5 }),
    productService.listLowStock(companyId),
    carregarFaturamento(companyId, role, podeVerFaturamento),
  ]);

  const linhasDePedido = recentOrders.data.map((pedido) =>
    toLinhaDePedido(pedido, podeVerValorDoPedido),
  );

  return (
    <div className="space-y-6">
      <div className="pt-1">
        <h1 className="text-[1.75rem] leading-none font-semibold tracking-tight">
          Painel
        </h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          Situação da operação agora.
        </p>
      </div>

      {planoEscolhido && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm"
        >
          <Info
            className="mt-0.5 size-4 shrink-0 text-[var(--panel-lavender)]"
            aria-hidden="true"
          />
          <p>
            <span className="font-medium">{planoEscolhido} selecionado.</span>{" "}
            <span className="text-muted-foreground">
              A cobrança será disponibilizada em breve. Até lá, sua empresa continua no
              teste grátis com os limites do Standard.
            </span>
          </p>
        </div>
      )}

      {stats.overdueCount > 0 && (
        <Alerta
          href={ROUTES.PRODUCTION}
          texto={
            stats.overdueCount === 1
              ? "1 pedido atrasado — a previsão de entrega já passou."
              : `${stats.overdueCount} pedidos atrasados — a previsão de entrega já passou.`
          }
        />
      )}

      {lowStockProducts.length > 0 && (
        <Alerta
          href={ROUTES.STOCK}
          texto={
            lowStockProducts.length === 1
              ? "1 produto com estoque baixo."
              : `${lowStockProducts.length} produtos com estoque baixo.`
          }
        />
      )}

      {/* A grade acompanha o número de cartões: com o faturamento oculto,
          quatro colunas mantêm a linha cheia em vez de deixar um vão. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2",
          podeVerFaturamento ? "xl:grid-cols-5" : "lg:grid-cols-4",
        )}
      >
        {/* `monthRevenue` vem `null` do serviço quando o papel não pode vê-lo;
            a comparação abaixo é o que impede um `formatCurrency(null)`. */}
        {podeVerFaturamento && stats.monthRevenue !== null && (
          <StatCard
            rotulo="Faturamento do mês"
            valor={formatCurrency(stats.monthRevenue)}
            icone={DollarSign}
            destaque
          />
        )}

        <StatCard
          rotulo="Recebidos"
          valor={String(stats.pendingCount)}
          icone={Clock}
          apoio="Aguardando início"
        />
        <StatCard
          rotulo="Em produção"
          valor={String(stats.processingCount)}
          icone={PackageSearch}
          apoio="Em andamento agora"
        />
        <StatCard
          rotulo="Prontos"
          valor={String(stats.readyCount)}
          icone={PackageCheck}
          apoio="Aguardando entrega"
        />
        <StatCard
          rotulo="Pedidos no mês"
          valor={String(stats.monthOrderCount)}
          icone={CheckCircle2}
          apoio="Criados neste mês"
        />
      </div>

      {/* Com faturamento, gráfico e rosca dividem a linha. Sem ele, a rosca
          ocupa metade da largura em vez de esticar sozinha por tudo. */}
      <div className={cn("grid gap-4", salesReport && "lg:grid-cols-[1.6fr_1fr]")}>
        {salesReport && (
          <RevenueChart
            pontos={salesReport.revenueByDay}
            periodo={REPORT_PERIOD_LABELS[DEFAULT_REPORT_PERIOD]}
          />
        )}
        <div className={cn(!salesReport && "lg:max-w-md")}>
          <PipelineDonut
            recebidos={stats.pendingCount}
            emProducao={stats.processingCount}
            prontos={stats.readyCount}
          />
        </div>
      </div>

      <RecentOrders pedidos={linhasDePedido} />
    </div>
  );
}

function Alerta({ href, texto }: { href: string; texto: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200 transition-colors duration-150 hover:bg-amber-400/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      {texto}
    </Link>
  );
}

/**
 * Série de faturamento para o gráfico — ou `null` quando ela não deve existir.
 *
 * O `reportService` LANÇA para papel sem `reports:viewSales`, e é ele o portão.
 * A checagem antes da chamada evita provocar de propósito um erro que já se
 * sabe que virá; não substitui o guard.
 *
 * Falha do relatório não derruba o painel: o resto da tela — contagens, rosca,
 * pedidos recentes — não depende dele, e uma consulta pesada indisponível não
 * pode custar a página inteira.
 */
async function carregarFaturamento(
  companyId: string,
  role: Parameters<typeof orderService.getStats>[1],
  permitido: boolean,
): Promise<SalesReport | null> {
  if (!permitido) return null;

  try {
    return await reportService.getSalesReport(companyId, DEFAULT_REPORT_PERIOD, role);
  } catch (error) {
    logger.error("Falha ao carregar faturamento do painel", { companyId, error });
    return null;
  }
}
