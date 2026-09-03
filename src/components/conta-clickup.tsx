"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { connectClickUp, disconnectClickUp } from "@/lib/conta/actions";
import { connectClickUpSchema } from "@/lib/conta/validation";
import { notifyUnexpectedError } from "@/lib/forms/notify-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.infer<typeof connectClickUpSchema>;

type ContaClickUpProps = {
  /** Rótulo "conectado como X" — `null` quando não há conexão. Nunca o token. */
  clickupLabel: string | null;
  /** Chamado após conectar/desconectar com sucesso (o pai faz `router.refresh()`). */
  onChanged: () => void;
};

/**
 * Seção "ClickUp" de "Minha conta" (spec 011, Tarefa 15).
 *
 * O token pessoal é OPCIONAL: o workspace do ClickUp, no plano atual, só deixa
 * o token de serviço lançar tempo em nome de quem o próprio membro é — lançar
 * em nome de terceiros exige Business Plus/Enterprise. Conectando aqui, a
 * pessoa lança as próprias horas com o próprio token, e elas aparecem no
 * ClickUp em seu nome; sem conectar, o ponto sincroniza normalmente, só não
 * lança tempo (RN-12) — nada quebra por não conectar.
 *
 * Segurança: este componente só recebe `clickupLabel` (rótulo público) via
 * prop. O token em si e sua cifra nunca chegam ao client — nem no estado
 * inicial, nem na resposta da Server Action de conectar.
 */
export function ContaClickUp({ clickupLabel, onChanged }: ContaClickUpProps) {
  const [disconnecting, setDisconnecting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(connectClickUpSchema),
    defaultValues: { token: "" },
  });

  async function onValid(data: FormValues) {
    try {
      const res = await connectClickUp(data);
      if (res.ok) {
        reset({ token: "" });
        onChanged();
        toast.success("Conta do ClickUp conectada.");
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

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await disconnectClickUp();
      if (res.ok) {
        onChanged();
        toast.success("Conta do ClickUp desconectada.");
      } else if (res.error) {
        toast.error(res.error);
      }
    } catch (err) {
      notifyUnexpectedError(err);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">ClickUp</h3>
        <p className="text-muted-foreground text-sm">
          Conectando sua conta pessoal, as horas registradas no seu ponto
          passam a aparecer lançadas em seu nome no ClickUp.
        </p>
        <p className="text-muted-foreground text-sm">
          Atenção: a descrição do seu ponto é enviada ao ClickUp junto com o
          lançamento, e fica visível para outras pessoas do workspace.
        </p>
      </div>

      {errors.root ? (
        <p role="alert" className="text-destructive text-sm">
          {errors.root.message}
        </p>
      ) : null}

      {clickupLabel ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Conectado como <span className="font-medium">{clickupLabel}</span>.
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:w-auto"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? "Desconectando..." : "Desconectar"}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit(onValid)}
          className="flex flex-col gap-3"
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="clickup-token">Token pessoal do ClickUp</Label>
            <Input
              id="clickup-token"
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="pk_..."
              aria-invalid={!!errors.token || undefined}
              aria-describedby={
                errors.token ? "clickup-token-error" : "clickup-token-hint"
              }
              {...register("token")}
            />
            {errors.token ? (
              <p id="clickup-token-error" className="text-destructive text-sm">
                {errors.token.message}
              </p>
            ) : (
              <p id="clickup-token-hint" className="text-muted-foreground text-sm">
                Gere em ClickUp → Configurações → Apps → API Token.
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant="outline"
            className="h-11 sm:w-auto sm:self-start"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Conectando..." : "Conectar"}
          </Button>
        </form>
      )}
    </div>
  );
}
