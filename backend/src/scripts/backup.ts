import { backupService } from "../modules/backup/backup.service.js";
import { queryClient } from "../db/db.js";

async function runCliBackup() {
  console.log("=== BCIS Automated Database Backup Utility ===");
  const backupType = (process.argv[2]?.toUpperCase() === "FULL" ? "FULL" : "DATABASE_ONLY") as
    | "FULL"
    | "DATABASE_ONLY";
  const notes = process.argv[3] || "Triggered via CLI script";

  console.log(`Starting ${backupType} backup...`);
  const record = await backupService.createBackup({
    type: backupType,
    notes,
  });

  if (!record) {
    throw new Error("Backup failed: no record returned");
  }

  console.log("\n[SUCCESS] Backup completed successfully:");
  console.log(`- Backup ID:       ${record.id}`);
  console.log(`- File Name:       ${record.fileName}`);
  console.log(`- File Path:       ${record.filePath}`);
  console.log(`- File Size:       ${record.fileSizeBytes} bytes`);
  console.log(`- SHA-256 Checksum:${record.sha256}`);
  console.log(`- Status:          ${record.status}`);
  console.log(`- Table Counts:    ${JSON.stringify(record.tableCounts, null, 2)}`);
}

runCliBackup()
  .then(async () => {
    await queryClient.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\n[ERROR] Backup failed:", err);
    await queryClient.end();
    process.exit(1);
  });
