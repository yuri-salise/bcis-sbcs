import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../app/config/env.js";
import * as schema from "./schema/index.js";

// Create reusable postgres client
export const queryClient = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === "test" ? 5 : 20,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await queryClient`SELECT 1`;
    return true;
  } catch (error) {
    return false;
  }
}
