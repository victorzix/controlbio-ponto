"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteEntry, type PontoActionState } from "@/lib/ponto/actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PontoForm, type PontoEntryFormData } from "./ponto-form";

type Props = {
  entry: PontoEntryFormData;
  today: string;
  canEdit: boolean;
  canDelete: boolean;
  canReplicate: boolean;
};

/** Ícones discretos de replicar/editar/excluir de um registro, com seus modais. */
export function PontoEntryActions({
  entry,
  today,
  canEdit,
  canDelete,
  canReplicate,
}: Props) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [replicateOpen, setReplicateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const closeEdit = useCallback(() => setEditOpen(false), []);
  const closeReplicate = useCallback(() => setReplicateOpen(false), []);
  const closeDelete = useCallback(() => setDeleteOpen(false), []);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["ponto"] }),
    [queryClient],
  );

  const handleEditSuccess = useCallback(() => {
    setEditOpen(false);
    invalidate();
    toast.success("Registro atualizado.");
  }, [invalidate]);

  const handleReplicateSuccess = useCallback(
    (res: PontoActionState) => {
      setReplicateOpen(false);
      invalidate();
      toast.success(
        res.created && res.created > 1
          ? `${res.created} registros criados.`
          : "Registro replicado.",
      );
    },
    [invalidate],
  );

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteEntry(entry.id);
      setDeleteOpen(false);
      invalidate();
      toast.success("Registro excluído.");
    } catch {
      toast.error("Não foi possível excluir o registro.");
    } finally {
      setDeleting(false);
    }
  }

  // Só http(s) vira link clicável (segurança — evita javascript:/data: etc.).
  const hasLink = !!entry.link && /^https?:\/\//i.test(entry.link);

  if (!hasLink && !canEdit && !canDelete && !canReplicate) return null;

  return (
    <>
      <div className="flex items-center gap-0.5">
        {hasLink ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground size-8"
            title="Abrir link"
          >
            <a
              href={entry.link!}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir link da tarefa"
            >
              <ExternalLink className="size-4" />
            </a>
          </Button>
        ) : null}
        {canReplicate ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground size-8"
            aria-label="Replicar registro"
            title="Replicar"
            onClick={() => setReplicateOpen(true)}
          >
            <Copy className="size-4" />
          </Button>
        ) : null}
        {canEdit ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground size-8"
            aria-label="Editar registro"
            title="Editar"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-4" />
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive size-8"
            aria-label="Excluir registro"
            title="Excluir"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      {/* Replicar: novo registro com o mesmo título e a mesma data por padrão */}
      {canReplicate ? (
        <Modal
          open={replicateOpen}
          onClose={closeReplicate}
          title="Replicar registro"
        >
          <PontoForm
            mode="create"
            today={today}
            presetTitle={entry.title}
            presetDate={entry.workDate}
            onCancel={closeReplicate}
            onSuccess={handleReplicateSuccess}
          />
        </Modal>
      ) : null}

      {/* Editar */}
      {canEdit ? (
        <Modal open={editOpen} onClose={closeEdit} title="Editar registro">
          <PontoForm
            mode="edit"
            entry={entry}
            today={today}
            onCancel={closeEdit}
            onSuccess={handleEditSuccess}
          />
        </Modal>
      ) : null}

      {/* Confirmação de exclusão */}
      {canDelete ? (
        <Modal open={deleteOpen} onClose={closeDelete} title="Excluir registro">
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              Tem certeza que deseja excluir{" "}
              <span className="text-foreground font-medium">{entry.title}</span>?
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-11 sm:w-auto"
                onClick={closeDelete}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="h-11 sm:w-auto"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
