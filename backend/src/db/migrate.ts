import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient } from "./db.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log("Running database migrations...");
  const migrationsFolder = path.resolve(__dirname, "./migrations");

  await migrate(db, { migrationsFolder });
  console.log("Database migrations applied successfully.");
}

// Allow direct execution
if (process.argv[1] === __filename) {
  runMigrations()
    .then(async () => {
      await queryClient.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Migration failed:", err);
      await queryClient.end();
      process.exit(1);
    });
}
