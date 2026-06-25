import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Estado da sidebar (navegação) — client global, via Zustand.
 *
 * `collapsed` controla o modo **rail** (recolhido, só ícones) no desktop. É
 * persistido no `localStorage` para lembrar a preferência entre visitas.
 * O estado de abertura do **drawer mobile** é efêmero e fica local no componente.
 */
type SidebarState = {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (value: boolean) => void;
};

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (value) => set({ collapsed: value }),
    }),
    { name: "controlbio:sidebar" },
  ),
);
