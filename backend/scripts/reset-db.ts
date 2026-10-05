import { db, queryClient } from "../src/db/db.js";
import { sql } from "drizzle-orm";

async function reset() {
  console.log("Truncating all tables...");
  await db.execute(sql`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
  console.log("All tables truncated.");
  await queryClient.end();
  process.exit(0);
}
reset().catch(console.error);
