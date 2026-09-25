CREATE TABLE "billing_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_code" varchar(32) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"billing_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "billing_cycles_cycle_code_unique" UNIQUE("cycle_code")
);
--> statement-breakpoint
CREATE TABLE "invoice_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"adjustment_type" varchar(16) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"requested_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_type" varchar(32) NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"source_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(32) NOT NULL,
	"service_account_id" uuid NOT NULL,
	"billing_cycle_id" uuid NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" varchar(32) DEFAULT 'UNPAID' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount_total" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"penalty_total" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"adjustment_total" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"amount_paid_cache" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"balance_due_cache" numeric(14, 2) NOT NULL,
	"finalized_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_service_account_billing_cycle_unique" UNIQUE("service_account_id","billing_cycle_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"entry_no" integer NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_date" date NOT NULL,
	"reference_type" varchar(32) NOT NULL,
	"reference_id" uuid NOT NULL,
	"description" text NOT NULL,
	"debit_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"credit_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"currency" varchar(3) DEFAULT 'PHP' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;