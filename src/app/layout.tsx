import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "controlbio · ponto",
  description: "Sistema de ponto eletrônico da controlbio.",
};

/**
 * Aplica a classe `.dark` no `<html>` **antes da hidratação** (evita flash do
 * tema errado). Lê a preferência salva pela `useThemeStore` (chave
 * `controlbio:theme`); na ausência, segue o `prefers-color-scheme` do sistema.
 * Mantenha a chave em sincronia com `src/lib/stores/theme.ts`.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem('controlbio:theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
