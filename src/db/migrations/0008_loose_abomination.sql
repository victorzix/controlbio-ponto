CREATE TYPE "public"."project" AS ENUM('dw', 'labphase');--> statement-breakpoint
ALTER TABLE "registros_ponto" ADD COLUMN "project" "project" DEFAULT 'labphase' NOT NULL;