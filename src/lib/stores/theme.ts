import { create } from "zustand";

/**
 * Preferência de tema (claro/escuro) — client global, via Zustand.
 *
 * O tema é aplicado pela classe `.dark` no `<html>` (padrão shadcn Tailwind v4,
 * ver `globals.css`). Para evitar **flash** do tema errado, a classe é aplicada
 * por um script inline **antes da hidratação** (ver `src/app/layout.tsx`); este
 * store apenas reflete/atualiza essa preferência em runtime e a persiste no
 * `localStorage` na mesma chave (`THEME_STORAGE_KEY`).
 *
 * O snapshot inicial é `"light"` (igual ao HTML do servidor, que não conhece o
 * `localStorage`) — o valor real é lido só após montar, via `hydrate()`, para
 * não divergir na hidratação (mesmo cuidado da `useSidebarStore`).
 */
export const THEME_STORAGE_KEY = "controlbio:theme";

export type Theme = "light" | "dark";

/** Lê a preferência salva; na ausência, segue o sistema (`prefers-color-scheme`). */
function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Aplica a classe `.dark` no `<html>` conforme o tema. */
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

type ThemeState = {
  theme: Theme;
  /** Sincroniza o estado com a preferência real (chamar após montar). */
  hydrate: () => void;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "light",
  hydrate: () => set({ theme: readStoredTheme() }),
  setTheme: (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  toggle: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
}));
