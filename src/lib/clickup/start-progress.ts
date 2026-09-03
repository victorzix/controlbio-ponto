/**
 * Gatilho "iniciar cronômetro" — spec 011. Marca a tarefa "em andamento" no
 * ClickUp já ao começar a trabalhar, sem esperar o envio de verdade (que só
 * acontece ao encerrar, via a fila de `queue.ts`).
 *
 * Roda **direto no processo da app** (não no worker): reaproveita o mesmo
 * `ClickUpClient` de serviço que `/integracao` já usa para os pickers
 * (`getServiceClient`, `clickup/data.ts`) — este processo já recebe
 * `CLICKUP_API_TOKEN`/`CLICKUP_TEAM_ID` no `docker-compose.yml`. Não passa
 * pela fila/worker de propósito: é uma leitura+talvez-uma-escrita cosmética,
 * não um efeito que precise sobreviver a reinício, ter retry com backoff ou
 * aparecer no painel de falhas do admin — colocá-la na fila obrigaria o job a
 * existir ANTES de haver um registro de ponto (a fila hoje é por
 * `entry_id`, e o registro só nasce ao encerrar o cronômetro).
 *
 * NUNCA lança: chamada em fire-and-forget por `startTracking`
 * (`tracking/actions.ts`) — "iniciar cronômetro" não pode esperar rede do
 * ClickUp nem falhar por causa dela.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getServiceClient } from "./data";
import { getProjectConfig } from "./config";
import { findTaskLink, upsertTaskLink } from "./links";
import { ensureTaskInProgress } from "./pipeline";
import type { Project } from "@/lib/ponto/validation";
import { todayBrasiliaISO } from "@/lib/tz";

export async function markStartedInClickUp(input: {
  userId: string;
  title: string;
  project: Project;
}): Promise<void> {
  try {
    const client = getServiceClient();
    if (!client) return; // integração sem credencial de app — nada a fazer.

    const config = await getProjectConfig(input.project);
    if (!config) return; // RN-08: projeto sem configuração (ou desligado).

    const rows = await db
      .select({ clickupUserId: users.clickupUserId })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    const assignee = rows[0]?.clickupUserId;
    if (assignee == null) return; // RN-09: sem vínculo, não sincroniza.

    await ensureTaskInProgress(
      { title: input.title, project: input.project, workDate: todayBrasiliaISO() },
      assignee,
      config,
      { client, findLink: findTaskLink, upsertLink: upsertTaskLink },
    );
  } catch (err) {
    // Cosmético: erro aqui não impede nada — a pessoa já está trabalhando, e
    // o envio de verdade (ao encerrar) segue confiável e observável na fila.
    console.error(
      "clickup: falha ao marcar tarefa em andamento ao iniciar cronometro:",
      err instanceof Error ? err.message : err,
    );
  }
}
