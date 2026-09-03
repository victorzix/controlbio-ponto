import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { registrosPonto, users } from "@/db/schema";
import type { Project } from "./validation";

/**
 * Motivo da última falha de sincronização do registro (spec 011, §8
 * "Observabilidade" e CA-11). `clickup_sync_jobs.last_error` é gravado a cada
 * falha e, sem isto, morria no banco: o card só dizia "falhou".
 *
 * Subconsulta em vez de join para não multiplicar linhas (um ponto pode ter
 * mais de um job — envio original e correções) e para o campo custar zero em
 * registro sem falha. A mensagem vem de `ClickUpError.message`, que é
 * deliberadamente livre de segredo (nunca token, nunca descrição do ponto).
 */
const clickupLastError = sql<string | null>`(
  select j.last_error
    from clickup_sync_jobs j
   where j.entry_id = ${registrosPonto.id}
     and j.status = 'failed'
   order by j.updated_at desc
   limit 1
)`.as("clickup_last_error");

/** Espelha `clickupJobStage` do schema — só usado para o rótulo do badge enquanto `pending`. */
export type ClickUpJobStage =
  | "resolve"
  | "comment"
  | "time_entry"
  | "finish"
  | "done";

/**
 * Etapa do job de sincronização mais recente do registro — alimenta o rótulo
 * granular do badge enquanto `clickup_sync_status = 'pending'` ("enviando",
 * "em progresso", "para revisão"...). Nulo só em registro sem job nenhum
 * (nasceu antes da spec 011, ou com a integração desligada).
 *
 * `order by updated_at desc limit 1` em vez de um `where entry_id = ...`
 * simples: a invariante "um job por registro" (spec 011, P-03) garante no
 * caso comum uma única linha, mas a subconsulta fica correta mesmo se algum
 * registro antigo tiver mais de uma.
 */
const clickupJobStage = sql<ClickUpJobStage | null>`(
  select j.stage
    from clickup_sync_jobs j
   where j.entry_id = ${registrosPonto.id}
   order by j.updated_at desc
   limit 1
)`.as("clickup_job_stage");

/**
 * `move_to_review` do job mais recente — diferencia, na etapa `finish`, entre
 * "finalizando" (sem pedido de revisão) e "movendo para revisão" (RF-09).
 * `false` (não `null`) quando não há job: sem job não há nada em `finish`
 * para rotular de qualquer forma.
 */
const clickupJobMoveToReview = sql<boolean>`coalesce((
  select j.move_to_review
    from clickup_sync_jobs j
   where j.entry_id = ${registrosPonto.id}
   order by j.updated_at desc
   limit 1
), false)`.as("clickup_job_move_to_review");

/** Intervalo de datas (inclusivo), em "YYYY-MM-DD". */
export type DateRange = { from: string; to: string };

/** Estado da sincronização com o ClickUp (spec 011) — espelha `clickupSyncStatus` do schema. */
export type ClickUpSyncStatus = "pending" | "synced" | "failed" | "off";

export type PontoEntry = {
  id: string;
  title: string;
  workDate: string;
  workedMinutes: number;
  description: string;
  link: string | null;
  project: Project;
  createdAt: Date;
  // Estado de sincronização com o ClickUp (spec 011) — alimenta o badge do
  // card do ponto (Tarefa 16).
  clickupTaskId: string | null;
  clickupTaskUrl: string | null;
  clickupSyncStatus: ClickUpSyncStatus;
  // Como o destino foi decidido (`SprintPick["source"]` de `lib/clickup/sprint.ts`):
  // 'backlog' sinaliza "sincronizado, sem sprint" (RF-07, CA-21). Nulo enquanto
  // não sincronizado.
  clickupSprintSource: string | null;
  /** Motivo da última falha (CA-11). Nulo quando não há job `failed`. */
  clickupLastError: string | null;
  /** Etapa do job mais recente — rótulo granular do badge enquanto `pending`. */
  clickupJobStage: ClickUpJobStage | null;
  /** RF-09: só some do "finish" a diferença entre finalizar e mover a revisão. */
  clickupJobMoveToReview: boolean;
};

