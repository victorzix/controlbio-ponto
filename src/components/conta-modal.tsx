"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { ContaForm } from "./conta-form";
import { ContaClickUp } from "./conta-clickup";

type ContaModalProps = {
  open: boolean;
  onClose: () => void;
  user: { name: string; username: string; email: string | null };
  /** Rótulo "conectado como X" da conta ClickUp pessoal, ou `null` (spec 011). */
  clickupLabel: string | null;
};

/**
 * Modal "Minha conta" (spec 005 + Tarefa 15 da spec 011): envolve o `Modal`
 * com o `ContaForm` (perfil) e a seção `ContaClickUp` (conexão pessoal com o
 * ClickUp), separadas visualmente dentro do mesmo painel. No sucesso do
 * perfil, fecha e dá `router.refresh()` para a sidebar (Server Component no
 * layout) refletir o nome novo (RF-06). A seção do ClickUp não fecha o modal:
 * conectar/desconectar só atualiza o estado exibido ali mesmo.
 */
export function ContaModal({
  open,
  onClose,
  user,
  clickupLabel,
}: ContaModalProps) {
  const router = useRouter();

  return (
    <Modal open={open} onClose={onClose} title="Minha conta">
      <div className="flex flex-col gap-6">
        <ContaForm
          user={user}
          onCancel={onClose}
          onSuccess={() => {
            onClose();
            router.refresh();
            toast.success("Conta atualizada.");
          }}
        />
        <div className="border-t border-border pt-6">
          <ContaClickUp
            clickupLabel={clickupLabel}
            onChanged={() => router.refresh()}
          />
        </div>
      </div>
    </Modal>
  );
}