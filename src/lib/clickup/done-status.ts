import type { ProjectConfig } from "./config";

// `import type` — não importa `./config` em tempo de execução (que por sua vez
// importa `@/db`, exigindo `DATABASE_URL`). Mesmo motivo de `enabled.ts`: esta
// função precisa funcionar (e ser testável) sem nenhuma credencial/banco.

/**
 * Só há para onde mover uma tarefa "para revisão" se o projeto tiver um
 * `doneStatus` configurado (e habilitado — `getProjectConfig` já devolve
 * `null` quando desligado, RN-08). Usado para decidir se o interruptor de
 * "mover para revisão" aparece no modal de finalização do cronômetro (spec
 * 011, task 17) — sem status configurado, o controle seria uma promessa vazia.
 */
export function hasDoneStatus(config: ProjectConfig | null): boolean {
  return Boolean(config?.doneStatus);
}
