/**
 * Âncoras do cabeçalho público.
 *
 * Uma lista só, consumida pelo menu de desktop e pelo de celular. Duplicá-la
 * faria os dois divergirem na primeira seção nova — e o de celular é o que
 * ninguém lembra de conferir.
 *
 * Os `href` são âncoras reais, não manipuladores de clique: funcionam com
 * JavaScript desligado e o navegador cuida do foco ao saltar.
 */
export const MARKETING_NAV_LINKS = [
  { href: "#recursos", label: "Recursos" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "Dúvidas" },
] as const;
