import "dotenv/config";

import { prepareTestDatabase } from "./helpers/prepare-test-database";

/**
 * globalSetup do Vitest — roda UMA vez, antes de qualquer arquivo de teste.
 *
 * Terceira camada do isolamento, junto com a validação no `vitest.config.ts` e
 * a de `tests/helpers/prisma.ts`. Aqui a garantia é a mais forte das três:
 * além de validar a URL, pergunta ao servidor em qual banco está, como qual
 * usuário e em qual porta, e só então limpa e semeia — numa transação.
 *
 * Deixa `fluxy_test` sempre no mesmo ponto de partida: catálogo de planos e
 * mais nada. É o que torna `npm test` reexecutável — os testes que criam
 * `VerificationToken` não têm teardown próprio (dívida registrada), e sem esta
 * limpeza a segunda execução encontrava resíduo.
 *
 * `import "dotenv/config"` porque o globalSetup pode ser avaliado em contexto
 * próprio; o dotenv não sobrescreve variável já presente, então isto é seguro
 * mesmo quando o config já carregou o `.env`.
 */
export default async function setup(): Promise<void> {
  const { database, usuario, porta, removidas, planos, slugs, fksVerificadas } =
    await prepareTestDatabase();

  const limpeza =
    removidas.length === 0
      ? "nada a limpar"
      : `limpou ${removidas.map((r) => `${r.tabela}=${r.linhas}`).join(", ")}`;

  // Só metadados: banco, usuário, porta, contagens e slugs. Nunca URL ou credencial.
  process.stdout.write(
    `\n[globalSetup] ${usuario}@:${porta}/${database} · ${fksVerificadas} FKs conferidas · ` +
      `${limpeza} · ${planos} planos (${slugs.join(", ")}), demais tabelas vazias\n`,
  );
}
