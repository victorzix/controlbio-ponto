"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useThemeStore } from "@/lib/stores/theme";
import { cn } from "@/lib/utils";

/**
 * Alterna entre tema claro e escuro (ver `docs/design-system.md` §9).
 *
 * Estilizado como um item da sidebar: ícone fixo em `px-3` + rótulo que
 * **esmaece** no modo rail (`rail`), com tooltip nativo (`title`). O ícone (sol
 * ↔ lua) troca com `motion` (gira/esmaece), respeitando `prefers-reduced-motion`.
 *
 * O estado inicial é `"light"` (igual ao HTML do servidor); o valor real do
 * `localStorage`/sistema assume após montar (`hydrate`), evitando mismatch — a
 * classe `.dark` em si já foi aplicada antes da hidratação pelo script do layout.
 */
export function ThemeToggle({ rail = false }: { rail?: boolean }) {
  const reduceMotion = useReducedMotion();
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const hydrate = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const isDark = theme === "dark";
  const label = isDark ? "Tema claro" : "Tema escuro";

  return (
    <button
      type="button"
      onClick={toggle}
      title={rail ? label : undefined}
      aria-label={label}
      className={cn(
        "inline-flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "moon" : "sun"}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, rotate: -90, scale: 0.5 }
            }
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.5 }
            }
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0 inline-flex items-center justify-center"
          >
            {isDark ? (
              <Moon className="size-4" />
            ) : (
              <Sun className="size-4" />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
      <span
        className={cn(
          "truncate transition-opacity duration-200",
          rail && "opacity-0",
        )}
      >
        {label}
      </span>
    </button>
  );
}