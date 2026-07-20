import { create } from "zustand";

/**
 * Estado de UI do tracking (client global, via Zustand) — só o que precisa ser
 * compartilhado entre o painel inline (`/ponto`) e o card flutuante (layout):
 * se o **modal de finalização** está aberto. O estado do cronômetro em si é
 * server state (React Query), não fica aqui.
 */
type TrackingUiState = {
  finalizeOpen: boolean;
  openFinalize: () => void;
  closeFinalize: () => void;
};

export const useTrackingUiStore = create<TrackingUiState>((set) => ({
  finalizeOpen: false,
  openFinalize: () => set({ finalizeOpen: true }),
  closeFinalize: () => set({ finalizeOpen: false }),
}));
