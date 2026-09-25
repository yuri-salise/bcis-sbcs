import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  numeric,
  date,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { serviceAccounts } from "./subscribers.js";

export const billingCycles = pgTable("billing_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  cycleCode: varchar("cycle_code", { length: 32 }).notNull().unique(), // e.g. "2026-09"
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  billingDate: date("billing_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: varchar("status", { length: 32 }).default("OPEN").notNull(), // OPEN, GENERATING, GENERATED, LOCKED, CLOSED
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceNumber: varchar("invoice_number", { length: 32 }).notNull().unique(),
    serviceAccountId: uuid("service_account_id")
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: "restrict" }),
    billingCycleId: uuid("billing_cycle_id")
      .notNull()
      .references(() => billingCycles.id, { onDelete: "restrict" }),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date").notNull(),
    status: varchar("status", { length: 32 }).default("UNPAID").notNull(), // DRAFT, UNPAID, PARTIALLY_PAID, PAID, OVERDUE, VOID, CREDITED
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
    discountTotal: numeric("discount_total", { precision: 14, scale: 2 }).default("0.00").notNull(),
    penaltyTotal: numeric("penalty_total", { precision: 14, scale: 2 }).default("0.00").notNull(),
    adjustmentTotal: numeric("adjustment_total", { precision: 14, scale: 2 }).default("0.00").notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    amountPaidCache: numeric("amount_paid_cache", { precision: 14, scale: 2 }).default("0.00").notNull(),
    balanceDueCache: numeric("balance_due_cache", { precision: 14, scale: 2 }).notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // AT-11 Invariant: Enforce at most one canonical invoice per service account per billing cycle
    unique("invoices_service_account_billing_cycle_unique").on(
      table.serviceAccountId,
      table.billingCycleId
    ),
  ]
);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  lineType: varchar("line_type", { length: 32 }).notNull(), // SUBSCRIPTION, INSTALLATION, RECONNECTION, PENALTY, DISCOUNT, ADJUSTMENT, OTHER
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  sourceReference: text("source_reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoiceAdjustments = pgTable("invoice_adjustments", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  adjustmentType: varchar("adjustment_type", { length: 16 }).notNull(), // DEBIT, CREDIT
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 16 }).default("DRAFT").notNull(), // DRAFT, APPROVED, VOIDED
  requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  serviceAccountId: uuid("service_account_id")
    .notNull()
    .references(() => serviceAccounts.id, { onDelete: "cascade" }),
  entryNo: integer("entry_no").notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true }).defaultNow().notNull(),
  entryDate: date("entry_date").notNull(),
  referenceType: varchar("reference_type", { length: 32 }).notNull(), // INVOICE, PAYMENT, ADJUSTMENT, REVERSAL, CREDIT
  referenceId: uuid("reference_id").notNull(),
  description: text("description").notNull(),
  debitAmount: numeric("debit_amount", { precision: 14, scale: 2 }).default("0.00").notNull(),
  creditAmount: numeric("credit_amount", { precision: 14, scale: 2 }).default("0.00").notNull(),
  currency: varchar("currency", { length: 3 }).default("PHP").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
