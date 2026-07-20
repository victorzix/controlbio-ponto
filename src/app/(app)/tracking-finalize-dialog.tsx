"use client";

import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useActiveTracking,
  useTrackingControls,
} from "@/lib/tracking/use-tracking";
import { msToHoursMinutes } from "@/lib/tracking/format";
import { finalizeTrackingSchema } from "@/lib/tracking/validation";
import type { ActiveTracking } from "@/lib/tracking/data";
import { brasiliaDateISO } from "@/lib/tz";
import { PROJECT_OPTIONS } from "@/lib/ponto/validation";
import { useTrackingUiStore } from "@/lib/stores/tracking-ui";
import { notifyUnexpectedError } from "@/lib/forms/notify-error";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateField } from "@/components/ui/date-field";
import { MarkdownEditor } from "@/app/(app)/ponto/markdown-editor";
import { cn } from "@/lib/utils";

type FinalizeValues = z.infer<typeof finalizeTrackingSchema>;

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/** "início–fim" (hora local) de um segmento, para rotular o bloco. */
function segmentRange(startedAt: string, endedAt: string | null): string {
  const start = timeFmt.format(new Date(startedAt));
  const end = endedAt ? timeFmt.format(new Date(endedAt)) : "agora";
  return `${start}–${end}`;
}

/** Monta os valores default do form a partir do tracking encerrado. */
function buildDefaults(tracking: ActiveTracking): FinalizeValues {
  return {
    title: tracking.title,
    project: tracking.project,
    segments: tracking.segments.map((s) => {
      const end = s.endedAt ?? tracking.serverNow;
      const ms = new Date(end).getTime() - new Date(s.startedAt).getTime();
      const { hours, minutes } = msToHoursMinutes(ms);
      return {
        id: s.id,
        workDate: brasiliaDateISO(new Date(s.startedAt)),
        hours,
        minutes,
        description: "",
      };
    }),
  };
}

/**
 * Modal de finalização (spec 010): lista os blocos (segmentos) com tempo já
 * preenchido; ao salvar, cria um ponto por bloco (mesmo título/projeto). É
 * montado uma vez no layout e controlado pela store (`finalizeOpen`).
 */
export function TrackingFinalizeDialog() {
  const finalizeOpen = useTrackingUiStore((s) => s.finalizeOpen);
  const closeFinalize = useTrackingUiStore((s) => s.closeFinalize);
  const query = useActiveTracking();
  const tracking = query.data;

  const open = finalizeOpen && !!tracking;

  return (
    <Modal open={open} onClose={closeFinalize} title="Encerrar cronômetro">
      {tracking ? (
        <FinalizeForm
          tracking={tracking}
          onCancel={closeFinalize}
          onSuccess={closeFinalize}
        />
      ) : null}
    </Modal>
  );
}

