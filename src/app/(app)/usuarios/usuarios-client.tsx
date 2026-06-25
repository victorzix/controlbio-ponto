"use client";

import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { fetchUsers, setUserActive } from "@/lib/usuarios/actions";
import type { UserListItem } from "@/lib/usuarios/data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { UserForm } from "./user-form";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  funcionario: "Funcionário",
};

const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatHourlyRate(cents: number | null): string {
  return cents != null ? `${brlFmt.format(cents / 100)}/h` : "—";
}

/** Debounce simples para a busca (evita refetch a cada tecla). */
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

type Props = {
  currentUserId: string;
  isAdmin: boolean;
};

/**
 * Área de usuários (SPA): busca via **React Query** (sem usar a URL), com
 * criar/editar em **modal** e ativar/desativar por mutação que invalida a lista.
 */
export function UsuariosClient({ currentUserId, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const q = useDebounced(input.trim(), 300);

  const { data: lista = [], isPending, isFetching } = useQuery({
    queryKey: ["usuarios", currentUserId, q],
    queryFn: () => fetchUsers(q || undefined),
    placeholderData: keepPreviousData,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["usuarios"] });
  }

  async function toggleActive(u: UserListItem) {
    setPendingId(u.id);
    try {
      await setUserActive(u.id, !u.active);
      invalidate();
      toast.success(u.active ? "Usuário desativado." : "Usuário reativado.");
    } catch {
      toast.error("Não foi possível alterar o status.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Usuários
        </h1>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Buscar por nome, usuário ou e-mail"
              className="w-full sm:w-64"
              aria-label="Buscar usuários"
            />
            {isFetching ? (
              <Loader2 className="text-muted-foreground absolute top-1/2 right-2 size-4 -translate-y-1/2 animate-spin" />
            ) : null}
          </div>

          {isAdmin ? (
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus className="size-4" />
              Novo usuário
            </Button>
          ) : null}
        </div>
      </div>

      {/* Lista */}
      {isPending ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Carregando...
        </p>
      ) : lista.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Nenhum usuário encontrado.
        </p>
      ) : (
        <>
          {/* Cards — até md */}
          <div className="flex flex-col gap-3 md:hidden">
            {lista.map((u) => (
              <div
                key={u.id}
                className={`bg-card border-border rounded-lg border p-4 shadow-sm${u.active ? "" : " opacity-70"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="text-muted-foreground truncate text-sm">
                      {u.username}
                    </p>
                    {u.email ? (
                      <p className="text-muted-foreground truncate text-xs">
                        {u.email}
                      </p>
                    ) : null}
                    {u.hourlyRateCents != null ? (
                      <p className="text-muted-foreground truncate text-xs">
                        {formatHourlyRate(u.hourlyRateCents)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="secondary">
                      {ROLE_LABEL[u.role] ?? u.role}
                    </Badge>
                    <Badge variant={u.active ? "default" : "outline"}>
                      {u.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </div>

                {isAdmin ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] flex-1"
                      onClick={() => setEditing(u)}
                    >
                      Editar
                    </Button>
                    {u.id !== currentUserId ? (
                      <Button
                        type="button"
                        variant={u.active ? "destructive" : "secondary"}
                        size="sm"
                        className="min-h-[44px] flex-1"
                        disabled={pendingId === u.id}
                        onClick={() => toggleActive(u)}
                      >
                        {u.active ? "Desativar" : "Reativar"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Tabela — md+ */}
          <div className="hidden md:block">
            <div className="border-border rounded-lg border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Valor/h</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin ? <TableHead>Ações</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((u) => (
                    <TableRow key={u.id} className={u.active ? "" : "opacity-70"}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.username}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.email ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {ROLE_LABEL[u.role] ?? u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatHourlyRate(u.hourlyRateCents)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.active ? "default" : "outline"}>
                          {u.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      {isAdmin ? (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-[44px]"
                              onClick={() => setEditing(u)}
                            >
                              Editar
                            </Button>
                            {u.id !== currentUserId ? (
                              <Button
                                type="button"
                                variant={u.active ? "destructive" : "secondary"}
                                size="sm"
                                className="min-h-[44px]"
                                disabled={pendingId === u.id}
                                onClick={() => toggleActive(u)}
                              >
                                {u.active ? "Desativar" : "Reativar"}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* Criar */}
      {isAdmin ? (
        <Modal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Novo usuário"
        >
          <UserForm
            mode="create"
            onCancel={() => setCreateOpen(false)}
            onSuccess={() => {
              setCreateOpen(false);
              invalidate();
              toast.success("Usuário criado.");
            }}
          />
        </Modal>
      ) : null}

      {/* Editar */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar usuário"
      >
        {editing ? (
          <UserForm
            mode="edit"
            user={editing}
            isSelf={editing.id === currentUserId}
            onCancel={() => setEditing(null)}
            onSuccess={() => {
              setEditing(null);
              invalidate();
              toast.success("Usuário salvo.");
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
