"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { createUser, updateUser } from "@/lib/usuarios/actions";
import { updateUserSchema } from "@/lib/usuarios/validation";
import {
  deriveUsernameFromName,
  normalizeUsernameInput,
} from "@/lib/auth/username";
import { fetchMembers } from "@/lib/clickup/actions";
import { suggestMemberFor, type ClickUpMember } from "@/lib/clickup/members";
import { notifyUnexpectedError } from "@/lib/forms/notify-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";

// O client valida com o schema de edição (senha opcional). No modo criar, o
// servidor revalida com `createUserSchema` (senha obrigatória) — fonte da verdade.
//
// `clickupUserId` tem transform (string do <select> → number|undefined), então
// o tipo de ENTRADA do schema (o que os campos do form guardam de fato) difere
// do tipo de SAÍDA (o que chega pós-parse). `useForm` usa os três genéricos do
// RHF para isso: campos/`Controller`s trabalham com `FormInput`, e `onValid`
// recebe `FormValues` (já transformado pelo resolver).
type FormInput = z.input<typeof updateUserSchema>;
type FormValues = z.infer<typeof updateUserSchema>;

// Select nativo estilizado com tokens (design-system.md §6 — sem radix, o
// registry trava neste ambiente; mesmo estilo de `project-config-form.tsx`).
// `h-11` = alvo de toque ≥ 44px (CLAUDE.md §4). Reaproveitado pelos selects
// de papel e de vínculo com o ClickUp.
const SELECT_CLASS = cn(
  "border-input bg-background text-foreground flex h-11 w-full rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none",
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-destructive",
  "md:text-sm",
);

/** Garante que o membro já vinculado apareça no `<select>` mesmo antes da lista carregar. */
function withCurrentMember(
  members: ClickUpMember[],
  currentId: string | undefined,
): ClickUpMember[] {
  if (!currentId || members.some((m) => String(m.id) === currentId)) {
    return members;
  }
  const id = Number(currentId);
  return [...members, { id, username: `#${currentId} (carregando...)` }];
}

type UserFormProps = {
  mode: "create" | "edit";
  user?: {
    id: string;
    name: string;
    username: string;
    email: string | null;
    role: string;
    hourlyRateCents: number | null;
    /** Vínculo com o membro do ClickUp (spec 011, RF-12) — `null` = sem vínculo. */
    clickupUserId?: number | null;
  };
  /** True quando o usuário está editando a própria conta (RN-05). */
  isSelf?: boolean;
  onCancel: () => void;
  onSuccess: () => void;
};

/**
 * Formulário de usuário (criar/editar) com **React Hook Form + Zod** (`CLAUDE.md`
 * §7). Pensado para viver dentro do `Modal`: renderiza só o `<form>`. No sucesso
 * avisa o pai via `onSuccess` (que fecha o modal e invalida a lista no React Query).
 */
