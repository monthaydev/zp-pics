import type { Metadata } from "next";
import { Anton, Archivo, IBM_Plex_Mono } from "next/font/google";

import { SCRIPT_TEMA } from "@/lib/tema";

import "./globals.css";

const anton = Anton({
  variable: "--fonte-display",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const archivo = Archivo({
  variable: "--fonte-body",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--fonte-hud",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZP Pics",
  description: "Seleção de fotos do ZP Studio.",
  // Nenhuma galeria de cliente pode ser encontrada no Google. Vale pro app inteiro.
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${anton.variable} ${archivo.variable} ${plexMono.variable} h-full`}
      // O tema é escrito neste elemento pelo script abaixo, antes da pintura.
      // `suppressHydrationWarning` porque o React compara o HTML do servidor
      // com o DOM já corrigido pelo script e acusaria diferença — a diferença
      // é justamente o efeito desejado.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
