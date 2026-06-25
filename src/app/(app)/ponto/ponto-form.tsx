"use client";

import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  createEntry,
  updateEntry,
  type PontoActionState,
} from "@/lib/ponto/actions";
import {
  createEntrySchema,
  updateEntrySchema,
  MAX_SPLIT_HOURS,
} from "@/lib/ponto/validation";
import { MarkdownEditor } from "./markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateField } from "@/components/ui/date-field";

type FormValues = z.infer<typeof createEntrySchema>;

/** "YYYY-MM-DD" → "DD/MM/AAAA" (para a dica de divisão). */
function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export type PontoEntryFormData = {
  id: string;
  title: string;
  workDate: string;
  workedMinutes: number;
  description: string;
  link: string | null;
};

type PontoFormProps = {
  mode: "create" | "edit";
  /** Obrigatório no modo edição. */
  entry?: PontoEntryFormData;
  /** Hoje (YYYY-MM-DD): default do dia e teto de data. */
  today: string;
  /** Replicar: trava o título com este valor. */
  presetTitle?: string;
  /** Replicar: data default (ex.: a mesma do registro original). */
  presetDate?: string;
  onCancel: () => void;
  onSuccess: (result: PontoActionState) => void;
};

/**
 * Formulário de registro de ponto (criar/editar/replicar) com **React Hook
 * Form + Zod** (`CLAUDE.md` §7). Validação no client; submit chama a Server
 * Action (que revalida). No "replicar", o título vem pronto e fica somente
 * leitura, e a data já vem com a do registro original.
 */
export function PontoForm({
  mode,
  entry,
  today,
  presetTitle,
  presetDate,
  onCancel,
  onSuccess,
}: PontoFormProps) {
  const lockTitle = mode === "create" && presetTitle != null;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(mode === "edit" ? updateEntrySchema : createEntrySchema),
    defaultValues: {
      title: entry?.title ?? presetTitle ?? "",
      workDate: entry?.workDate ?? presetDate ?? today,
      hours: entry ? Math.floor(entry.workedMinutes / 60) : 0,
      minutes: entry ? entry.workedMinutes % 60 : 0,
      description: entry?.description ?? "",
      link: entry?.link ?? "",
    },
  });

  // Pré-visualização da divisão: acima de 24h (só na criação) vira N registros.
  const [watchedHours, watchedMinutes, watchedDate] = useWatch({
    control,
    name: ["hours", "minutes", "workDate"],
  });
  const totalMinutes =
    (Number(watchedHours) || 0) * 60 + (Number(watchedMinutes) || 0);
  const splitDays =
    mode !== "edit" && totalMinutes > 1440 ? Math.ceil(totalMinutes / 1440) : 0;

  async function onValid(data: FormValues) {
    const res: PontoActionState =
      mode === "create"
        ? await createEntry(data)
        : await updateEntry(entry!.id, data);

    if (res.ok) {
      onSuccess(res);
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

      {/* Título */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          type="text"
          maxLength={120}
          placeholder="Ex.: Atendimento cliente X"
          readOnly={lockTitle}
          className={lockTitle ? "bg-muted text-muted-foreground" : undefined}
          aria-invalid={!!errors.title || undefined}
          aria-describedby={errors.title ? "title-error" : undefined}
          {...register("title")}
        />
        {errors.title ? (
          <p id="title-error" className="text-destructive text-sm">
            {errors.title.message}
          </p>
        ) : null}
      </div>

      {/* Dia */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="workDate">Dia</Label>
        <Controller
          control={control}
          name="workDate"
          render={({ field }) => (
            <DateField
              id="workDate"
              value={field.value}
              onChange={field.onChange}
              max={today}
              ariaInvalid={!!errors.workDate}
              ariaDescribedby={errors.workDate ? "workDate-error" : undefined}
            />
          )}
        />
        {errors.workDate ? (
          <p id="workDate-error" className="text-destructive text-sm">
            {errors.workDate.message}
          </p>
        ) : null}
      </div>

      {/* Tempo trabalhado */}
      <div className="flex flex-col gap-2">
        <Label>Tempo trabalhado</Label>
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label
              htmlFor="hours"
              className="text-muted-foreground text-xs font-normal"
            >
              Horas
            </Label>
            <Input
              id="hours"
              type="number"
              inputMode="numeric"
              min={0}
              max={mode === "edit" ? 24 : MAX_SPLIT_HOURS}
              className="no-spinner w-24"
              aria-invalid={!!errors.hours || undefined}
              {...register("hours", { valueAsNumber: true })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label
              htmlFor="minutes"
              className="text-muted-foreground text-xs font-normal"
            >
              Minutos
            </Label>
            <Input
              id="minutes"
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              className="no-spinner w-24"
              aria-invalid={!!errors.minutes || undefined}
              {...register("minutes", { valueAsNumber: true })}
            />
          </div>
        </div>
        {errors.hours ? (
          <p className="text-destructive text-sm">{errors.hours.message}</p>
        ) : null}
        {errors.minutes ? (
          <p className="text-destructive text-sm">{errors.minutes.message}</p>
        ) : null}
        {splitDays > 1 ? (
          <p className="text-muted-foreground text-xs">
            Acima de 24h: serão criados <strong>{splitDays} registros</strong>{" "}
            (um por dia, máx. 24h){watchedDate ? ` a partir de ${formatDateBR(watchedDate)}` : ""}.
          </p>
        ) : null}
      </div>

      {/* Descrição */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descrição</Label>
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <MarkdownEditor
              id="description"
              value={field.value}
              onChange={field.onChange}
              ariaInvalid={!!errors.description}
              ariaDescribedby={errors.description ? "description-error" : undefined}
            />
          )}
        />
        {errors.description ? (
          <p id="description-error" className="text-destructive text-sm">
            {errors.description.message}
          </p>
        ) : null}
      </div>

      {/* Link (opcional) — ex.: tarefa no ClickUp */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="link">Link tarefa (opcional)</Label>
        <Input
          id="link"
          type="url"
          inputMode="url"
          placeholder="https://app.clickup.com/t/..."
          aria-invalid={!!errors.link || undefined}
          aria-describedby={errors.link ? "link-error" : undefined}
          {...register("link")}
        />
        {errors.link ? (
          <p id="link-error" className="text-destructive text-sm">
            {errors.link.message}
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
          {isSubmitting
            ? "Salvando..."
            : mode === "edit"
              ? "Salvar alterações"
              : "Salvar registro"}
        </Button>
      </div>
    </form>
  );
}
