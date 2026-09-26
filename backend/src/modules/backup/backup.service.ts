import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { db, queryClient } from "../../db/db.js";
import { backupHistory, auditLogs } from "../../db/schema/system.js";
import { resyncAllSequences } from "../../db/sequences.js";
import { env } from "../../app/config/env.js";
import { AppError, NotFoundError } from "../../app/errors/app-error.js";

export const MANAGED_TABLES = [
  "application_settings",
  "permissions",
  "roles",
  "role_permissions",
  "users",
  "user_roles",
  "sessions",
  "service_types",
  "service_plans",
  "collection_areas",
  "collectors",
  "subscribers",
  "subscriber_addresses",
  "service_accounts",
  "service_account_status_history",
  "billing_cycles",
  "invoices",
  "invoice_items",
  "invoice_adjustments",
  "ledger_entries",
  "payments",
  "payment_allocations",
  "payment_proofs",
  "collection_batches",
  "collection_batch_accounts",
  "collector_remittances",
  "suspension_records",
  "reconnection_records",
  "audit_logs",
] as const;

export interface CreateBackupOptions {
  type: "FULL" | "DATABASE_ONLY";
  createdBy?: string;
  notes?: string;
}

export interface BackupManifest {
  version: string;
  system: string;
  timestamp: string;
  backupType: "FULL" | "DATABASE_ONLY";
  notes?: string;
  tableCounts: Record<string, number>;
  data: Record<string, any[]>;
  attachments?: Array<{
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    base64Data: string;
  }>;
}

export interface DatabaseIntegrityReport {
  isHealthy: boolean;
  issues: string[];
  stats: Record<string, number>;
  timestamp: string;
}

export class BackupService {
  private ensureBackupDir(): string {
    const backupDir = path.resolve(env.BACKUP_DIR);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
  }

  public async listBackups() {
    return db.select().from(backupHistory).orderBy(desc(backupHistory.startedAt));
  }

  public async getBackupById(id: string) {
    const [record] = await db.select().from(backupHistory).where(eq(backupHistory.id, id)).limit(1);
    if (!record) {
      throw new NotFoundError(`Backup record ${id} not found`);
    }
    return record;
  }