function FinalizeForm({
  tracking,
  onCancel,
  onSuccess,
}: {
  tracking: ActiveTracking;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { finalize } = useTrackingControls();
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FinalizeValues>({
    resolver: zodResolver(finalizeTrackingSchema),
    defaultValues: buildDefaults(tracking),
  });

  const { fields, remove } = useFieldArray({ control, name: "segments" });

  function applyDescriptionToAll() {
    const first = getValues("segments.0.description") ?? "";
    fields.forEach((_, i) =>
      setValue(`segments.${i}.description`, first, { shouldValidate: true }),
    );
    toast.success("Descrição aplicada a todos os blocos.");
  }

  async function onValid(data: FinalizeValues) {
    try {
      const res = await finalize(data);
      if (res.ok) {
        toast.success(
          res.created && res.created > 1
            ? `${res.created} pontos criados.`
            : "Ponto criado.",
        );
        onSuccess();
        return;
      }
      if (res.fieldErrors) {
        for (const [field, message] of Object.entries(res.fieldErrors)) {
          setError(field as keyof FinalizeValues, { message });
        }
      } else if (res.error) {
        setError("root", { message: res.error });
      }
    } catch (err) {
      notifyUnexpectedError(err);
    }
  }

  const today = tracking.todayBrasilia;

  return (
    <form onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4" noValidate>
      {errors.root ? (
        <p role="alert" className="text-destructive text-sm">
          {errors.root.message}
        </p>
      ) : null}

      {/* Título + projeto (valem para todos) */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="finalize-title">Título</Label>
        <Input
          id="finalize-title"
          type="text"
          maxLength={120}
          aria-invalid={!!errors.title || undefined}
          {...register("title")}
        />
        {errors.title ? (
          <p className="text-destructive text-sm">{errors.title.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Projeto</Label>
        <Controller
          control={control}
          name="project"
          render={({ field }) => (
            <div
              role="radiogroup"
              aria-label="Projeto"
              className="bg-muted inline-flex rounded-lg p-1"
            >
              {PROJECT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={field.value === opt.value}
                  onClick={() => field.onChange(opt.value)}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    field.value === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        />
      </div>

      {typeof errors.segments?.message === "string" ? (
        <p className="text-destructive text-sm">{errors.segments.message}</p>
      ) : null}

      {fields.length > 1 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={applyDescriptionToAll}
        >
          <Copy className="size-4" />
          Usar a descrição do 1º bloco em todos
        </Button>
      ) : null}

      {/* Blocos */}
      <div className="flex flex-col gap-4">
        {fields.map((f, i) => {
          const seg = tracking.segments.find((s) => s.id === f.id);
          const segErr = errors.segments?.[i];
          return (
            <div key={f.id} className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs font-medium">
                  Bloco {i + 1}
                  {seg ? ` · ${segmentRange(seg.startedAt, seg.endedAt)}` : ""}
                </p>
                {fields.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-8"
                    aria-label={`Remover bloco ${i + 1}`}
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>

              <input type="hidden" {...register(`segments.${i}.id`)} />

              <div className="flex flex-col gap-2">
                <Label htmlFor={`seg-${i}-date`}>Dia</Label>
                <Controller
                  control={control}
                  name={`segments.${i}.workDate`}
                  render={({ field }) => (
                    <DateField
                      id={`seg-${i}-date`}
                      value={field.value}
                      onChange={field.onChange}
                      max={today}
                      ariaInvalid={!!segErr?.workDate}
                    />
                  )}
                />
                {segErr?.workDate ? (
                  <p className="text-destructive text-sm">
                    {segErr.workDate.message}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Tempo trabalhado</Label>
                <div className="flex items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor={`seg-${i}-hours`}
                      className="text-muted-foreground text-xs font-normal"
                    >
                      Horas
                    </Label>
                    <Input
                      id={`seg-${i}-hours`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={24}
                      className="no-spinner w-24"
                      aria-invalid={!!segErr?.hours || undefined}
                      {...register(`segments.${i}.hours`, { valueAsNumber: true })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor={`seg-${i}-minutes`}
                      className="text-muted-foreground text-xs font-normal"
                    >
                      Minutos
                    </Label>
                    <Input
                      id={`seg-${i}-minutes`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      className="no-spinner w-24"
                      aria-invalid={!!segErr?.minutes || undefined}
                      {...register(`segments.${i}.minutes`, {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                </div>
                {segErr?.hours ? (
                  <p className="text-destructive text-sm">
                    {segErr.hours.message}
                  </p>
                ) : null}
                {segErr?.minutes ? (
                  <p className="text-destructive text-sm">
                    {segErr.minutes.message}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`seg-${i}-desc`}>Descrição</Label>
                <Controller
                  control={control}
                  name={`segments.${i}.description`}
                  render={({ field }) => (
                    <MarkdownEditor
                      id={`seg-${i}-desc`}
                      value={field.value}
                      onChange={field.onChange}
                      ariaInvalid={!!segErr?.description}
                    />
                  )}
                />
                {segErr?.description ? (
                  <p className="text-destructive text-sm">
                    {segErr.description.message}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
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
            : fields.length > 1
              ? `Salvar (${fields.length} pontos)`
              : "Salvar ponto"}
        </Button>
      </div>
    </form>
  );
}
