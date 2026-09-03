CREATE TYPE "public"."clickup_job_kind" AS ENUM('push_entry', 'correction');--> statement-breakpoint
CREATE TYPE "public"."clickup_job_stage" AS ENUM('resolve', 'comment', 'time_entry', 'finish', 'done');--> statement-breakpoint
CREATE TYPE "public"."clickup_job_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."clickup_sync_status" AS ENUM('pending', 'synced', 'failed', 'off');--> statement-breakpoint
CREATE TABLE "clickup_project_config" (
	"project" "project" PRIMARY KEY NOT NULL,
	"space_id" varchar(64) NOT NULL,
	"folder_id" varchar(64) NOT NULL,
	"backlog_list_id" varchar(64) NOT NULL,
	"in_progress_status" varchar(120) NOT NULL,
	"done_status" varchar(120),
	"sprint_date_format" varchar(8) DEFAULT 'dmy' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "clickup_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "clickup_job_kind" NOT NULL,
	"entry_id" uuid NOT NULL,
	"stage" "clickup_job_stage" DEFAULT 'resolve' NOT NULL,
	"status" "clickup_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"clickup_task_id" varchar(64),
	"clickup_comment_id" varchar(64),
	"clickup_time_entry_id" varchar(64),
	"move_to_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clickup_task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project" "project" NOT NULL,
	"normalized_title" varchar(160) NOT NULL,
	"clickup_task_id" varchar(64) NOT NULL,
	"clickup_task_url" varchar(512) NOT NULL,
	"sprint_list_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registros_ponto" ADD COLUMN "clickup_task_id" varchar(64);--> statement-breakpoint
ALTER TABLE "registros_ponto" ADD COLUMN "clickup_task_url" varchar(512);--> statement-breakpoint
ALTER TABLE "registros_ponto" ADD COLUMN "clickup_sync_status" "clickup_sync_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clickup_user_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clickup_token_enc" varchar(512);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clickup_token_label" varchar(120);--> statement-breakpoint
ALTER TABLE "clickup_project_config" ADD CONSTRAINT "clickup_project_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clickup_sync_jobs" ADD CONSTRAINT "clickup_sync_jobs_entry_id_registros_ponto_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."registros_ponto"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clickup_sync_jobs_pickup_idx" ON "clickup_sync_jobs" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "clickup_sync_jobs_entry_idx" ON "clickup_sync_jobs" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clickup_task_links_project_title_idx" ON "clickup_task_links" USING btree ("project","normalized_title");