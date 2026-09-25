CREATE TABLE "reconnection_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reconnection_number" varchar(32) NOT NULL,
	"service_account_id" uuid NOT NULL,
	"request_date" date NOT NULL,
	"fee" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"technician_user_id" uuid,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"approved_by" uuid,
	"notes" text,
	"status" varchar(32) DEFAULT 'REQUESTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconnection_records_reconnection_number_unique" UNIQUE("reconnection_number")
);
--> statement-breakpoint
CREATE TABLE "suspension_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"effective_date" date NOT NULL,
	"approved_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_technician_user_id_users_id_fk" FOREIGN KEY ("technician_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconnection_records_service_account_id_idx" ON "reconnection_records" USING btree ("service_account_id");--> statement-breakpoint
CREATE INDEX "reconnection_records_status_idx" ON "reconnection_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reconnection_records_technician_user_id_idx" ON "reconnection_records" USING btree ("technician_user_id");--> statement-breakpoint
CREATE INDEX "suspension_records_service_account_id_idx" ON "suspension_records" USING btree ("service_account_id");--> statement-breakpoint
CREATE INDEX "suspension_records_created_at_idx" ON "suspension_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoices_status_due_date_idx" ON "invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_sa_status_due_date_idx" ON "invoices" USING btree ("service_account_id","status","due_date");