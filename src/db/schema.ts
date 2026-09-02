import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  integer,
  date,
  text,
} from "drizzle-orm/pg-core";

export const projectEnum = pgEnum("project", ["dw", "labphase"]);

/** Estado da sincronização de um registro com o ClickUp (spec 011). */
export const clickupSyncStatus = pgEnum("clickup_sync_status", [
  "pending", // enfileirado, ainda não chegou lá
  "synced", // tarefa + comentário criados
  "failed", // desistiu após as tentativas; exige reenvio manual
  "off", // criado com a integração desligada — não sincroniza
]);

/** Tipo do job da fila de sincronização — RN-06 distingue envio inicial de correção. */
export const clickupJobKind = pgEnum("clickup_job_kind", [
  "push_entry", // primeiro envio do registro
  "correction", // registro editado depois de sincronizado (RN-06)
]);

/** Etapa da máquina de estados do pipeline de sincronização (design.md §4). */
export const clickupJobStage = pgEnum("clickup_job_stage", [
  "resolve",
  "comment",
  "time_entry",
  "finish",
  "done",
]);

/** Status de execução do job na fila. */
export const clickupJobStatus = pgEnum("clickup_job_status", [
  "pending",
  "running",
  "done",
  "failed",
]);

/**
 * Papéis (roles) do sistema.
 *
 * O RBAC em si (quais permissões cada papel tem) vive no código,
 * em `src/lib/rbac.ts` — NÃO há tabela de roles/permissões no banco.
 * Aqui o role é apenas uma coluna enum no próprio usuário.
 */