export function UserForm({
  mode,
  user,
  isSelf = false,
  onCancel,
  onSuccess,
}: UserFormProps) {
  // O login é sugerido a partir do primeiro nome enquanto não for editado à mão.
  const [usernameEdited, setUsernameEdited] = useState(mode === "edit");
  // O vínculo com o ClickUp é sugerido (RF-12) enquanto o admin não escolher
  // manualmente E o usuário ainda não tiver um vínculo salvo — nunca sobrescreve
  // um vínculo que já existe.
  const [clickupEdited, setClickupEdited] = useState(
    mode === "edit" && user?.clickupUserId != null,
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      name: user?.name ?? "",
      username: user?.username ?? "",
      email: user?.email ?? "",
      role: (user?.role as FormInput["role"]) ?? "funcionario",
      hourlyRate:
        user?.hourlyRateCents != null ? user.hourlyRateCents / 100 : undefined,
      // O <select> guarda string (id do membro) ou "" — o schema converte
      // para número|undefined só no parse (ver comentário de `FormInput`).
      clickupUserId:
        user?.clickupUserId != null ? String(user.clickupUserId) : "",
      password: "",
    },
  });

  // Lista de membros do workspace do ClickUp — busca client-side (React Query,
  // CLAUDE.md §6): vem da API externa, não de dado que o Server Component já
  // teria à mão. Degrada sem erro quando a integração não está configurada.
  const membersQuery = useQuery({
    queryKey: ["clickup", "members"],
    queryFn: fetchMembers,
    staleTime: 5 * 60 * 1000,
  });

  const members = useMemo<ClickUpMember[]>(() => {
    const data = membersQuery.data;
    return data?.configured && data.ok ? data.members : [];
  }, [membersQuery.data]);

  // Enquanto o admin não mexer no select nem já existir vínculo salvo, tenta
  // sugerir o membro correspondente conforme nome/e-mail digitados (mesmo
  // padrão de `usernameEdited` acima) — pré-seleção do RF-12.
  const nameValue = useWatch({ control, name: "name" });
  const emailValue = useWatch({ control, name: "email" });
  useEffect(() => {
    if (clickupEdited || members.length === 0) return;
    const suggestion = suggestMemberFor(
      { name: nameValue, email: emailValue },
      members,
    );
    if (suggestion) {
      setValue("clickupUserId", String(suggestion.id));
    }
  }, [clickupEdited, members, nameValue, emailValue, setValue]);

  async function onValid(data: FormValues) {
    try {
      const res =
        mode === "create"
          ? await createUser(data)
          : await updateUser(user!.id, data);

      if (res.ok) {
        onSuccess();
        return;
      }
      if (res.fieldErrors) {
        for (const [field, message] of Object.entries(res.fieldErrors)) {
          setError(field as keyof FormValues, { message });
        }
      } else if (res.error) {
        setError("root", { message: res.error });
      }
    } catch (err) {
      notifyUnexpectedError(err);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onValid)}
      className="flex flex-col gap-4"
      noValidate
    >
      {errors.root ? (
        <p role="alert" className="text-destructive text-sm">
          {errors.root.message}
        </p>
      ) : null}

      {/* Nome */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.name || undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
          {...register("name", {
            onChange: (e) => {
              if (!usernameEdited) {
                setValue("username", deriveUsernameFromName(e.target.value));
              }
            },
          })}
        />
        {errors.name ? (
          <p id="name-error" className="text-destructive text-sm">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      {/* Usuário (login) */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Usuário (login)</Label>
        <Input
          id="username"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!!errors.username || undefined}
          aria-describedby={errors.username ? "username-error" : "username-hint"}
          {...register("username", {
            onChange: (e) => {
              setUsernameEdited(true);
              setValue("username", normalizeUsernameInput(e.target.value));
            },
          })}
        />
        {errors.username ? (
          <p id="username-error" className="text-destructive text-sm">
            {errors.username.message}
          </p>
        ) : (
          <p id="username-hint" className="text-muted-foreground text-sm">
            É com isso que a pessoa faz login. Sugerido a partir do nome.
          </p>
        )}
      </div>

      {/* E-mail (opcional) */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail (opcional)</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-invalid={!!errors.email || undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p id="email-error" className="text-destructive text-sm">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      {/* Papel */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="role">Papel</Label>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <select
              id="role"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={isSelf}
              aria-invalid={!!errors.role || undefined}
              aria-describedby={
                errors.role
                  ? "role-error"
                  : isSelf
                    ? "role-self-note"
                    : undefined
              }
              className={SELECT_CLASS}
            >
              <option value="admin">Admin</option>
              <option value="funcionario">Funcionário</option>
            </select>
          )}
        />
        {isSelf ? (
          <p id="role-self-note" className="text-muted-foreground text-sm">
            Você não pode alterar o próprio papel.
          </p>
        ) : null}
        {errors.role ? (
          <p id="role-error" className="text-destructive text-sm">
            {errors.role.message}
          </p>
        ) : null}
      </div>

      {/* Valor da hora (opcional) */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="hourlyRate">Valor da hora (opcional)</Label>
        <Controller
          control={control}
          name="hourlyRate"
          render={({ field }) => (
            <CurrencyInput
              id="hourlyRate"
              value={field.value}
              onChange={field.onChange}
              ariaInvalid={!!errors.hourlyRate}
              ariaDescribedby={errors.hourlyRate ? "hourlyRate-error" : undefined}
            />
          )}
        />
        {errors.hourlyRate ? (
          <p id="hourlyRate-error" className="text-destructive text-sm">
            {errors.hourlyRate.message}
          </p>
        ) : null}
      </div>

      {/* Vínculo com o ClickUp (opcional) */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="clickupUserId">Membro do ClickUp (opcional)</Label>
        <Controller
          control={control}
          name="clickupUserId"
          render={({ field }) => {
            const options = withCurrentMember(members, field.value);
            const disabled =
              membersQuery.isPending ||
              !membersQuery.data?.configured ||
              (membersQuery.data.configured && !membersQuery.data.ok);
            return (
              <select
                id="clickupUserId"
                value={field.value ?? ""}
                onChange={(e) => {
                  setClickupEdited(true);
                  field.onChange(e.target.value);
                }}
                onBlur={field.onBlur}
                disabled={disabled}
                aria-invalid={!!errors.clickupUserId || undefined}
                aria-describedby={
                  errors.clickupUserId
                    ? "clickupUserId-error"
                    : "clickupUserId-hint"
                }
                className={SELECT_CLASS}
              >
                <option value="">Sem vínculo</option>
                {options.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.username}
                  </option>
                ))}
              </select>
            );
          }}
        />
        {errors.clickupUserId ? (
          <p id="clickupUserId-error" className="text-destructive text-sm">
            {errors.clickupUserId.message}
          </p>
        ) : (
          <p id="clickupUserId-hint" className="text-muted-foreground text-sm">
            {membersQuery.isPending
              ? "Carregando membros do ClickUp..."
              : !membersQuery.data?.configured
                ? "Integração com o ClickUp não configurada — o usuário pode ser salvo normalmente, só não sincroniza."
                : membersQuery.data.configured && !membersQuery.data.ok
                  ? "Não foi possível carregar os membros do ClickUp."
                  : "Sem vínculo, o usuário simplesmente não sincroniza com o ClickUp."}
          </p>
        )}
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
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password || undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p id="password-error" className="text-destructive text-sm">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:w-auto"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button type="submit" className="h-11 sm:w-auto" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
