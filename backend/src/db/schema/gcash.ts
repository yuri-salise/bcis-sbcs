import {
  pgTable,
  uuid,
  text,
  varchar,
  numeric,
  date,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { subscribers, serviceAccounts } from "./subscribers.js";
import { payments } from "./payments.js";

export const paymentProofs = pgTable(
  "payment_proofs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "restrict" }),
    serviceAccountId: uuid("service_account_id").references(() => serviceAccounts.id, { onDelete: "set null" }),
    referenceNumber: varchar("reference_number", { length: 64 }).notNull(),
    senderName: varchar("sender_name", { length: 128 }),
    senderMobile: varchar("sender_mobile", { length: 32 }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    transactionDate: date("transaction_date").notNull(),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSize: integer("file_size").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    verificationStatus: varchar("verification_status", { length: 32 }).default("PENDING").notNull(), // PENDING, VERIFIED, REJECTED, FLAGGED
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payment_proofs_status_created_idx").on(table.verificationStatus, table.createdAt),
    index("payment_proofs_ref_num_idx").on(table.referenceNumber),
    index("payment_proofs_subscriber_idx").on(table.subscriberId),
    index("payment_proofs_sha256_idx").on(table.sha256),
    index("payment_proofs_payment_idx").on(table.paymentId),
  ]
);

export type PaymentProof = typeof paymentProofs.$inferSelect;
export type NewPaymentProof = typeof paymentProofs.$inferInsert;