/**
 * Lista os registros de ponto do próprio usuário, mais recentes primeiro.
 * Sempre filtra por dono (RF-05). Se `range` for passado, restringe ao intervalo
 * de datas (inclusivo).
 */
export async function listOwnEntries(
  userId: string,
  range?: DateRange,
): Promise<PontoEntry[]> {
  const where = range
    ? and(
        eq(registrosPonto.userId, userId),
        gte(registrosPonto.workDate, range.from),
        lte(registrosPonto.workDate, range.to),
      )
    : eq(registrosPonto.userId, userId);

  return db
    .select({
      id: registrosPonto.id,
      title: registrosPonto.title,
      workDate: registrosPonto.workDate,
      workedMinutes: registrosPonto.workedMinutes,
      description: registrosPonto.description,
      link: registrosPonto.link,
      project: registrosPonto.project,
      createdAt: registrosPonto.createdAt,
      clickupTaskId: registrosPonto.clickupTaskId,
      clickupTaskUrl: registrosPonto.clickupTaskUrl,
      clickupSyncStatus: registrosPonto.clickupSyncStatus,
      clickupSprintSource: registrosPonto.clickupSprintSource,
      clickupLastError,
      clickupJobStage,
      clickupJobMoveToReview,
    })
    .from(registrosPonto)
    .where(where)
    .orderBy(desc(registrosPonto.workDate), desc(registrosPonto.createdAt));
}

/** Entrada de ponto com dados do dono — para a visão de equipe (admin). */
export type TeamEntry = PontoEntry & {
  userId: string;
  userName: string;
  hourlyRateCents: number | null;
};

/**
 * Lista os registros de **vários** usuários no intervalo (inclusivo), com nome e
 * valor/hora do dono. Ordena por **usuário** (nome) e, dentro, por **data desc**
 * — para a visão de equipe somente leitura do admin (spec 007). Uso restrito a
 * quem tem `ponto:ver_equipe` (garantido na action). `[]` se sem usuários.
 */
export async function listEntriesByUsers(
  userIds: string[],
  range: DateRange,
): Promise<TeamEntry[]> {
  if (userIds.length === 0) return [];

  return db
    .select({
      id: registrosPonto.id,
      title: registrosPonto.title,
      workDate: registrosPonto.workDate,
      workedMinutes: registrosPonto.workedMinutes,
      description: registrosPonto.description,
      link: registrosPonto.link,
      project: registrosPonto.project,
      createdAt: registrosPonto.createdAt,
      clickupTaskId: registrosPonto.clickupTaskId,
      clickupTaskUrl: registrosPonto.clickupTaskUrl,
      clickupSyncStatus: registrosPonto.clickupSyncStatus,
      clickupSprintSource: registrosPonto.clickupSprintSource,
      clickupLastError,
      clickupJobStage,
      clickupJobMoveToReview,
      userId: registrosPonto.userId,
      userName: users.name,
      hourlyRateCents: users.hourlyRateCents,
    })
    .from(registrosPonto)
    .innerJoin(users, eq(registrosPonto.userId, users.id))
    .where(
      and(
        inArray(registrosPonto.userId, userIds),
        gte(registrosPonto.workDate, range.from),
        lte(registrosPonto.workDate, range.to),
      ),
    )
    .orderBy(
      asc(users.name),
      desc(registrosPonto.workDate),
      desc(registrosPonto.createdAt),
    );
}

/** Valor/hora (em centavos) do usuário, para estimar valores no painel. */
export async function getOwnHourlyRateCents(
  userId: string,
): Promise<number | null> {
  const rows = await db
    .select({ cents: users.hourlyRateCents })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0]?.cents ?? null;
}
