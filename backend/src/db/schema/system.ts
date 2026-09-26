import { pgTable, uuid, text, timestamp, jsonb, index, bigint } from "drizzle-orm/pg-core";
import { users } from "./auth.js";

export const applicationSettings = pgTable("application_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    requestId: text("request_id"),
    reason: text("reason"),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    ipAddress: text("ip_address"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("audit_logs_occurred_at_idx").on(table.occurredAt),
    index("audit_logs_actor_occurred_idx").on(table.actorUserId, table.occurredAt),
    index("audit_logs_entity_occurred_idx").on(table.entityType, table.entityId, table.occurredAt),
  ]
);

export const backupHistory = pgTable(
  "backup_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    backupType: text("backup_type").notNull(), // "FULL", "DATABASE_ONLY", "ATTACHMENTS_ONLY"
    fileName: text("file_name").notNull(),
    filePath: text("file_path").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: text("status").notNull(), // "IN_PROGRESS", "COMPLETED", "FAILED", "RESTORE_TESTED"
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    sha256: text("sha256"),
    tableCounts: jsonb("table_counts"),
    createdBy: uuid("created_by").references(() => users.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationStatus: text("verification_status").default("PENDING").notNull(), // "PENDING", "VERIFIED", "FAILED"
    verificationNotes: text("verification_notes"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("backup_history_started_at_idx").on(table.startedAt),
    index("backup_history_status_idx").on(table.status),
  ]
);
