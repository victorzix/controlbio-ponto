"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { PontoActionState } from "@/lib/ponto/actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PontoForm } from "./ponto-form";

/** Mensagem de sucesso considerando a divisão em vários registros. */
function successMessage(res: PontoActionState, single: string): string {
  return res.created && res.created > 1
    ? `${res.created} registros criados.`
    : single;
}

/**
 * Botão "Novo registro" + modal de criação. Substitui a antiga página
 * `/ponto/novo`. Ao salvar com sucesso: fecha o modal, atualiza a lista
 * (`router.refresh()` — a página é Server Component) e dispara o toast.
 */
export function NovoPontoDialog({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const close = useCallback(() => setOpen(false), []);
  const handleSuccess = useCallback(
    (res: PontoActionState) => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["ponto"] });
      toast.success(successMessage(res, "Ponto registrado."));
    },
    [queryClient],
  );

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Novo registro
      </Button>
      <Modal open={open} onClose={close} title="Novo registro">
        <PontoForm
          mode="create"
          today={today}
          onCancel={close}
          onSuccess={handleSuccess}
        />
      </Modal>
    </>
  );
}
