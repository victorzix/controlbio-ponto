"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Providers globais do client.
 *
 * React Query é o padrão do projeto para **estado de servidor** acessado no
 * client (ver `CLAUDE.md`). Aqui montamos um único `QueryClient` por sessão de
 * navegador. O `QueryClient` fica em `useState` para não ser recriado a cada
 * render (e para isolar instâncias entre requisições no SSR).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Evita refetch agressivo logo após hidratar.
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