  public async createBackup(options: CreateBackupOptions) {
    const backupDir = this.ensureBackupDir();
    const startedAt = new Date();
    const timestampStr = startedAt.toISOString().replace(/[:.]/g, "-");
    const fileName = `bcis_backup_${options.type.toLowerCase()}_${timestampStr}.json`;
    const filePath = path.join(backupDir, fileName);

    // 1. Create initial backup record in status IN_PROGRESS
    const [record] = await db
      .insert(backupHistory)
      .values({
        backupType: options.type,
        fileName,
        filePath,
        startedAt,
        status: "IN_PROGRESS",
        createdBy: options.createdBy,
        notes: options.notes,
      })
      .returning();

    if (!record) {
      throw new Error("Failed to initialize backup record in database");
    }

    try {
      // 2. Extract database tables data and counts
      const tableData: Record<string, any[]> = {};
      const tableCounts: Record<string, number> = {};

      for (const table of MANAGED_TABLES) {
        const rows = await queryClient.unsafe(`SELECT * FROM "${table}"`);
        tableData[table] = rows;
        tableCounts[table] = rows.length;
      }

      // 3. Extract attachments if FULL backup requested
      let attachments: BackupManifest["attachments"];
      if (options.type === "FULL") {
        attachments = [];
        const uploadDir = path.resolve(env.UPLOAD_DIR);
        if (fs.existsSync(uploadDir)) {
          const files = fs.readdirSync(uploadDir);
          for (const f of files) {
            const fullPath = path.join(uploadDir, f);
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
              const fileBuffer = fs.readFileSync(fullPath);
              attachments.push({
                fileName: f,
                originalName: f,
                mimeType: "application/octet-stream",
                sizeBytes: stat.size,
                base64Data: fileBuffer.toString("base64"),
              });
            }
          }
        }
      }

      // 4. Construct manifest
      const manifest: BackupManifest = {
        version: "1.0.0",
        system: "BCIS-SBCS",
        timestamp: startedAt.toISOString(),
        backupType: options.type,
        notes: options.notes,
        tableCounts,
        data: tableData,
        attachments,
      };

      const jsonContent = JSON.stringify(manifest, null, 2);
      await fs.promises.writeFile(filePath, jsonContent, "utf-8");

      // 5. Calculate SHA-256 hash and size
      const sha256 = crypto.createHash("sha256").update(jsonContent, "utf-8").digest("hex");
      const stat = fs.statSync(filePath);
      const completedAt = new Date();

      // 6. Update backup history record
      const [updated] = await db
        .update(backupHistory)
        .set({
          status: "COMPLETED",
          fileSizeBytes: stat.size,
          sha256,
          tableCounts,
          completedAt,
        })
        .where(eq(backupHistory.id, record.id))
        .returning();

      if (!updated) {
        throw new Error("Failed to finalize backup record in database");
      }

      // 7. Record in audit log
      await db.insert(auditLogs).values({
        action: "BACKUP_CREATED",
        entityType: "BACKUP",
        entityId: record.id,
        actorUserId: options.createdBy,
        metadata: {
          fileName,
          backupType: options.type,
          fileSizeBytes: stat.size,
          sha256,
          tableCounts,
        },
      });

      return updated;
    } catch (err: any) {
      await db
        .update(backupHistory)
        .set({
          status: "FAILED",
          completedAt: new Date(),
          notes: `${options.notes ? `${options.notes} | ` : ""}Error: ${err.message}`,
        })
        .where(eq(backupHistory.id, record.id));
      throw err;
    }
  }

  public async verifyBackup(id: string) {
    const record = await this.getBackupById(id);

    if (!fs.existsSync(record.filePath)) {
      await db
        .update(backupHistory)
        .set({
          verifiedAt: new Date(),
          verificationStatus: "FAILED",
          verificationNotes: `Backup file not found on disk at path: ${record.filePath}`,
        })
        .where(eq(backupHistory.id, id));

      return {
        id,
        fileName: record.fileName,
        verified: false,
        status: "FAILED",
        error: `File not found on disk: ${record.filePath}`,
      };
    }

    try {
      const fileBuffer = await fs.promises.readFile(record.filePath);
      const computedHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      if (record.sha256 && computedHash !== record.sha256) {
        await db
          .update(backupHistory)
          .set({
            verifiedAt: new Date(),
            verificationStatus: "FAILED",
            verificationNotes: `SHA-256 checksum mismatch. Expected: ${record.sha256}, Computed: ${computedHash}`,
          })
          .where(eq(backupHistory.id, id));

        return {
          id,
          fileName: record.fileName,
          verified: false,
          status: "FAILED",
          error: "SHA-256 checksum mismatch (file may be corrupted or tampered)",
          expectedSha256: record.sha256,
          computedSha256: computedHash,
        };
      }

      // Validate JSON parse and manifest structure
      const manifest: BackupManifest = JSON.parse(fileBuffer.toString("utf-8"));
      if (manifest.system !== "BCIS-SBCS" || !manifest.data) {
        throw new Error("Invalid BCIS backup manifest structure");
      }

      await db
        .update(backupHistory)
        .set({
          verifiedAt: new Date(),
          verificationStatus: "VERIFIED",
          verificationNotes: `SHA-256 checksum (${computedHash}) and schema manifest verified successfully. Total tables: ${Object.keys(manifest.data).length}.`,
        })
        .where(eq(backupHistory.id, id));

      return {
        id,
        fileName: record.fileName,
        verified: true,
        status: "VERIFIED",
        sha256: computedHash,
        tableCounts: manifest.tableCounts,
        manifestTimestamp: manifest.timestamp,
        version: manifest.version,
      };
    } catch (err: any) {
      await db
        .update(backupHistory)
        .set({
          verifiedAt: new Date(),
          verificationStatus: "FAILED",
          verificationNotes: `Verification error: ${err.message}`,
        })
        .where(eq(backupHistory.id, id));

      return {
        id,
        fileName: record.fileName,
        verified: false,
        status: "FAILED",
        error: err.message,
      };
    }
  }

  public async restoreBackup(id: string, actorUserId?: string) {
    const record = await this.getBackupById(id);

    // Verify first
    const verification = await this.verifyBackup(id);
    if (!verification.verified) {
      throw new AppError(
        `Cannot restore backup: verification failed. ${verification.error || ""}`,
        400,
        "BACKUP_VERIFICATION_FAILED"
      );
    }

    const fileContent = await fs.promises.readFile(record.filePath, "utf-8");
    const manifest: BackupManifest = JSON.parse(fileContent);

    // Transactional restore
    await queryClient.begin(async (sql) => {
      // Disable foreign key constraint triggers during bulk restore
      await sql.unsafe("SET session_replication_role = 'replica';");

      try {
        // 1. Delete rows in reverse topological order (safe under replica mode)
        for (let i = MANAGED_TABLES.length - 1; i >= 0; i--) {
          const table = MANAGED_TABLES[i];
          await sql.unsafe(`DELETE FROM "${table}";`);
        }

        // 2. Insert data in forward topological order
        for (const table of MANAGED_TABLES) {
          const rows = manifest.data[table];
          if (rows && rows.length > 0) {
            for (const row of rows) {
              const columns = Object.keys(row);
              const colsList = columns.map((c) => `"${c}"`).join(", ");
              const values = columns.map((c) => {
                const val = row[c];
                if (val === null || val === undefined) return null;
                if (typeof val === "object" && !(val instanceof Date)) {
                  return JSON.stringify(val);
                }
                return val;
              });
              const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
              await sql.unsafe(
                `INSERT INTO "${table}" (${colsList}) VALUES (${placeholders});`,
                values
              );
            }
          }
        }

        // 3. Resynchronize all sequence generators to prevent number collisions
        await resyncAllSequences(sql);
      } finally {
        // Re-enable foreign key constraints and triggers
        await sql.unsafe("SET session_replication_role = 'origin';");
      }
    });

    // 4. Restore attachments if present
    if (manifest.attachments && manifest.attachments.length > 0) {
      const uploadDir = path.resolve(env.UPLOAD_DIR);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      for (const att of manifest.attachments) {
        const dest = path.join(uploadDir, att.fileName);
        const buf = Buffer.from(att.base64Data, "base64");
        await fs.promises.writeFile(dest, buf);
      }
    }

    // 5. Update backup status to RESTORE_TESTED
    await db
      .update(backupHistory)
      .set({
        status: "RESTORE_TESTED",
        notes: `${record.notes ? `${record.notes} | ` : ""}Restored successfully at ${new Date().toISOString()}`,
      })
      .where(eq(backupHistory.id, id));

    // 6. Audit log the restore action
    await db.insert(auditLogs).values({
      action: "BACKUP_RESTORED",
      entityType: "BACKUP",
      entityId: id,
      actorUserId,
      metadata: {
        fileName: record.fileName,
        backupType: record.backupType,
        sha256: record.sha256,
        tableCounts: manifest.tableCounts,
        restoredAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      backupId: id,
      fileName: record.fileName,
      status: "RESTORE_TESTED",
      tableCounts: manifest.tableCounts,
      restoredAt: new Date().toISOString(),
    };
  }

  public async checkDatabaseIntegrity(): Promise<DatabaseIntegrityReport> {
    const issues: string[] = [];
    const stats: Record<string, number> = {};

    try {
      // 1. Check Invoice balance calculation consistency
      const invoiceMismatch = await queryClient.unsafe(
        `SELECT id, invoice_number, total_amount, amount_paid_cache, balance_due_cache
         FROM invoices
         WHERE balance_due_cache != (total_amount - amount_paid_cache);`
      );
      if (invoiceMismatch.length > 0) {
        issues.push(
          `Found ${invoiceMismatch.length} invoices with inconsistent balance_due_cache calculation.`
        );
      }

      // 2. Check for negative cache balances on active service accounts
      const negativeBalances = await queryClient.unsafe(
        `SELECT id, service_account_number, cached_balance_due
         FROM service_accounts
         WHERE cached_balance_due < 0;`
      );
      if (negativeBalances.length > 0) {
        issues.push(
          `Found ${negativeBalances.length} service accounts with negative cached_balance_due.`
        );
      }

      // 3. Check for payment allocation excess (allocation sum > payment amount)
      const overAllocatedPayments = await queryClient.unsafe(
        `SELECT p.id, p.receipt_number, p.amount_paid, COALESCE(SUM(pa.allocated_amount), 0) AS total_allocated
         FROM payments p
         LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
         GROUP BY p.id, p.receipt_number, p.amount_paid
         HAVING COALESCE(SUM(pa.allocated_amount), 0) > p.amount_paid;`
      );
      if (overAllocatedPayments.length > 0) {
        issues.push(
          `Found ${overAllocatedPayments.length} payments where total allocated amount exceeds amount paid.`
        );
      }

      // 4. Count key domain entities for health diagnostics
      const counts = await queryClient.unsafe(
        `SELECT
           (SELECT count(*) FROM subscribers) AS subscribers_count,
           (SELECT count(*) FROM service_accounts WHERE status = 'ACTIVE') AS active_accounts_count,
           (SELECT count(*) FROM service_accounts WHERE status = 'SUSPENDED') AS suspended_accounts_count,
           (SELECT count(*) FROM invoices) AS invoices_count,
           (SELECT count(*) FROM invoices WHERE status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')) AS open_invoices_count,
           (SELECT count(*) FROM payments WHERE status = 'POSTED') AS posted_payments_count,
           (SELECT count(*) FROM payments WHERE status = 'REVERSED') AS reversed_payments_count,
           (SELECT count(*) FROM audit_logs) AS audit_logs_count,
           (SELECT count(*) FROM backup_history) AS backup_history_count;`
      );

      const row: any = counts[0] || {};
      stats.subscribers = Number(row.subscribers_count || 0);
      stats.activeAccounts = Number(row.active_accounts_count || 0);
      stats.suspendedAccounts = Number(row.suspended_accounts_count || 0);
      stats.invoices = Number(row.invoices_count || 0);
      stats.openInvoices = Number(row.open_invoices_count || 0);
      stats.postedPayments = Number(row.posted_payments_count || 0);
      stats.reversedPayments = Number(row.reversed_payments_count || 0);
      stats.auditLogs = Number(row.audit_logs_count || 0);
      stats.backupHistory = Number(row.backup_history_count || 0);

      return {
        isHealthy: issues.length === 0,
        issues,
        stats,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      issues.push(`Integrity inspection failed with error: ${err.message}`);
      return {
        isHealthy: false,
        issues,
        stats,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export const backupService = new BackupService();
