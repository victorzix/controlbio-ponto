"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/** Dispara um toast de sucesso a partir do `?ok=` da URL. */
export function PontoToast({ ok }: { ok: string }) {
  useEffect(() => {
    if (ok === "registrado") toast.success("Ponto registrado.");
  }, [ok]);
  return null;
}
