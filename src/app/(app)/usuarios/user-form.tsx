"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import {
  createUser,
  updateUser,
  type ActionState,
} from "@/lib/usuarios/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type UserFormProps = {
  mode: "create" | "edit";
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  /** True quando o usuário está editando a própria conta (RN-05). */
  isSelf?: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-11 w-full" disabled={pending}>
      {pending ? "Salvando..." : "Salvar"}
    </Button>
  );
}

export function UserForm({ mode, user, isSelf = false }: UserFormProps) {
  const action = mode === "create" ? createUser : updateUser;
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const reduceMotion = useReducedMotion();

  const fe = state.fieldErrors ?? {};

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="w-full max-w-md"
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {mode === "create" ? "Novo usuário" : "Editar usuário"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4" noValidate>
            {/* Campo hidden para id em modo edição */}
            {mode === "edit" && user ? (
              <input type="hidden" name="id" value={user.id} />
            ) : null}

            {/* Erro geral */}
            {state.error ? (
              <p role="alert" className="text-destructive text-sm">
                {state.error}
              </p>
            ) : null}

            {/* Nome */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                defaultValue={user?.name ?? ""}
                aria-invalid={!!fe.name || undefined}
                aria-describedby={fe.name ? "name-error" : undefined}
                required
              />
              {fe.name ? (
                <p id="name-error" className="text-destructive text-sm">
                  {fe.name}
                </p>
              ) : null}
            </div>

            {/* E-mail */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                defaultValue={user?.email ?? ""}
                aria-invalid={!!fe.email || undefined}
                aria-describedby={fe.email ? "email-error" : undefined}
                required
              />
              {fe.email ? (
                <p id="email-error" className="text-destructive text-sm">
                  {fe.email}
                </p>
              ) : null}
            </div>

            {/* Papel */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="role">Papel</Label>
              <select
                id="role"
                name="role"
                defaultValue={user?.role ?? "funcionario"}
                disabled={isSelf}
                aria-invalid={!!fe.role || undefined}
                aria-describedby={
                  fe.role
                    ? "role-error"
                    : isSelf
                      ? "role-self-note"
                      : undefined
                }
                className={cn(
                  "border-input bg-background text-foreground flex h-9 w-full rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none",
                  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  "aria-invalid:border-destructive",
                  "md:text-sm"
                )}
              >
                <option value="admin">Admin</option>
                <option value="funcionario">Funcionário</option>
              </select>
              {isSelf ? (
                <p id="role-self-note" className="text-muted-foreground text-sm">
                  Você não pode alterar o próprio papel.
                </p>
              ) : null}
              {fe.role ? (
                <p id="role-error" className="text-destructive text-sm">
                  {fe.role}
                </p>
              ) : null}
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">
                {mode === "create"
                  ? "Senha"
                  : "Nova senha (deixe em branco para manter)"}
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "create" ? "new-password" : "new-password"
                }
                required={mode === "create"}
                aria-invalid={!!fe.password || undefined}
                aria-describedby={fe.password ? "password-error" : undefined}
              />
              {fe.password ? (
                <p id="password-error" className="text-destructive text-sm">
                  {fe.password}
                </p>
              ) : null}
            </div>

            {/* Ações */}
            <div className="flex flex-col gap-2 pt-2">
              <SubmitButton />
              <Button asChild variant="outline" className="h-11 w-full">
                <Link href="/usuarios">Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
