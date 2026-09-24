CREATE TABLE "collection_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_areas_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "collectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"collector_code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"contact_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collectors_collector_code_unique" UNIQUE("collector_code")
);
--> statement-breakpoint
CREATE TABLE "service_account_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"from_status" varchar(32) NOT NULL,
	"to_status" varchar(32) NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"service_account_number" varchar(32) NOT NULL,
	"service_type_id" uuid NOT NULL,
	"service_plan_id" uuid NOT NULL,
	"installation_address_id" uuid NOT NULL,
	"activation_date" date NOT NULL,
	"billing_start_date" date NOT NULL,
	"billing_day" smallint DEFAULT 1 NOT NULL,
	"due_day" smallint DEFAULT 15 NOT NULL,
	"current_rate" numeric(14, 2) NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"collector_id" uuid,
	"collection_area_id" uuid,
	"cached_balance_due" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"last_billed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_accounts_service_account_number_unique" UNIQUE("service_account_number")
);
--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_type_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"monthly_price" numeric(14, 2) NOT NULL,
	"installation_fee" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"reconnection_fee" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"speed_mbps" integer,
	"channel_count" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscriber_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"label" text DEFAULT 'Home' NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"barangay" text NOT NULL,
	"city_municipality" text DEFAULT 'Malaybalay City' NOT NULL,
	"province" text DEFAULT 'Bukidnon' NOT NULL,
	"postal_code" text DEFAULT '8700',
	"landmark" text,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_number" varchar(32) NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"business_name" text,
	"primary_contact_number" text NOT NULL,
	"secondary_contact_number" text,
	"email" text,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "subscribers_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
ALTER TABLE "collectors" ADD CONSTRAINT "collectors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_account_status_history" ADD CONSTRAINT "service_account_status_history_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_account_status_history" ADD CONSTRAINT "service_account_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_service_plan_id_service_plans_id_fk" FOREIGN KEY ("service_plan_id") REFERENCES "public"."service_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_installation_address_id_subscriber_addresses_id_fk" FOREIGN KEY ("installation_address_id") REFERENCES "public"."subscriber_addresses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_addresses" ADD CONSTRAINT "subscriber_addresses_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;