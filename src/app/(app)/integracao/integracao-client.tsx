"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, PlugZap, AlertTriangle } from "lucide-react";
import { fetchConnectionStatus, fetchFailedSyncJobs } from "@/lib/clickup/actions";
import type { ProjectConfig } from "@/lib/clickup/config";
import { PROJECT_OPTIONS, type Project } from "@/lib/ponto/validation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectConfigForm } from "./project-config-form";

type Props = {
  initialConfigs: Partial<Record<Project, ProjectConfig>>;
};

/** "2026-06-25" → "25/06/2026", sem `new Date` (que sofreria com o fuso). */
function formatDateBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Etapa do pipeline em português — o admin não lê o enum do banco. */
const ETAPA_LABEL: Record<string, string> = {
  resolve: "resolver a tarefa",
  comment: "comentar",
  time_entry: "lançar o tempo",
  finish: "concluir",
  done: "finalizar",
};

/**
 * Tela `/integracao` (SPA de configuração): cabeçalho de conexão (token de
 * serviço + pendências) e um card por projeto com o formulário encadeado.
 * Mobile first — cards empilhados, largura cheia (CLAUDE.md §4).
 */
export function IntegracaoClient({ initialConfigs }: Props) {
  const { data: status, isPending } = useQuery({
    queryKey: ["clickup", "connection-status"],
    queryFn: fetchConnectionStatus,
  });

  // Só busca o detalhe quando há o que detalhar — o contador já veio acima.
  const { data: falhas } = useQuery({
    queryKey: ["clickup", "failed-jobs"],
    queryFn: fetchFailedSyncJobs,
    enabled: !!status && status.failedJobs > 0,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Integração com o ClickUp
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Diga para qual Lista do ClickUp cada projeto envia o ponto batido.
        </p>
      </div>

      {/* Cabeçalho de conexão */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlugZap className="text-muted-foreground size-4" />
            Conexão
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isPending ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Verificando conexão...
            </p>
          ) : !status?.configured ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline">Não configurado</Badge>
              <p className="text-muted-foreground text-sm">
                Defina o token de serviço do ClickUp no ambiente.
              </p>
            </div>
          ) : status.ok ? (
            <div className="flex items-center gap-2">
              <Badge variant="default">Conectado</Badge>
              <p className="text-muted-foreground text-sm">
                {status.username} ({status.email})
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <Badge variant="destructive">Falha na conexão</Badge>
              <p className="text-muted-foreground text-sm">{status.error}</p>
            </div>
          )}

          {status && status.failedJobs > 0 ? (
            <div className="border-border flex flex-col gap-2 border-t pt-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-destructive size-4 shrink-0" />
                <p className="text-sm">
                  <span className="font-medium">{status.failedJobs}</span>{" "}
                  {status.failedJobs === 1
                    ? "envio pendente com falha"
                    : "envios pendentes com falha"}
                </p>
              </div>

              {/*
                O motivo, e não só a contagem: spec §8 pede que o admin consiga
                responder "por que este ponto não chegou lá?" sem abrir log de
                servidor. `lastError` vem de `ClickUpError.message` — sem token
                e sem a descrição do ponto.
              */}
              {falhas && falhas.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {falhas.map((f) => (
                    <li
                      key={f.jobId}
                      className="bg-muted/40 flex flex-col gap-0.5 rounded-md px-3 py-2"
                    >
                      <p className="text-sm font-medium break-words">
                        {f.entryTitle}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {f.userName} · {formatDateBR(f.workDate)} · parou ao{" "}
                        {ETAPA_LABEL[f.stage] ?? f.stage}
                      </p>
                      <p className="text-destructive text-xs break-words">
                        {f.lastError ?? "Motivo não registrado."}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Um card por projeto */}
      <div className="flex flex-col gap-4">
        {PROJECT_OPTIONS.map(({ value, label }) => (
          <ProjectConfigForm
            key={value}
            project={value}
            projectLabel={label}
            initialConfig={initialConfigs[value] ?? null}
          />
        ))}
      </div>
    </div>
  );
}
