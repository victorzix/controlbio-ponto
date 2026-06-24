CREATE TABLE "registros_ponto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"worked_minutes" integer NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registros_ponto" ADD CONSTRAINT "registros_ponto_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registros_ponto_user_date_idx" ON "registros_ponto" USING btree ("user_id","work_date");