"use client";

import { TrackingFloater } from "./tracking-floater";
import { TrackingFinalizeDialog } from "./tracking-finalize-dialog";

/**
 * Peças globais do tracking, montadas uma vez no layout da área interna: o card
 * flutuante (fora da `/ponto`) e o modal de finalização (aberto tanto pelo
 * painel inline quanto pelo flutuante, via store).
 */
export function TrackingController() {
  return (
    <>
      <TrackingFloater />
      <TrackingFinalizeDialog />
    </>
  );
}
