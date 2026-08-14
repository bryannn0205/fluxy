/**
 * Decide se a gravação dos `priceId` da ValidaPay pode acontecer no banco
 * conectado.
 *
 * Módulo próprio, e função PURA, por dois motivos: o script de linha de comando
 * executa ao ser importado — testá-lo direto dispararia a escrita —, e a regra
 * que protege produção não deveria depender de haver um banco para conectar.
 *
 * **Falha fechada.** Os identificadores são específicos de ambiente: os do
 * sandbox, gravados em produção, apontariam cobranças reais para preços de
 * teste. Não existe `--force`, nem variável de escape: quando houver IDs de
 * produção, o procedimento será outro, escrito e aprovado à parte.
 */

/** Único banco onde a escrita é permitida nesta fase. */
export const BANCO_PERMITIDO_PARA_ESCRITA = "fluxy_dev";

export type DecisaoDeAlvo = { permitido: true } | { permitido: false; motivo: string };

export interface AlvoDeEscrita {
  /** Nome do banco REALMENTE conectado (`current_database()`), não o da URL. */
  databaseName: string | null;
  dryRun: boolean;
}

export function avaliarAlvoDeEscrita({
  databaseName,
  dryRun,
}: AlvoDeEscrita): DecisaoDeAlvo {
  // Dry-run não escreve nada: pode inspecionar qualquer alvo.
  if (dryRun) return { permitido: true };

  if (!databaseName) {
    return {
      permitido: false,
      motivo: "não foi possível identificar o banco conectado",
    };
  }

  if (databaseName !== BANCO_PERMITIDO_PARA_ESCRITA) {
    // O NOME do banco entra na mensagem; a URL e a senha, nunca.
    return {
      permitido: false,
      motivo:
        `escrita permitida somente em "${BANCO_PERMITIDO_PARA_ESCRITA}", ` +
        `e o banco conectado é "${databaseName}". ` +
        "Identificadores de preço são específicos de ambiente — gravar os do " +
        "sandbox em outro banco apontaria cobranças para preços de teste.",
    };
  }

  return { permitido: true };
}
