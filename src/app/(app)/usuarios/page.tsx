import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/rbac";
import { listUsers } from "@/lib/usuarios/data";
import { setUserActive } from "@/lib/usuarios/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SuccessToast } from "./success-toast";

/** Mapa de rótulos para o papel do usuário. */
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  funcionario: "Funcionário",
};

type PageProps = {
  searchParams: Promise<{ q?: string; ok?: string }>;
};

export default async function UsuariosPage({ searchParams }: PageProps) {
  const currentUser = await requirePermission("usuarios:ler");
  const isAdmin = can(currentUser.role, "usuarios:criar");

  const { q, ok } = await searchParams;
  const lista = await listUsers(q);

  return (
    <div className="space-y-6">
      {/* Toast de sucesso */}
      {ok ? <SuccessToast ok={ok} /> : null}

      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Usuários
        </h1>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Busca */}
          <form method="GET" className="flex gap-2">
            <Input
              name="q"
              placeholder="Buscar por nome ou e-mail"
              defaultValue={q ?? ""}
              className="w-full sm:w-64"
              aria-label="Buscar usuários"
            />
            <Button type="submit" variant="outline" size="default">
              Buscar
            </Button>
          </form>

          {/* Botão novo usuário — só admin */}
          {isAdmin ? (
            <Button asChild>
              <Link href="/usuarios/novo">
                <UserPlus className="size-4" />
                Novo usuário
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Lista mobile (cards) */}
      {lista.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Nenhum usuário encontrado.
        </p>
      ) : (
        <>
          {/* Cards — visível até md */}
          <div className="flex flex-col gap-3 md:hidden">
            {lista.map((u) => {
              const boundSetActive = setUserActive.bind(null, u.id, !u.active);
              return (
                <div
                  key={u.id}
                  className={`bg-card border-border rounded-lg border p-4 shadow-sm${u.active ? "" : " opacity-70"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{u.name}</p>
                      <p className="text-muted-foreground truncate text-sm">
                        {u.email}
                      </p>
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
                      <Button asChild variant="outline" size="sm" className="min-h-[44px] flex-1">
                        <Link href={`/usuarios/${u.id}`}>Editar</Link>
                      </Button>
                      {u.id !== currentUser.id ? (
                        <form action={boundSetActive} className="flex-1">
                          <Button
                            type="submit"
                            variant={u.active ? "destructive" : "secondary"}
                            size="sm"
                            className="min-h-[44px] w-full"
                          >
                            {u.active ? "Desativar" : "Reativar"}
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Tabela — visível a partir de md */}
          <div className="hidden md:block">
            <div className="border-border rounded-lg border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin ? <TableHead>Ações</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((u) => {
                    const boundSetActive = setUserActive.bind(null, u.id, !u.active);
                    return (
                      <TableRow
                        key={u.id}
                        className={u.active ? "" : "opacity-70"}
                      >
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {ROLE_LABEL[u.role] ?? u.role}
                          </Badge>
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
                                asChild
                                variant="outline"
                                size="sm"
                                className="min-h-[44px]"
                              >
                                <Link href={`/usuarios/${u.id}`}>Editar</Link>
                              </Button>
                              {u.id !== currentUser.id ? (
                                <form action={boundSetActive}>
                                  <Button
                                    type="submit"
                                    variant={u.active ? "destructive" : "secondary"}
                                    size="sm"
                                    className="min-h-[44px]"
                                  >
                                    {u.active ? "Desativar" : "Reativar"}
                                  </Button>
                                </form>
                              ) : null}
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
