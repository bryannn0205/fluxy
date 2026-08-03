/**
 * O Windows limita a linha de comando a ~8191 caracteres. O lint-staged passa
 * cada arquivo staged como argumento, então um commit grande — o inicial, uma
 * renomeação de pasta, um `prettier` novo passando por tudo — estoura o limite
 * e o pre-commit falha com "Linha de comando muito longa" antes de checar nada.
 * Pular o hook nesses casos é justamente perder a checagem no commit em que ela
 * mais importa.
 *
 * Os lotes são fechados por tamanho acumulado, não por quantidade: o que estoura
 * é o comprimento da linha, e caminhos variam demais para um número fixo de
 * arquivos dar qualquer garantia.
 *
 * A config vive aqui, e não no `package.json`, porque precisa ser código — o
 * lint-staged só passa a lista de arquivos para uma função.
 */

// Folga generosa sobre o teto do Windows: sobra espaço para o interpretador,
// o caminho do executável e a expansão que o shell faz antes de chamar.
const MAX_CARACTERES_POR_LINHA = 6000;

function emLotes(comando, arquivos) {
  const lotes = [];
  let loteAtual = [];
  let comprimento = comando.length;

  for (const arquivo of arquivos) {
    const custo = arquivo.length + 3; // duas aspas e o espaço separador

    if (loteAtual.length > 0 && comprimento + custo > MAX_CARACTERES_POR_LINHA) {
      lotes.push(loteAtual);
      loteAtual = [];
      comprimento = comando.length;
    }

    loteAtual.push(arquivo);
    comprimento += custo;
  }

  if (loteAtual.length > 0) lotes.push(loteAtual);

  return lotes.map(
    (lote) => `${comando} ${lote.map((arquivo) => `"${arquivo}"`).join(" ")}`,
  );
}

const lintStagedConfig = {
  "*.{ts,tsx}": (arquivos) => [
    ...emLotes("eslint --fix", arquivos),
    ...emLotes("prettier --write", arquivos),
  ],
  "*.{json,md,css}": (arquivos) => emLotes("prettier --write", arquivos),
};

export default lintStagedConfig;
