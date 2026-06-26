"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import type { ReportUserOption } from "@/lib/relatorios/data";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type Props = {
  users: ReportUserOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

/**
 * Seletor de múltiplos usuários (spec 006). Botão "Usuários (N)" que abre um
 * `Modal` com checkboxes. A seleção é editada num **rascunho** local e só é
 * aplicada no "Aplicar" — assim a query do relatório não refaz a cada toque.
 *
 * Modal em vez de dropdown radix (registry trava; design-system §6) — também é
 * mais confortável no mobile.
 */
export function UserMultiSelect({ users, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selectedIds);

  /** Abre o modal partindo da seleção atual (sincroniza o rascunho). */
  function openModal() {
    setDraft(selectedIds);
    setOpen(true);
  }

  function toggle(id: string) {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-start sm:w-auto"
        onClick={openModal}
      >
        <Users className="size-4" />
        Usuários ({selectedIds.length})
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Selecionar usuários">
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-[44px] flex-1"
              onClick={() => setDraft(users.map((u) => u.id))}
            >
              Marcar todos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px] flex-1"
              onClick={() => setDraft([])}
            >
              Limpar
            </Button>
          </div>

          <ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
            {users.map((u) => {
              const checked = draft.includes(u.id);
              return (
                <li key={u.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(u.id)}
                      className="size-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {u.name}
                    </span>
                    {!u.active ? (
                      <span className="text-muted-foreground shrink-0 text-xs">
                        inativo
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:w-auto"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" className="h-11 sm:w-auto" onClick={apply}>
              Aplicar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}