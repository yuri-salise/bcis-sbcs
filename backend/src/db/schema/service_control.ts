import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { serviceAccounts } from "./subscribers.js";

/**
 * Service Suspension Records
 * Authoritative record of service disconnection / suspension events.
 * PRODUCT.md Section 8.10
 */
export const suspensionRecords = pgTable(
  "suspension_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serviceAccountId: uuid("service_account_id")
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(), // NON_PAYMENT, OVERDUE_BALANCE, SUBSCRIBER_REQUEST, MAINTENANCE, VIOLATION_OF_TERMS
    effectiveDate: date("effective_date").notNull(),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("suspension_records_service_account_id_idx").on(table.serviceAccountId),
    index("suspension_records_created_at_idx").on(table.createdAt),
  ]
);

/**
 * Service Reconnection Records
 * Authoritative record of reconnection requests and work orders.
 * PRODUCT.md Section 8.10
 */
export const reconnectionRecords = pgTable(
  "reconnection_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reconnectionNumber: varchar("reconnection_number", { length: 32 }).notNull().unique(), // BCIS-RECON-YYYY-NNNN
    serviceAccountId: uuid("service_account_id")
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: "cascade" }),
    requestDate: date("request_date").notNull(),
    fee: numeric("fee", { precision: 14, scale: 2 }).default("0.00").notNull(),
    technicianUserId: uuid("technician_user_id").references(() => users.id, { onDelete: "set null" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    status: varchar("status", { length: 32 }).default("REQUESTED").notNull(), // REQUESTED, SCHEDULED, COMPLETED, CANCELLED
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("reconnection_records_service_account_id_idx").on(table.serviceAccountId),
    index("reconnection_records_status_idx").on(table.status),
    index("reconnection_records_technician_user_id_idx").on(table.technicianUserId),
  ]
);

export type SuspensionRecord = typeof suspensionRecords.$inferSelect;
export type NewSuspensionRecord = typeof suspensionRecords.$inferInsert;
export type ReconnectionRecord = typeof reconnectionRecords.$inferSelect;
export type NewReconnectionRecord = typeof reconnectionRecords.$inferInsert;
