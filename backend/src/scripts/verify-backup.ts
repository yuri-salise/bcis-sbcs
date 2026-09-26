import { backupService } from "../modules/backup/backup.service.js";
import { queryClient } from "../db/db.js";

async function runCliVerify() {
  console.log("=== BCIS Backup Verification Utility ===");
  const target = process.argv[2];

  if (!target) {
    console.log("No specific ID provided. Verifying most recent backup...");
    const list = await backupService.listBackups();
    if (list.length === 0) {
      console.log("No backup records found in database.");
      return;
    }
    const latest = list[0];
    if (!latest) {
      console.log("No backup records found in database.");
      return;
    }
    console.log(`Checking latest backup: ${latest.fileName} (${latest.id})`);
    const result = await backupService.verifyBackup(latest.id);
    console.log("\nVerification result:", JSON.stringify(result, null, 2));
    if (!result.verified) {
      throw new Error(`Verification failed: ${result.error}`);
    }
  } else {
    console.log(`Verifying backup: ${target}`);
    const result = await backupService.verifyBackup(target);
    console.log("\nVerification result:", JSON.stringify(result, null, 2));
    if (!result.verified) {
      throw new Error(`Verification failed: ${result.error}`);
    }
  }
}

runCliVerify()
  .then(async () => {
    await queryClient.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\n[ERROR] Verification failed:", err);
    await queryClient.end();
    process.exit(1);
  });
