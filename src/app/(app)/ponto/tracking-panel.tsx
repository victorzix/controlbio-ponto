"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Clock, Pause, Play, Square, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  useActiveTracking,
  useTrackingClock,
  useTrackingControls,
} from "@/lib/tracking/use-tracking";
import { formatClock, parseTimeToHM } from "@/lib/tracking/format";
import { startTrackingSchema } from "@/lib/tracking/validation";
import type { ActiveTracking } from "@/lib/tracking/data";
import { PROJECT_OPTIONS } from "@/lib/ponto/validation";
import { useTrackingUiStore } from "@/lib/stores/tracking-ui";
import { notifyUnexpectedError } from "@/lib/forms/notify-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StartValues = z.infer<typeof startTrackingSchema>;

const pad = (n: number) => String(n).padStart(2, "0");

/** Date local → "YYYY-MM-DD". */
function localDateISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const projectLabel = (v: string) =>
  PROJECT_OPTIONS.find((p) => p.value === v)?.label ?? v;

/** Radiogroup de projeto (mesmo padrão do form de ponto). */
function ProjectRadio({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
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
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Painel de cronômetro inline na tela `/ponto` (spec 010). Ocioso: título +
 * projeto + iniciar. Ativo: relógio do bloco atual (com total abaixo) +
 * pausar/retomar/encerrar/descartar. Clicar no relógio ajusta o início.
 */
export function TrackingPanel() {
  const query = useActiveTracking();

  if (query.isPending) {
    return (
      <div className="bg-card flex items-center gap-2 rounded-xl border p-4 text-sm">
        <Clock className="text-muted-foreground size-4 animate-pulse" />
        <span className="text-muted-foreground">Carregando cronômetro...</span>
      </div>
    );
  }

  return query.data ? (
    <ActiveCard tracking={query.data} dataUpdatedAt={query.dataUpdatedAt} />
  ) : (
    <IdleForm />
  );
}

/** Estado ocioso: inicia com título + projeto. */
function IdleForm() {
  const { start } = useTrackingControls();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StartValues>({
    resolver: zodResolver(startTrackingSchema),
    defaultValues: { title: "", project: "labphase" },
  });

  async function onValid(data: StartValues) {
    try {
      const res = await start(data);
      if (res.ok) {
        toast.success("Cronômetro iniciado.");
        return;
      }
      if (res.fieldErrors) {
        for (const [field, message] of Object.entries(res.fieldErrors)) {
          setError(field as keyof StartValues, { message });
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
      noValidate
      className="bg-card flex flex-col gap-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
          <Clock className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="leading-none font-medium">Cronômetro</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Marque o tempo em tempo real — ao encerrar, vira ponto.
          </p>
        </div>
      </div>

      {errors.root ? (
        <p role="alert" className="text-destructive text-sm">
          {errors.root.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="tracking-title">Título</Label>
        <Input
          id="tracking-title"
          type="text"
          maxLength={120}
          placeholder="Ex.: Atendimento cliente X"
          aria-invalid={!!errors.title || undefined}
          {...register("title")}
        />
        {errors.title ? (
          <p className="text-destructive text-sm">{errors.title.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Label>Projeto</Label>
          <Controller
            control={control}
            name="project"
            render={({ field }) => (
              <ProjectRadio value={field.value} onChange={field.onChange} />
            )}
          />
        </div>
        <Button type="submit" className="h-11" disabled={isSubmitting}>
          <Play className="size-4" />
          {isSubmitting ? "Iniciando..." : "Iniciar cronômetro"}
        </Button>
      </div>
    </form>
  );
}

/** Estado ativo: relógio (bloco atual + total) + controles. */
function ActiveCard({
  tracking,
  dataUpdatedAt,
}: {
  tracking: ActiveTracking;
  dataUpdatedAt: number;
}) {
  const { pause, resume, stop, adjust, discard } = useTrackingControls();
  const openFinalize = useTrackingUiStore((s) => s.openFinalize);
  const { totalMs, currentBlockMs } = useTrackingClock(tracking, dataUpdatedAt);
  const running = tracking.status === "running";

  const [busy, setBusy] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const openSegment = tracking.segments.find((s) => s.endedAt == null);
  const clockRef = useRef<HTMLDivElement>(null);

  // Fecha o popover de ajuste ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!adjustOpen) return;
    function onDown(e: MouseEvent) {
      if (clockRef.current && !clockRef.current.contains(e.target as Node)) {
        setAdjustOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAdjustOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [adjustOpen]);

  async function run(fn: () => Promise<{ ok?: boolean; error?: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.error) toast.error(res.error);
      return res;
    } catch (err) {
      notifyUnexpectedError(err);
      return { error: "erro" };
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    const res = await run(stop);
    if (!res.error) openFinalize();
  }

  return (
    <div className="border-primary/30 from-primary/5 flex flex-col gap-4 rounded-xl border bg-gradient-to-b to-transparent p-4 sm:p-5">
      {/* Cabeçalho: identidade + relógio */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="truncate font-medium">{tracking.title}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{projectLabel(tracking.project)}</Badge>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium",
                running ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  running
                    ? "bg-primary animate-pulse"
                    : "bg-muted-foreground/60",
                )}
              />
              {running ? "Rodando" : "Pausado"}
            </span>
            {tracking.segments.length > 1 ? (
              <span className="text-muted-foreground text-xs">
                · {tracking.segments.length} blocos
              </span>
            ) : null}
          </div>
        </div>

        {/* Relógio: bloco atual (grande) + total (menor). Clicar ajusta o início. */}
        <div ref={clockRef} className="relative flex flex-col items-end">
          {running ? (
            <button
              type="button"
              onClick={() => setAdjustOpen((v) => !v)}
              aria-expanded={adjustOpen}
              aria-label="Ajustar horário de início"
              title="Clique para ajustar o início"
              className="rounded-md font-mono text-3xl font-semibold tabular-nums underline-offset-4 decoration-dotted hover:underline focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none sm:text-4xl"
            >
              {formatClock(currentBlockMs)}
            </button>
          ) : (
            <p className="text-muted-foreground font-mono text-3xl font-semibold tabular-nums sm:text-4xl">
              {formatClock(currentBlockMs)}
            </p>
          )}
          <p className="text-muted-foreground mt-0.5 font-mono text-xs tabular-nums">
            Total {formatClock(totalMs)}
          </p>

          {adjustOpen && openSegment ? (
            <AdjustPopover
              startedAtISO={openSegment.startedAt}
              disabled={busy}
              onCancel={() => setAdjustOpen(false)}
              onSave={async (iso) => {
                const res = await run(() => adjust(iso));
                if (!res.error) {
                  setAdjustOpen(false);
                  toast.success("Início ajustado.");
                }
              }}
            />
          ) : null}
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {running ? (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => run(pause)}
          >
            <Pause className="size-4" />
            Pausar
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => run(resume)}
          >
            <Play className="size-4" />
            Retomar
          </Button>
        )}

        <Button type="button" className="h-11" disabled={busy} onClick={handleStop}>
          <Square className="size-4" />
          Encerrar
        </Button>

        <div className="ml-auto">
          {confirmDiscard ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Descartar?</span>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="size-11"
                aria-label="Confirmar descarte"
                disabled={busy}
                onClick={async () => {
                  const res = await run(discard);
                  if (!res.error) toast.success("Cronômetro descartado.");
                  setConfirmDiscard(false);
                }}
              >
                <Check className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="Cancelar descarte"
                onClick={() => setConfirmDiscard(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive size-11"
              aria-label="Descartar cronômetro"
              title="Descartar"
              disabled={busy}
              onClick={() => setConfirmDiscard(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Card-tooltip de ajuste do início do bloco atual: input de **texto** de
 * horário (ex.: "2340" → 23:40) e data **opcional** (default = o dia em que
 * começou). O servidor revalida (não-futuro, sem sobrepor o bloco anterior).
 */
function AdjustPopover({
  startedAtISO,
  disabled,
  onCancel,
  onSave,
}: {
  startedAtISO: string;
  disabled: boolean;
  onCancel: () => void;
  onSave: (iso: string) => void;
}) {
  const start = new Date(startedAtISO);
  const [timeStr, setTimeStr] = useState(
    () => `${pad(start.getHours())}:${pad(start.getMinutes())}`,
  );
  const [dateStr, setDateStr] = useState(() => localDateISO(start));
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const hm = parseTimeToHM(timeStr);
    if (!hm) {
      setError("Horário inválido. Use HH:MM ou 2340.");
      return;
    }
    const [y, mo, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, mo - 1, d, hm.h, hm.m, 0, 0);
    if (Number.isNaN(dt.getTime())) {
      setError("Data inválida.");
      return;
    }
    setError(null);
    onSave(dt.toISOString());
  }

  return (
    <div className="bg-card absolute top-full right-0 z-20 mt-2 w-64 rounded-lg border p-3 shadow-lg">
      <p className="mb-2 text-xs font-medium">Ajustar início do bloco</p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="adjust-time" className="text-xs">
            Horário
          </Label>
          <Input
            id="adjust-time"
            type="text"
            inputMode="numeric"
            autoFocus
            placeholder="ex.: 2340"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="adjust-date" className="text-xs">
            Data (opcional)
          </Label>
          <Input
            id="adjust-date"
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" size="sm" disabled={disabled} onClick={submit}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
