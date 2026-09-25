CREATE TABLE "collection_batch_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_batch_id" uuid NOT NULL,
	"service_account_id" uuid NOT NULL,
	"invoice_id" uuid,
	"expected_amount" numeric(14, 2) NOT NULL,
	"collected_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"payment_id" uuid,
	"status" varchar(32) DEFAULT 'UNPAID' NOT NULL,
	"notes" text,
	"collected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_number" varchar(32) NOT NULL,
	"collector_id" uuid NOT NULL,
	"collection_area_id" uuid NOT NULL,
	"collection_date" date NOT NULL,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"expected_cash" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"expected_non_cash" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"expected_total" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"collected_cash" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"collected_non_cash" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"collected_total" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"remitted_cash" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"difference" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"shortage_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"overage_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"opened_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"reconciled_by" uuid,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_batches_batch_number_unique" UNIQUE("batch_number")
);
--> statement-breakpoint
CREATE TABLE "collector_remittances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_batch_id" uuid NOT NULL,
	"remittance_number" varchar(32) NOT NULL,
	"remitted_cash" numeric(14, 2) NOT NULL,
	"remitted_gcash" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"remitted_bank_transfer" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"other_non_cash" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"total_remitted" numeric(14, 2) NOT NULL,
	"expected_cash" numeric(14, 2) NOT NULL,
	"shortage_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"overage_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"received_by" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collector_remittances_remittance_number_unique" UNIQUE("remittance_number")
);
--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_collection_batch_id_collection_batches_id_fk" FOREIGN KEY ("collection_batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_reconciled_by_users_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_remittances" ADD CONSTRAINT "collector_remittances_collection_batch_id_collection_batches_id_fk" FOREIGN KEY ("collection_batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_remittances" ADD CONSTRAINT "collector_remittances_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batch_accounts_batch_idx" ON "collection_batch_accounts" USING btree ("collection_batch_id");--> statement-breakpoint
CREATE INDEX "batch_accounts_service_account_idx" ON "collection_batch_accounts" USING btree ("service_account_id");--> statement-breakpoint
CREATE INDEX "batch_accounts_invoice_idx" ON "collection_batch_accounts" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "batch_accounts_status_idx" ON "collection_batch_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "collection_batches_status_idx" ON "collection_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "collection_batches_date_idx" ON "collection_batches" USING btree ("collection_date");--> statement-breakpoint
CREATE INDEX "collection_batches_collector_idx" ON "collection_batches" USING btree ("collector_id");--> statement-breakpoint
CREATE INDEX "collection_batches_area_idx" ON "collection_batches" USING btree ("collection_area_id");--> statement-breakpoint
CREATE INDEX "collection_batches_number_idx" ON "collection_batches" USING btree ("batch_number");--> statement-breakpoint
CREATE INDEX "collector_remittances_batch_idx" ON "collector_remittances" USING btree ("collection_batch_id");--> statement-breakpoint
CREATE INDEX "collector_remittances_number_idx" ON "collector_remittances" USING btree ("remittance_number");--> statement-breakpoint
CREATE INDEX "collector_remittances_received_at_idx" ON "collector_remittances" USING btree ("received_at");