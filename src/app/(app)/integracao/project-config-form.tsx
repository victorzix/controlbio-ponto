"use client";

import { useState } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import {
  fetchSpaces,
  fetchFolders,
  fetchLists,
  fetchListStatuses,
  saveProjectConfig,
  testProjectConfig,
  type ClickUpOption,
  type TestConfigResult,
} from "@/lib/clickup/actions";
import {
  projectConfigSchema,
  type ProjectConfigFormValues,
} from "@/lib/clickup/validation";
import type { ProjectConfig } from "@/lib/clickup/config";
import type { Project } from "@/lib/ponto/validation";
import { notifyUnexpectedError } from "@/lib/forms/notify-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  project: Project;
  projectLabel: string;
  initialConfig: ProjectConfig | null;
};

const SELECT_CLASS = cn(
  "border-input bg-background text-foreground flex h-11 w-full rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none",
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-destructive",
  "md:text-sm",
);

/** Garante que o valor salvo apareça na lista mesmo que ainda não tenha carregado. */
function withCurrent(
  options: ClickUpOption[],
  current: string,
): ClickUpOption[] {
  if (!current || options.some((o) => o.id === current)) return options;
  return [...options, { id: current, name: `${current} (carregando...)` }];
}

function sourceLabel(source: "list_date" | "list_name" | "backlog"): string {
  if (source === "list_date") return "pela data da própria Lista";
  if (source === "list_name") return "pelo nome da Lista";
  return "foi para o backlog — sprint não resolvida";
}

/**
 * Card de configuração de um projeto: pickers encadeados Space → Folder →
 * Lista de backlog → status de andamento → status de conclusão, formato de
 * data da sprint e liga/desliga. RHF + Zod (CLAUDE.md §7); dados dos pickers
 * vêm do client via React Query (CLAUDE.md §6 — exceção do App Router não se
 * aplica, pois dependem de escolhas feitas na hora).
 */
