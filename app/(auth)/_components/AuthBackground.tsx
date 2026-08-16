/**
 * Atmosfera das telas de acesso.
 *
 * **Construída em CSS e SVG, não a partir de um arquivo de imagem.** Nenhum
 * asset de fundo existe no repositório (`public/` traz só os SVGs que vieram do
 * `create-next-app`), e a própria referência descreve o fundo como um conjunto
 * de camadas — degradês radiais nos cantos, linhas curvas de baixa opacidade,
 * pontos de luz, padrão de pontos nas laterais e esferas com sombreamento.
 * Todas se desenham melhor em vetor: pesam alguns bytes, permanecem nítidas em
 * qualquer densidade e acompanham a paleta por token, sem uma segunda versão
 * do arquivo para o dia em que o roxo mudar.
 *
 * Se um fundo fotográfico definitivo aparecer, ele entra aqui — e só aqui.
 *
 * Nenhuma camada usa `filter: blur()`: desfoque em área grande é caro para
 * rasterizar, e o sombreamento das esferas sai igual com degradê descentrado.
 *
 * Tudo é decorativo: `aria-hidden` e sem captura de ponteiro, para não entrar
 * na ordem de leitura nem roubar clique do formulário.
 */
export function AuthBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Degradê radial principal — canto superior esquerdo. */}
      <div className="absolute top-[-22%] left-[-18%] size-[46rem] [background:radial-gradient(50%_50%_at_50%_50%,var(--auth-glow)_0%,transparent_70%)]" />

      {/* Secundário — canto inferior direito, mais discreto. */}
      <div className="absolute right-[-16%] bottom-[-24%] size-[40rem] opacity-80 [background:radial-gradient(50%_50%_at_50%_50%,var(--auth-glow)_0%,transparent_70%)]" />

      {/* Padrão de pontos, só nas laterais e só onde há espaço sobrando: no
          celular ele ficaria atrás do cartão, competindo com o formulário. */}
      <div
        className="absolute inset-y-0 left-0 hidden w-64 opacity-[0.35] lg:block"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(167,139,250,0.5) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "linear-gradient(to right, black, transparent)",
          WebkitMaskImage: "linear-gradient(to right, black, transparent)",
        }}
      />
      <div
        className="absolute inset-y-0 right-0 hidden w-64 opacity-[0.35] lg:block"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(167,139,250,0.5) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "linear-gradient(to left, black, transparent)",
          WebkitMaskImage: "linear-gradient(to left, black, transparent)",
        }}
      />

      {/* Linhas curvas e pontos de luz. `preserveAspectRatio="none"` deixaria
          os círculos ovais, então a arte é esticada só na horizontal via
          viewBox largo, e os pontos ficam sobre as curvas. */}
      <svg
        className="absolute inset-0 hidden size-full sm:block"
        viewBox="0 0 1440 900"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          d="M-60 250 C 220 120, 520 300, 780 170 S 1260 40, 1500 150"
          stroke="rgba(167,139,250,0.16)"
          strokeWidth="1"
        />
        <path
          d="M-60 420 C 260 300, 540 470, 820 330 S 1280 220, 1500 320"
          stroke="rgba(167,139,250,0.1)"
          strokeWidth="1"
        />
        <circle cx="300" cy="212" r="3" fill="#a78bfa" opacity="0.85" />
        <circle cx="780" cy="170" r="2.5" fill="#c4b5fd" opacity="0.7" />
        <circle cx="1120" cy="96" r="2" fill="#a78bfa" opacity="0.6" />
        <circle cx="540" cy="392" r="2" fill="#a78bfa" opacity="0.5" />
      </svg>

      {/* Esferas. O degradê descentrado dá o volume; o anel externo faz o
          contorno iluminado. Somem no celular para não encostar no cartão. */}
      <div className="absolute bottom-[-9rem] left-[-7rem] hidden size-[26rem] rounded-full opacity-90 ring-1 ring-[rgba(167,139,250,0.14)] [background:radial-gradient(circle_at_32%_26%,#6d3ff0_0%,#2a1a5e_38%,#0b0916_72%)] md:block" />
      <div className="absolute top-[22%] right-[-8rem] hidden size-[19rem] rounded-full opacity-80 ring-1 ring-[rgba(167,139,250,0.12)] [background:radial-gradient(circle_at_38%_30%,#4c2ea8_0%,#1d1440_42%,#09070f_75%)] lg:block" />

      {/* Camada de leitura. Escurece o conjunto o bastante para o cartão nunca
          disputar atenção com o fundo, e fecha um pouco mais no celular, onde
          a arte fica proporcionalmente mais perto do formulário.

          A dosagem foi medida na tela: acima de 0.7 no celular o degradê
          superior desaparecia por completo e a tela virava preto chapado, sem
          nenhuma da atmosfera que justifica o fundo existir. */}
      <div className="absolute inset-0 bg-[rgba(5,4,12,0.6)] sm:bg-[rgba(5,4,12,0.55)]" />
      <div className="absolute inset-0 [background:radial-gradient(75%_65%_at_50%_45%,transparent_0%,rgba(5,4,12,0.45)_100%)]" />
    </div>
  );
}
