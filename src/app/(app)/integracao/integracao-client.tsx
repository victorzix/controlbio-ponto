"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, PlugZap, AlertTriangle } from "lucide-react";
import { fetchConnectionStatus } from "@/lib/clickup/actions";
import type { ProjectConfig } from "@/lib/clickup/config";
import { PROJECT_OPTIONS, type Project } from "@/lib/ponto/validation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectConfigForm } from "./project-config-form";

type Props = {
  initialConfigs: Partial<Record<Project, ProjectConfig>>;
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
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-destructive size-4 shrink-0" />
              <p className="text-sm">
                <span className="font-medium">{status.failedJobs}</span>{" "}
                {status.failedJobs === 1
                  ? "envio pendente com falha"
                  : "envios pendentes com falha"}
              </p>
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
