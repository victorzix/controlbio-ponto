"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Boundary de erro de render/Server Component das rotas (App Router). Captura
 * erros não tratados que escapam das páginas internas e mostra uma tela no
 * padrão do design system com "Tentar de novo". Ver `docs/specs/008-feedback-de-erros`.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex max-w-sm flex-col items-center gap-4"
      >
        <span className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
          <TriangleAlert className="size-6" />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Algo deu errado</h1>
          <p className="text-muted-foreground text-sm">
            Não foi possível carregar esta tela. Tente de novo — se continuar,
            avise o suporte.
          </p>
        </div>
        <Button onClick={reset} className="h-11">
          <RotateCcw className="size-4" />
          Tentar de novo
        </Button>
      </motion.div>
    </div>
  );
}
