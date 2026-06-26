"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { updateOwnAccount } from "@/lib/conta/actions";
import { updateOwnAccountSchema } from "@/lib/conta/validation";
import {
  deriveUsernameFromName,
  normalizeUsernameInput,
} from "@/lib/auth/username";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.infer<typeof updateOwnAccountSchema>;

type ContaFormProps = {
  user: { name: string; username: string; email: string | null };
  onCancel: () => void;
  onSuccess: () => void;
};

/**
 * Formulário "Minha conta" (spec 005) com **React Hook Form + Zod** (`CLAUDE.md`
 * §7), no mesmo molde do `UserForm`, mas só com os campos do próprio perfil:
 * nome, usuário (login), e-mail e senha — sem papel nem valor/hora.
 *
 * Pensado para viver dentro do `Modal`: renderiza só o `<form>` e avisa o pai
 * via `onSuccess` no sucesso.
 */
export function ContaForm({ user, onCancel, onSuccess }: ContaFormProps) {
  // Edição: o login só é re-sugerido a partir do nome enquanto não for mexido.
  const [usernameEdited, setUsernameEdited] = useState(true);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(updateOwnAccountSchema),
    defaultValues: {
      name: user.name,
      username: user.username,
      email: user.email ?? "",
      password: "",
    },
  });

  async function onValid(data: FormValues) {
    const res = await updateOwnAccount(data);
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
        <Label htmlFor="conta-name">Nome</Label>
        <Input
          id="conta-name"
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.name || undefined}
          aria-describedby={errors.name ? "conta-name-error" : undefined}
          {...register("name", {
            onChange: (e) => {
              if (!usernameEdited) {
                setValue("username", deriveUsernameFromName(e.target.value));
              }
            },
          })}
        />
        {errors.name ? (
          <p id="conta-name-error" className="text-destructive text-sm">
            {errors.name.message}
          </p>
        ) : null}
      </div>

      {/* Usuário (login) */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="conta-username">Usuário (login)</Label>
        <Input
          id="conta-username"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!!errors.username || undefined}
          aria-describedby={
            errors.username ? "conta-username-error" : "conta-username-hint"
          }
          {...register("username", {
            onChange: (e) => {
              setUsernameEdited(true);
              setValue("username", normalizeUsernameInput(e.target.value));
            },
          })}
        />
        {errors.username ? (
          <p id="conta-username-error" className="text-destructive text-sm">
            {errors.username.message}
          </p>
        ) : (
          <p id="conta-username-hint" className="text-muted-foreground text-sm">
            É com isso que você faz login.
          </p>
        )}
      </div>

      {/* E-mail (opcional) */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="conta-email">E-mail (opcional)</Label>
        <Input
          id="conta-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-invalid={!!errors.email || undefined}
          aria-describedby={errors.email ? "conta-email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p id="conta-email-error" className="text-destructive text-sm">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      {/* Senha (opcional) */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="conta-password">
          Nova senha (deixe em branco para manter)
        </Label>
        <Input
          id="conta-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password || undefined}
          aria-describedby={errors.password ? "conta-password-error" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p id="conta-password-error" className="text-destructive text-sm">
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