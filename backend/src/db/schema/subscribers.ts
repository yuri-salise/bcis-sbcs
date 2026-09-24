import { pgTable, uuid, text, varchar, boolean, integer, smallint, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth.js";

export const serviceTypes = pgTable("service_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(), // INTERNET, CABLE, COMBO
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const servicePlans = pgTable("service_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceTypeId: uuid("service_type_id")
    .notNull()
    .references(() => serviceTypes.id, { onDelete: "restrict" }),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  monthlyPrice: numeric("monthly_price", { precision: 14, scale: 2 }).notNull(),
  installationFee: numeric("installation_fee", { precision: 14, scale: 2 }).default("0.00").notNull(),
  reconnectionFee: numeric("reconnection_fee", { precision: 14, scale: 2 }).default("0.00").notNull(),
  speedMbps: integer("speed_mbps"),
  channelCount: integer("channel_count"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const collectionAreas = pgTable("collection_areas", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const collectors = pgTable("collectors", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  collectorCode: varchar("collector_code", { length: 32 }).notNull().unique(),
  name: text("name").notNull(),
  contactNumber: text("contact_number"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subscribers = pgTable("subscribers", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountNumber: varchar("account_number", { length: 32 }).notNull().unique(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name").notNull(),
  businessName: text("business_name"),
  primaryContactNumber: text("primary_contact_number").notNull(),
  secondaryContactNumber: text("secondary_contact_number"),
  email: text("email"),
  status: varchar("status", { length: 32 }).default("ACTIVE").notNull(), // ACTIVE, INACTIVE, TERMINATED, ARCHIVED
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const subscriberAddresses = pgTable("subscriber_addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id")
    .notNull()
    .references(() => subscribers.id, { onDelete: "cascade" }),
  label: text("label").default("Home").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2"),
  barangay: text("barangay").notNull(),
  cityMunicipality: text("city_municipality").default("Malaybalay City").notNull(),
  province: text("province").default("Bukidnon").notNull(),
  postalCode: text("postal_code").default("8700"),
  landmark: text("landmark"),
  isPrimary: boolean("is_primary").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const serviceAccounts = pgTable("service_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriberId: uuid("subscriber_id")
    .notNull()
    .references(() => subscribers.id, { onDelete: "cascade" }),
  serviceAccountNumber: varchar("service_account_number", { length: 32 }).notNull().unique(),
  serviceTypeId: uuid("service_type_id")
    .notNull()
    .references(() => serviceTypes.id, { onDelete: "restrict" }),
  servicePlanId: uuid("service_plan_id")
    .notNull()
    .references(() => servicePlans.id, { onDelete: "restrict" }),
  installationAddressId: uuid("installation_address_id")
    .notNull()
    .references(() => subscriberAddresses.id, { onDelete: "restrict" }),
  activationDate: date("activation_date").notNull(),
  billingStartDate: date("billing_start_date").notNull(),
  billingDay: smallint("billing_day").default(1).notNull(),
  dueDay: smallint("due_day").default(15).notNull(),
  currentRate: numeric("current_rate", { precision: 14, scale: 2 }).notNull(),
  status: varchar("status", { length: 32 }).default("ACTIVE").notNull(), // PENDING, ACTIVE, SUSPENDED, DISCONNECTED, TERMINATED
  collectorId: uuid("collector_id").references(() => collectors.id, { onDelete: "set null" }),
  collectionAreaId: uuid("collection_area_id").references(() => collectionAreas.id, { onDelete: "set null" }),
  cachedBalanceDue: numeric("cached_balance_due", { precision: 14, scale: 2 }).default("0.00").notNull(),
  lastBilledAt: timestamp("last_billed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const serviceAccountStatusHistory = pgTable("service_account_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceAccountId: uuid("service_account_id")
    .notNull()
    .references(() => serviceAccounts.id, { onDelete: "cascade" }),
  fromStatus: varchar("from_status", { length: 32 }).notNull(),
  toStatus: varchar("to_status", { length: 32 }).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).defaultNow().notNull(),
  reason: text("reason").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
