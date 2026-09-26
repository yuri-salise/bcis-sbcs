CREATE TABLE "backup_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backup_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	"file_size_bytes" bigint,
	"sha256" text,
	"table_counts" jsonb,
	"created_by" uuid,
	"verified_at" timestamp with time zone,
	"verification_status" text DEFAULT 'PENDING' NOT NULL,
	"verification_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_history" ADD CONSTRAINT "backup_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_history_started_at_idx" ON "backup_history" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "backup_history_status_idx" ON "backup_history" USING btree ("status");