export function ProjectConfigForm({ project, projectLabel, initialConfig }: Props) {
  const [hasSavedConfig, setHasSavedConfig] = useState(!!initialConfig);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConfigResult | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProjectConfigFormValues>({
    resolver: zodResolver(projectConfigSchema),
    defaultValues: {
      project,
      spaceId: initialConfig?.spaceId ?? "",
      folderId: initialConfig?.folderId ?? "",
      backlogListId: initialConfig?.backlogListId ?? "",
      inProgressStatus: initialConfig?.inProgressStatus ?? "",
      doneStatus: initialConfig?.doneStatus ?? "",
      sprintDateFormat: initialConfig?.sprintDateFormat ?? "dmy",
      enabled: initialConfig?.enabled ?? true,
    },
  });

  // `useWatch` (não `watch()`) — compatível com o React Compiler (memoização
  // segura), diferente do `watch()` de `useForm`, que o compiler não consegue
  // memoizar (aviso do eslint-plugin-react-hooks/incompatible-library).
  const spaceId = useWatch({ control, name: "spaceId" });
  const folderId = useWatch({ control, name: "folderId" });
  const backlogListId = useWatch({ control, name: "backlogListId" });
  const sprintDateFormat = useWatch({ control, name: "sprintDateFormat" });
  const enabled = useWatch({ control, name: "enabled" });

  const spacesQuery = useQuery({
    queryKey: ["clickup", "spaces"],
    queryFn: fetchSpaces,
    staleTime: 5 * 60 * 1000,
  });

  const foldersQuery = useQuery({
    queryKey: ["clickup", "folders", spaceId],
    queryFn: () => fetchFolders(spaceId),
    enabled: !!spaceId,
    staleTime: 5 * 60 * 1000,
  });

  const listsQuery = useQuery({
    queryKey: ["clickup", "lists", folderId],
    queryFn: () => fetchLists(folderId),
    enabled: !!folderId,
    staleTime: 60 * 1000,
  });

  const statusesQuery = useQuery({
    queryKey: ["clickup", "statuses", backlogListId],
    queryFn: () => fetchListStatuses(backlogListId),
    enabled: !!backlogListId,
    staleTime: 60 * 1000,
  });

  const spaceOptions = withCurrent(spacesQuery.data ?? [], spaceId);
  const folderOptions = withCurrent(foldersQuery.data ?? [], folderId);
  const listOptions = withCurrent(
    (listsQuery.data ?? []).map((l) => ({ id: l.id, name: l.name })),
    backlogListId,
  );
  const statusOptions = statusesQuery.data ?? [];

  async function onValid(data: ProjectConfigFormValues) {
    try {
      const res = await saveProjectConfig(data);
      if (res.ok) {
        setHasSavedConfig(true);
        setTestResult(null);
        toast.success(`Configuração de ${projectLabel} salva.`);
        return;
      }
      if (res.fieldErrors) {
        for (const [field, message] of Object.entries(res.fieldErrors)) {
          setError(field as keyof ProjectConfigFormValues, { message });
        }
      } else if (res.error) {
        setError("root", { message: res.error });
      }
    } catch (err) {
      notifyUnexpectedError(err);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testProjectConfig(project);
      setTestResult(res);
    } catch (err) {
      notifyUnexpectedError(err);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          {projectLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4" noValidate>
          <input type="hidden" {...register("project")} />

          {errors.root ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.root.message}
            </p>
          ) : null}

          {/* Space */}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${project}-space`}>Space</Label>
            <Controller
              control={control}
              name="spaceId"
              render={({ field }) => (
                <select
                  id={`${project}-space`}
                  value={field.value}
                  onChange={(e) => {
                    field.onChange(e.target.value);
                    // Muda o Space: tudo que dependia dele fica inválido.
                    setValue("folderId", "");
                    setValue("backlogListId", "");
                    setValue("inProgressStatus", "");
                    setValue("doneStatus", "");
                  }}
                  onBlur={field.onBlur}
                  disabled={spacesQuery.isPending}
                  aria-invalid={!!errors.spaceId || undefined}
                  className={SELECT_CLASS}
                >
                  <option value="">
                    {spacesQuery.isPending ? "Carregando..." : "Selecione..."}
                  </option>
                  {spaceOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            />
            {errors.spaceId ? (
              <p className="text-destructive text-sm">{errors.spaceId.message}</p>
            ) : spacesQuery.isError ? (
              <p className="text-destructive text-sm">Não foi possível carregar os Spaces.</p>
            ) : null}
          </div>

          {/* Folder */}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${project}-folder`}>Folder</Label>
            <Controller
              control={control}
              name="folderId"
              render={({ field }) => (
                <select
                  id={`${project}-folder`}
                  value={field.value}
                  onChange={(e) => {
                    field.onChange(e.target.value);
                    setValue("backlogListId", "");
                    setValue("inProgressStatus", "");
                    setValue("doneStatus", "");
                  }}
                  onBlur={field.onBlur}
                  disabled={!spaceId || foldersQuery.isPending}
                  aria-invalid={!!errors.folderId || undefined}
                  className={SELECT_CLASS}
                >
                  <option value="">
                    {!spaceId
                      ? "Selecione um Space primeiro"
                      : foldersQuery.isPending
                        ? "Carregando..."
                        : "Selecione..."}
                  </option>
                  {folderOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            />
            {errors.folderId ? (
              <p className="text-destructive text-sm">{errors.folderId.message}</p>
            ) : foldersQuery.isError ? (
              <p className="text-destructive text-sm">Não foi possível carregar os Folders.</p>
            ) : null}
          </div>

          {/* Lista de backlog */}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${project}-backlog`}>Lista de backlog</Label>
            <Controller
              control={control}
              name="backlogListId"
              render={({ field }) => (
                <select
                  id={`${project}-backlog`}
                  value={field.value}
                  onChange={(e) => {
                    field.onChange(e.target.value);
                    setValue("inProgressStatus", "");
                    setValue("doneStatus", "");
                  }}
                  onBlur={field.onBlur}
                  disabled={!folderId || listsQuery.isPending}
                  aria-invalid={!!errors.backlogListId || undefined}
                  className={SELECT_CLASS}
                >
                  <option value="">
                    {!folderId
                      ? "Selecione um Folder primeiro"
                      : listsQuery.isPending
                        ? "Carregando..."
                        : "Selecione..."}
                  </option>
                  {listOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            />
            {errors.backlogListId ? (
              <p className="text-destructive text-sm">{errors.backlogListId.message}</p>
            ) : listsQuery.isError ? (
              <p className="text-destructive text-sm">Não foi possível carregar as Listas.</p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Para onde vai o ponto quando nenhuma sprint casa com a data (RF-07).
              </p>
            )}
          </div>

          {/* Status "em andamento" */}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${project}-in-progress`}>Status &quot;em andamento&quot;</Label>
            <Controller
              control={control}
              name="inProgressStatus"
              render={({ field }) => (
                <select
                  id={`${project}-in-progress`}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={!backlogListId || statusesQuery.isPending}
                  aria-invalid={!!errors.inProgressStatus || undefined}
                  className={SELECT_CLASS}
                >
                  <option value="">
                    {!backlogListId
                      ? "Selecione a Lista de backlog primeiro"
                      : statusesQuery.isPending
                        ? "Carregando..."
                        : "Selecione..."}
                  </option>
                  {statusOptions.map((s) => (
                    <option key={s.id} value={s.status}>
                      {s.status}
                    </option>
                  ))}
                </select>
              )}
            />
            {errors.inProgressStatus ? (
              <p className="text-destructive text-sm">{errors.inProgressStatus.message}</p>
            ) : statusesQuery.isError ? (
              <p className="text-destructive text-sm">Não foi possível carregar os status.</p>
            ) : null}
          </div>

          {/* Status "concluído" (opcional) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${project}-done`}>Status &quot;concluído&quot; (opcional)</Label>
            <Controller
              control={control}
              name="doneStatus"
              render={({ field }) => (
                <select
                  id={`${project}-done`}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={!backlogListId || statusesQuery.isPending}
                  className={SELECT_CLASS}
                >
                  <option value="">Nenhum</option>
                  {statusOptions.map((s) => (
                    <option key={s.id} value={s.status}>
                      {s.status}
                    </option>
                  ))}
                </select>
              )}
            />
          </div>

          {/* Formato da data da sprint — segmented control (design system §6) */}
          <div className="flex flex-col gap-2">
            <Label>Formato da data no nome da sprint</Label>
            <div
              role="tablist"
              className="bg-muted flex w-full rounded-lg p-1"
            >
              {(
                [
                  { value: "dmy" as const, label: "DD/MM" },
                  { value: "mdy" as const, label: "MM/DD" },
                ]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={sprintDateFormat === opt.value}
                  onClick={() => setValue("sprintDateFormat", opt.value)}
                  className={cn(
                    "min-h-[44px] flex-1 rounded-md text-sm font-medium transition-colors",
                    sprintDateFormat === opt.value
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-sm">
              Rede de segurança quando a Lista não tem data — usado para ler a
              janela no nome (ex.: &quot;(1/9 - 15/9)&quot;).
            </p>
          </div>

          {/* Ativar/desativar */}
          <label className="flex min-h-[44px] items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="accent-primary size-5 shrink-0"
              checked={enabled}
              onChange={(e) => setValue("enabled", e.target.checked)}
            />
            Ativar integração para {projectLabel}
          </label>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={!hasSavedConfig || testing}
              onClick={handleTest}
            >
              {testing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FlaskConical className="size-4" />
              )}
              Testar
            </Button>
            <Button type="submit" className="h-11" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </div>

          <p className="text-muted-foreground text-sm">
            {!hasSavedConfig
              ? "Salve a configuração antes de testar."
              : "O teste usa a última configuração salva — salve de novo após alterar os campos acima."}
          </p>

          {testResult ? (
            <div
              role="status"
              className={cn(
                "rounded-md border p-3 text-sm",
                testResult.ok
                  ? "border-border bg-muted"
                  : "border-destructive/50 text-destructive",
              )}
            >
              {testResult.ok ? (
                <>
                  Um ponto de hoje iria para a Lista{" "}
                  <span className="font-medium">{testResult.listName}</span> —{" "}
                  {sourceLabel(testResult.source)}.
                </>
              ) : (
                testResult.error
              )}
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
