"use client";

import { useEffect, useRef, useState } from "react";
import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface RevealProps {
  children: ReactNode;
  /** Atraso em milissegundos, para escalonar itens de uma mesma grade. */
  delay?: number;
  /** Elemento renderizado — `li` dentro de lista, `div` no resto. */
  as?: ElementType;
  className?: string;
}

const MARGEM_DE_ANTECIPACAO = "0px 0px -12% 0px";

/**
 * Fade + deslize ao entrar na viewport.
 *
 * Três decisões que evitam os defeitos clássicos deste efeito:
 *
 * O conteúdo é renderizado **visível** no HTML do servidor. A classe que o
 * esconde só entra depois da hidratação, e apenas se o elemento estiver fora
 * da tela — sem JavaScript, sem `IntersectionObserver`, ou para um rastreador
 * que não executa script, a página aparece inteira. Animação nunca pode ser
 * pré-requisito para ler o texto.
 *
 * Quem já está visível no primeiro quadro é marcado como visível na hora, sem
 * animar. Esconder e reexibir o que a pessoa já enxergou produziria um piscar
 * no topo da página — o efeito colateral mais comum deste padrão.
 *
 * O observador se desconecta na primeira aparição: o elemento não volta a
 * sumir ao rolar para cima, e não sobra observador ativo depois do trabalho
 * feito.
 */
export function Reveal({ children, delay = 0, as, className }: RevealProps) {
  const Componente = as ?? "div";
  const referencia = useRef<HTMLElement>(null);
  const [animando, setAnimando] = useState(false);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const elemento = referencia.current;
    if (!elemento) return;

    // `prefers-reduced-motion` também é tratado no CSS; a checagem aqui evita
    // até montar o observador para quem pediu menos movimento.
    //
    // Ambas as APIs são testadas antes do uso: onde qualquer uma faltar, o
    // componente simplesmente não anima e o conteúdo permanece visível — que é
    // o estado em que ele já nasce. Animação é enfeite; nunca pode ser a razão
    // de uma página em branco.
    const menosMovimento =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (menosMovimento || typeof IntersectionObserver === "undefined") return;

    const retangulo = elemento.getBoundingClientRect();
    const jaNaTela = retangulo.top < window.innerHeight && retangulo.bottom > 0;
    if (jaNaTela) return;

    setAnimando(true);

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada?.isIntersecting) return;
        setVisivel(true);
        observador.disconnect();
      },
      { rootMargin: MARGEM_DE_ANTECIPACAO },
    );

    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return (
    <Componente
      ref={referencia}
      className={cn(animando && "mkt-reveal", className)}
      data-visivel={visivel ? "sim" : undefined}
      style={delay && animando ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Componente>
  );
}
