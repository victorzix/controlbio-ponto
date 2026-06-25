ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" varchar(120);--> statement-breakpoint
-- Backfill: deriva o username das linhas existentes a partir do 1o nome
-- (minusculas). Nao remove acentos (sem extensao unaccent); ajuste manual
-- depois se necessario. Ver docs/specs/004-login-por-nome/design.md §2.
UPDATE "users" SET "username" = lower(split_part("name", ' ', 1)) WHERE "username" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");