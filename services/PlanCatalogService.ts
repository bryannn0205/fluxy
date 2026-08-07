import { PUBLIC_PLAN_SLUGS } from "@/lib/constants";
import { logger } from "@/lib/logger";
import type { PlanRepository } from "@/repositories/interfaces/PlanRepository";
import { toPublicPlan, type PublicPlan } from "@/types/plans";

/**
 * Catálogo comercial público — a única origem de preço e limite para a landing
 * e para /plans.
 *
 * **É leitura, e só.** Não recebe `companyId`, não consulta sessão, não escreve
 * nada. Um visitante anônimo e o OWNER logado recebem exatamente a mesma
 * resposta, porque não há nada aqui que dependa de quem pergunta. Por isso
 * também não há guard de permissão: negar leitura de tabela de preços a quem
 * ainda não tem conta seria negar a própria venda.
 *
 * O que este service NÃO expõe, por não existir aqui: busca por id, alteração
 * de plano, de preço, de limite, de `Company.planId` e ativação de assinatura.
 * Nenhuma delas tem método — não é uma checagem que possa ser esquecida.
 *
 * **Sem cache nesta etapa, deliberadamente.** Cache de preço tem um modo de
 * falha ruim: mostrar ao interessado um valor que a empresa não pratica mais.
 * A leitura é de duas linhas por índice único, e a estratégia de renderização
 * da página pública ainda não foi decidida — cachear antes disso seria escolher
 * a invalidação sem conhecer o consumidor.
 */
export class PlanCatalogService {
  constructor(private readonly planRepository: PlanRepository) {}

  /**
   * Planos públicos, na ordem comercial, prontos para serializar.
   *
   * **Plano ausente não interrompe a resposta.** Devolve os que existem e
   * registra erro operacional. A alternativa — lançar — derrubaria a página
   * inteira de vendas por causa de uma linha faltando no banco, trocando "uma
   * oferta a menos" por "nenhuma oferta". Preencher com valor padrão seria
   * pior ainda: publicaria um preço que ninguém aprovou.
   *
   * Se as duas linhas faltarem, o retorno é uma lista vazia — e é a página que
   * decide como se comportar sem catálogo, com a informação de que ele está
   * vazio, não com números inventados.
   */
  async listPublicPlans(): Promise<PublicPlan[]> {
    const planos = await this.planRepository.listPublic();

    const ausentes = PUBLIC_PLAN_SLUGS.filter(
      (slug) => !planos.some((plano) => plano.slug === slug),
    );

    if (ausentes.length > 0) {
      logger.error("Plano público ausente no banco", {
        resource: "plan",
        ausentes,
        encontrados: planos.map((plano) => plano.slug),
      });
    }

    return planos.map(toPublicPlan);
  }
}
