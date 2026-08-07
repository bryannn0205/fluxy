import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/app/providers";

// Auto-hospedada pelo Next no build — nenhuma requisição a fonts.googleapis.com
// em tempo de execução, o que mantém `font-src 'self'` da CSP intacto.
//
// O nome da variável precisa casar com o que `@theme` referencia em
// globals.css. Já esteve fora de sincronia: o tema apontava para `--font-sans`,
// que ninguém definia, e o app inteiro renderizava em Times New Roman.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Fluxy — Gestão de Pedidos",
    template: "%s · Fluxy",
  },
  description: "Gestão de pedidos simples e completa para pequenas e médias empresas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:shadow-md"
        >
          Pular para o conteúdo
        </a>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
