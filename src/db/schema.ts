import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
  integer,
  date,
  text,
} from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("registros_ponto_user_date_idx").on(t.userId, t.workDate)],
);

export type RegistroPonto = typeof registrosPonto.$inferSelect;
export type NewRegistroPonto = typeof registrosPonto.$inferInsert;