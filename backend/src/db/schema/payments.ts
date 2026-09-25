import {
  pgTable,
  uuid,
  text,
  varchar,
  numeric,
  date,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { subscribers, serviceAccounts, collectors } from "./subscribers.js";
import { invoices } from "./billing.js";

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptNumber: varchar("receipt_number", { length: 32 }).notNull().unique(), // e.g. "BCIS-REC-2026-0001"
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "restrict" }),
    serviceAccountId: uuid("service_account_id")
      .references(() => serviceAccounts.id, { onDelete: "set null" }),
    paymentDate: date("payment_date").notNull(),
    paymentMethod: varchar("payment_method", { length: 32 }).notNull(), // CASH, GCASH, BANK_TRANSFER, CHECK, OTHER
    referenceNumber: varchar("reference_number", { length: 64 }), // GCash ref #, check #, transaction #
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull(),
    tenderedAmount: numeric("tendered_amount", { precision: 14, scale: 2 }),
    changeAmount: numeric("change_amount", { precision: 14, scale: 2 }),
    allocatedAmount: numeric("allocated_amount", { precision: 14, scale: 2 }).default("0.00").notNull(),
    advanceAmount: numeric("advance_amount", { precision: 14, scale: 2 }).default("0.00").notNull(),
    status: varchar("status", { length: 32 }).default("POSTED").notNull(), // POSTED, REVERSED, VOID
    cashierId: uuid("cashier_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    collectorId: uuid("collector_id")
      .references(() => collectors.id, { onDelete: "set null" }),
    isReversed: boolean("is_reversed").default(false).notNull(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: uuid("reversed_by").references(() => users.id, { onDelete: "set null" }),
    reversalReason: text("reversal_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payments_subscriber_idx").on(table.subscriberId),
    index("payments_payment_date_idx").on(table.paymentDate),
    index("payments_receipt_number_idx").on(table.receiptNumber),
    index("payments_ref_num_idx").on(table.referenceNumber),
    index("payments_status_idx").on(table.status),
  ]
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    allocatedAmount: numeric("allocated_amount", { precision: 14, scale: 2 }).notNull(),
    previousInvoiceBalance: numeric("previous_invoice_balance", { precision: 14, scale: 2 }).notNull(),
    remainingInvoiceBalance: numeric("remaining_invoice_balance", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payment_allocations_payment_idx").on(table.paymentId),
    index("payment_allocations_invoice_idx").on(table.invoiceId),
  ]
);
