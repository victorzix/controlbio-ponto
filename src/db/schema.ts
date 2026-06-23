import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Papéis (roles) do sistema.
 *
 * O RBAC em si (quais permissões cada papel tem) vive no código,
 * em `src/lib/rbac.ts` — NÃO há tabela de roles/permissões no banco.
 * Aqui o role é apenas uma coluna enum no próprio usuário.
 */
export const userRole = pgEnum("user_role", [
  "admin", // acesso total
  "gestor", // gerencia equipe / aprova ajustes de ponto
  "funcionario", // registra o próprio ponto
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRole("role").notNull().default("funcionario"),
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