CREATE TABLE "time_tracking_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracking_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_trackings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"project" "project" DEFAULT 'labphase' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_trackings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "time_tracking_segments" ADD CONSTRAINT "time_tracking_segments_tracking_id_time_trackings_id_fk" FOREIGN KEY ("tracking_id") REFERENCES "public"."time_trackings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_trackings" ADD CONSTRAINT "time_trackings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_tracking_segments_tracking_idx" ON "time_tracking_segments" USING btree ("tracking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "time_tracking_segments_one_open_idx" ON "time_tracking_segments" USING btree ("tracking_id") WHERE "time_tracking_segments"."ended_at" is null;