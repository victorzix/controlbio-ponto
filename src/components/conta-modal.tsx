"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { ContaForm } from "./conta-form";

type ContaModalProps = {
  open: boolean;
  onClose: () => void;
  user: { name: string; username: string; email: string | null };
};

/**
 * Modal "Minha conta" (spec 005): envolve o `Modal` + `ContaForm`. No sucesso
 * fecha, dá `router.refresh()` para a sidebar (Server Component no layout)
 * refletir o nome novo sem recarregar a página (RF-06), e dispara o toast.
 */
export function ContaModal({ open, onClose, user }: ContaModalProps) {
  const router = useRouter();

  return (
    <Modal open={open} onClose={onClose} title="Minha conta">
      <ContaForm
        user={user}
        onCancel={onClose}
        onSuccess={() => {
          onClose();
          router.refresh();
          toast.success("Conta atualizada.");
        }}
      />
    </Modal>
  );
}