export const userRole = pgEnum("user_role", [
  "admin", // acesso total (gerencia usuários, vê tudo)
  "funcionario", // registra o próprio ponto
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  // Login do usuário: primeiro nome normalizado (minúsculo, sem acento, a-z0-9).
  // É o identificador de autenticação. Ver `docs/specs/004-login-por-nome`.
  username: varchar("username", { length: 120 }).notNull().unique(),
  // E-mail é opcional e NÃO é usado para login (spec 004). Mantém unicidade.
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRole("role").notNull().default("funcionario"),
  // Valor da hora de trabalho, em centavos (ex.: R$ 50,00 = 5000). Opcional.
  hourlyRateCents: integer("hourly_rate_cents"),
  // Vínculo com o membro do ClickUp — usado como assignee (spec 011, RN-09).
  clickupUserId: integer("clickup_user_id"),
  // Token pessoal do ClickUp, CIFRADO (AES-256-GCM). Opcional: sem ele o ponto
  // sincroniza normalmente, só não lança tempo no nome da pessoa (RN-12).
  clickupTokenEnc: varchar("clickup_token_enc", { length: 512 }),
  // Rótulo exibível ("conectado como X"). O token em si nunca volta ao client.
  clickupTokenLabel: varchar("clickup_token_label", { length: 120 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Tipos inferidos para uso na aplicação.
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = (typeof userRole.enumValues)[number];

/**
 * Sessões de autenticação.
 *
 * Sessão é persistida no servidor (não usamos JWT stateless) para permitir
 * revogação imediata — logout e desativação de conta valem na hora. Ver
 * `docs/specs/001-autenticacao/design.md` §2.
 *
 * O cookie carrega o token em claro; aqui guardamos só o SHA-256 dele
 * (`token_hash`). Vazamento do banco não permite forjar sessões.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userAgent: varchar("user_agent", { length: 255 }),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

/**
 * Registros de ponto.
 *
 * Lançamento manual de tempo trabalhado por dia (não é relógio de batida):
 * tempo trabalhado (em minutos), o dia e uma descrição em Markdown.
 * Ver `docs/specs/003-registro-de-ponto/design.md` §2.
 */
export const registrosPonto = pgTable(
  "registros_ponto",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Título curto do registro (ex.: "Atendimento cliente X").
    title: varchar("title", { length: 120 }).notNull(),
    // O dia trabalhado (sem hora) — string YYYY-MM-DD para evitar bug de fuso.
    workDate: date("work_date", { mode: "string" }).notNull(),
    // Total de minutos trabalhados (> 0, ≤ 1440). A UI converte para H:M.
    workedMinutes: integer("worked_minutes").notNull(),
    // Descrição em Markdown (subset seguro — ver renderer em components/ui/markdown.tsx).
    description: text("description").notNull(),
    // Link opcional da tarefa (ex.: ClickUp). Quando presente, é http(s).
    link: varchar("link", { length: 2048 }),
    project: projectEnum("project").notNull().default("labphase"),
    // Tarefa do ClickUp que recebeu este registro (spec 011).
    clickupTaskId: varchar("clickup_task_id", { length: 64 }),
    clickupTaskUrl: varchar("clickup_task_url", { length: 512 }),
    clickupSyncStatus: clickupSyncStatus("clickup_sync_status")
      .notNull()
      .default("pending"),
    // Como o destino do envio foi decidido (`pickSprintList`, spec 011 RF-07):
    // 'list_date' | 'list_name' | 'backlog'. Nulo enquanto não sincronizado.
    // Sinaliza na UI quando o ponto caiu no backlog por falta de sprint
    // correspondente ao dia (CA-21) — não é enum porque o valor espelha
    // `SprintPick["source"]` de `lib/clickup/sprint.ts`, cuja fonte da verdade
    // já é o tipo TypeScript, não o banco.
    clickupSprintSource: varchar("clickup_sprint_source", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("registros_ponto_user_date_idx").on(t.userId, t.workDate)],
);

export type RegistroPonto = typeof registrosPonto.$inferSelect;
export type NewRegistroPonto = typeof registrosPonto.$inferInsert;

/**
 * Tracking de tempo (cronômetro de ponto) — spec 010.
 *
 * É um **rascunho** persistido: o usuário inicia informando só título e projeto
 * e o tempo é derivado dos `time_tracking_segments` (quando começou/terminou
 * cada trecho). `UNIQUE(user_id)` garante **no máximo um** cronômetro ativo por
 * usuário (RN-01). Ao encerrar/finalizar, cada segmento vira um `registros_ponto`
 * e o rascunho é apagado.
 */
export const timeTrackings = pgTable("time_trackings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 120 }).notNull(),
  project: projectEnum("project").notNull().default("labphase"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type TimeTracking = typeof timeTrackings.$inferSelect;
export type NewTimeTracking = typeof timeTrackings.$inferInsert;

/**
 * Segmentos (trechos play→pause) de um tracking.
 *
 * `ended_at IS NULL` = segmento **aberto** (o cronômetro está rodando). O índice
 * único parcial garante **no máximo um** segmento aberto por tracking (RN-05/16).
 * O tempo total do tracking é `Σ (ended_at ?? agora) − started_at`.
 */
export const timeTrackingSegments = pgTable(
  "time_tracking_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackingId: uuid("tracking_id")
      .notNull()
      .references(() => timeTrackings.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("time_tracking_segments_tracking_idx").on(t.trackingId),
    // No máximo um segmento aberto (ended_at nulo) por tracking.
    uniqueIndex("time_tracking_segments_one_open_idx")
      .on(t.trackingId)
      .where(sql`${t.endedAt} is null`),
  ],
);

export type TimeTrackingSegment = typeof timeTrackingSegments.$inferSelect;
export type NewTimeTrackingSegment = typeof timeTrackingSegments.$inferInsert;

/**
 * Configuração da integração com o ClickUp, por projeto — spec 011 (RF-10, RF-11).
 *
 * Um projeto (`projectEnum`) tem no máximo uma configuração — daí a chave primária
 * ser o próprio `project`, sem `id` separado. Sem linha aqui (ou com `enabled = false`)
 * o pipeline falha de forma terminal (`CONFIG_AUSENTE`, RN-08).
 */
export const clickupProjectConfig = pgTable("clickup_project_config", {
  project: projectEnum("project").primaryKey(),
  spaceId: varchar("space_id", { length: 64 }).notNull(),
  folderId: varchar("folder_id", { length: 64 }).notNull(),
  backlogListId: varchar("backlog_list_id", { length: 64 }).notNull(),
  // Status resolvidos por ID (nome muda; ID não).
  inProgressStatus: varchar("in_progress_status", { length: 120 }).notNull(),
  doneStatus: varchar("done_status", { length: 120 }),
  // Fallback do parse de nome de sprint: 'dmy' (1/9/26) ou 'mdy' (7/8).
  sprintDateFormat: varchar("sprint_date_format", { length: 8 })
    .notNull()
    .default("dmy"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export type ClickUpProjectConfig = typeof clickupProjectConfig.$inferSelect;
export type NewClickUpProjectConfig = typeof clickupProjectConfig.$inferInsert;

/**
 * Índice (projeto, título normalizado) → tarefa do ClickUp — spec 011.
 *
 * Evita rebuscar no ClickUp a cada ponto batido para a mesma atividade. A chave
 * de identidade é `(project, normalized_title)` **sem** a sprint (RN-01): a sprint
 * é atributo da tarefa, não parte da identidade — o carry over (RF-17) faz a
 * mesma atividade migrar de sprint em vez de gerar tarefa nova.
 */
export const clickupTaskLinks = pgTable(
  "clickup_task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    project: projectEnum("project").notNull(),
    normalizedTitle: varchar("normalized_title", { length: 160 }).notNull(),
    clickupTaskId: varchar("clickup_task_id", { length: 64 }).notNull(),
    clickupTaskUrl: varchar("clickup_task_url", { length: 512 }).notNull(),
    sprintListId: varchar("sprint_list_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("clickup_task_links_project_title_idx").on(
      t.project,
      t.normalizedTitle,
    ),
  ],
);

export type ClickUpTaskLink = typeof clickupTaskLinks.$inferSelect;
export type NewClickUpTaskLink = typeof clickupTaskLinks.$inferInsert;

/**
 * Fila de sincronização com o ClickUp — spec 011.
 *
 * Cada job avança por etapas (`stage`) e grava seu progresso antes de seguir para
 * a próxima — é o que garante idempotência num retry (RN-13): ele retoma de onde
 * parou, nunca do início. `ON DELETE CASCADE` em `entry_id` implementa RN-07:
 * excluir o ponto remove o job pendente e não toca em nada no ClickUp.
 */
export const clickupSyncJobs = pgTable(
  "clickup_sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: clickupJobKind("kind").notNull(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => registrosPonto.id, { onDelete: "cascade" }),
    stage: clickupJobStage("stage").notNull().default("resolve"),
    status: clickupJobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRunAt: timestamp("next_run_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    // Progresso persistido por etapa — é o que impede duplicar no retry (RN-13).
    clickupTaskId: varchar("clickup_task_id", { length: 64 }),
    clickupCommentId: varchar("clickup_comment_id", { length: 64 }),
    clickupTimeEntryId: varchar("clickup_time_entry_id", { length: 64 }),
    // Encerrar o cronômetro pediu para mover ao status de conclusão (RF-09).
    moveToReview: boolean("move_to_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("clickup_sync_jobs_pickup_idx").on(t.status, t.nextRunAt),
    index("clickup_sync_jobs_entry_idx").on(t.entryId),
  ],
);

export type ClickUpSyncJob = typeof clickupSyncJobs.$inferSelect;
export type NewClickUpSyncJob = typeof clickupSyncJobs.$inferInsert;