ALTER TABLE "registros_ponto" ADD COLUMN "title" varchar(120);--> statement-breakpoint
-- Backfill: usa a 1a linha da descricao (ate 120 chars) como titulo das linhas
-- existentes; cai para 'Registro' se ficar vazio. Ver spec 003.
UPDATE "registros_ponto" SET "title" = coalesce(nullif(left(split_part("description", E'\n', 1), 120), ''), 'Registro') WHERE "title" IS NULL;--> statement-breakpoint
ALTER TABLE "registros_ponto" ALTER COLUMN "title" SET NOT NULL;
