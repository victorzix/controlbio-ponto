"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const MESSAGES: Record<string, string> = {
  criado: "Usuário criado.",
  salvo: "Alterações salvas.",
  status: "Status atualizado.",
};

/** Exibe um toast de sucesso ao montar, com base no parâmetro `ok`. */
export function SuccessToast({ ok }: { ok: string }) {
  useEffect(() => {
    const msg = MESSAGES[ok];
    if (msg) toast.success(msg);
  }, [ok]);

  return null;
}
