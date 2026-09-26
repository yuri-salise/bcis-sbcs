import { backupService } from "../modules/backup/backup.service.js";
import { queryClient } from "../db/db.js";

async function runCliRestore() {
  console.log("=== BCIS Automated Database Restore Utility ===");
  const targetId = process.argv[2];

  if (!targetId) {
    console.error("\n[ERROR] Target backup ID is required to execute restore.");
    console.log("Usage: tsx src/scripts/restore.ts <backup-id>");
    process.exit(1);
  }

  console.log(`Verifying and restoring backup: ${targetId}...`);
  const result = await backupService.restoreBackup(targetId);

  console.log("\n[SUCCESS] Restore completed successfully:");
  console.log(`- Backup ID:       ${result.backupId}`);
  console.log(`- File Name:       ${result.fileName}`);
  console.log(`- Status:          ${result.status}`);
  console.log(`- Restored At:     ${result.restoredAt}`);
  console.log(`- Table Counts:    ${JSON.stringify(result.tableCounts, null, 2)}`);

  console.log("\nRunning post-restore database integrity check...");
  const integrity = await backupService.checkDatabaseIntegrity();
  console.log(`Integrity Status:  ${integrity.isHealthy ? "HEALTHY [PASSED]" : "UNHEALTHY [ISSUES FOUND]"}`);
  if (integrity.issues.length > 0) {
    console.warn("Issues:", integrity.issues);
  } else {
    console.log("All tables, balances, and foreign keys pass integrity verification.");
  }
}

runCliRestore()
  .then(async () => {
    await queryClient.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\n[ERROR] Restore failed:", err);
    await queryClient.end();
    process.exit(1);
  });
