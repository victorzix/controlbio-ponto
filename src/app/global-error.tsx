"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import "./globals.css";

/**
 * Último recurso: captura erros do **root layout** (que o `error.tsx` comum não
 * alcança). Substitui todo o documento, então renderiza o próprio `<html>`/
 * `<body>` e importa o `globals.css`. Mantido autossuficiente (sem providers,
 * toaster nem fontes) para funcionar mesmo num colapso total.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-center text-foreground">
          <div className="flex max-w-sm flex-col items-center gap-4">
            <span className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
              <TriangleAlert className="size-6" />
            </span>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Erro inesperado</h1>
              <p className="text-muted-foreground text-sm">
                O aplicativo encontrou um problema. Tente recarregar.
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium shadow-xs transition-all"
            >
              <RotateCcw className="size-4" />
              Tentar de novo
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
