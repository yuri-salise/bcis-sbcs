import {
  pgTable,
  uuid,
  text,
  varchar,
  numeric,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { collectors, collectionAreas, serviceAccounts } from "./subscribers.js";
import { invoices } from "./billing.js";
import { payments } from "./payments.js";

export const collectionBatches = pgTable(
  "collection_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchNumber: varchar("batch_number", { length: 32 }).notNull().unique(), // e.g. "BCIS-BATCH-2026-0001"
    collectorId: uuid("collector_id")
      .notNull()
      .references(() => collectors.id, { onDelete: "restrict" }),
    collectionAreaId: uuid("collection_area_id")
      .notNull()
      .references(() => collectionAreas.id, { onDelete: "restrict" }),
    collectionDate: date("collection_date").notNull(),
    status: varchar("status", { length: 32 }).default("OPEN").notNull(), // OPEN, IN_PROGRESS, SUBMITTED, REMITTED, RECONCILED, CLOSED
    expectedCash: numeric("expected_cash", { precision: 14, scale: 2 }).default("0.00").notNull(),
    expectedNonCash: numeric("expected_non_cash", { precision: 14, scale: 2 }).default("0.00").notNull(),
    expectedTotal: numeric("expected_total", { precision: 14, scale: 2 }).default("0.00").notNull(),
    collectedCash: numeric("collected_cash", { precision: 14, scale: 2 }).default("0.00").notNull(),
    collectedNonCash: numeric("collected_non_cash", { precision: 14, scale: 2 }).default("0.00").notNull(),
    collectedTotal: numeric("collected_total", { precision: 14, scale: 2 }).default("0.00").notNull(),
    remittedCash: numeric("remitted_cash", { precision: 14, scale: 2 }).default("0.00").notNull(),
    difference: numeric("difference", { precision: 14, scale: 2 }).default("0.00").notNull(),
    shortageAmount: numeric("shortage_amount", { precision: 14, scale: 2 }).default("0.00").notNull(),
    overageAmount: numeric("overage_amount", { precision: 14, scale: 2 }).default("0.00").notNull(),
    openedBy: uuid("opened_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledBy: uuid("reconciled_by").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("collection_batches_status_idx").on(table.status),
    index("collection_batches_date_idx").on(table.collectionDate),
    index("collection_batches_collector_idx").on(table.collectorId),
    index("collection_batches_area_idx").on(table.collectionAreaId),
    index("collection_batches_number_idx").on(table.batchNumber),
  ]
);

export const collectionBatchAccounts = pgTable(
  "collection_batch_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    collectionBatchId: uuid("collection_batch_id")
      .notNull()
      .references(() => collectionBatches.id, { onDelete: "cascade" }),
    serviceAccountId: uuid("service_account_id")
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    expectedAmount: numeric("expected_amount", { precision: 14, scale: 2 }).notNull(),
    collectedAmount: numeric("collected_amount", { precision: 14, scale: 2 }).default("0.00").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    status: varchar("status", { length: 32 }).default("UNPAID").notNull(), // UNPAID, COLLECTED, PARTIAL, NOT_COLLECTED
    notes: text("notes"),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("batch_accounts_batch_idx").on(table.collectionBatchId),
    index("batch_accounts_service_account_idx").on(table.serviceAccountId),
    index("batch_accounts_invoice_idx").on(table.invoiceId),
    index("batch_accounts_status_idx").on(table.status),
  ]
);

export const collectorRemittances = pgTable(
  "collector_remittances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    collectionBatchId: uuid("collection_batch_id")
      .notNull()
      .references(() => collectionBatches.id, { onDelete: "cascade" }),
    remittanceNumber: varchar("remittance_number", { length: 32 }).notNull().unique(), // e.g. "BCIS-REMIT-2026-0001"
    remittedCash: numeric("remitted_cash", { precision: 14, scale: 2 }).notNull(),
    remittedGcash: numeric("remitted_gcash", { precision: 14, scale: 2 }).default("0.00").notNull(),
    remittedBankTransfer: numeric("remitted_bank_transfer", { precision: 14, scale: 2 }).default("0.00").notNull(),
    otherNonCash: numeric("other_non_cash", { precision: 14, scale: 2 }).default("0.00").notNull(),
    totalRemitted: numeric("total_remitted", { precision: 14, scale: 2 }).notNull(),
    expectedCash: numeric("expected_cash", { precision: 14, scale: 2 }).notNull(),
    shortageAmount: numeric("shortage_amount", { precision: 14, scale: 2 }).default("0.00").notNull(),
    overageAmount: numeric("overage_amount", { precision: 14, scale: 2 }).default("0.00").notNull(),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("collector_remittances_batch_idx").on(table.collectionBatchId),
    index("collector_remittances_number_idx").on(table.remittanceNumber),
    index("collector_remittances_received_at_idx").on(table.receivedAt),
  ]
);

export type CollectionBatch = typeof collectionBatches.$inferSelect;
export type NewCollectionBatch = typeof collectionBatches.$inferInsert;

export type CollectionBatchAccount = typeof collectionBatchAccounts.$inferSelect;
export type NewCollectionBatchAccount = typeof collectionBatchAccounts.$inferInsert;

export type CollectorRemittance = typeof collectorRemittances.$inferSelect;
export type NewCollectorRemittance = typeof collectorRemittances.$inferInsert;
