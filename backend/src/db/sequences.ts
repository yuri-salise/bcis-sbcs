import { sql } from "drizzle-orm";
import { db } from "./db.js";

export type SequenceType = "BCIS-SUB" | "BCIS-SA";

export async function getNextDocumentNumber(
  prefix: SequenceType,
  tx?: any
): Promise<string> {
  const runner = tx || db;
  const seqName = prefix === "BCIS-SUB" ? "subscriber_account_seq" : "service_account_seq";
  const year = new Date().getFullYear();

  await runner.execute(sql.raw(`CREATE SEQUENCE IF NOT EXISTS ${seqName} START WITH 1;`));

  const result: any = await runner.execute(sql.raw(`SELECT nextval('${seqName}') AS val;`));
  const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
  const val = Number(row?.val ?? 1);
  return `${prefix}-${year}-${String(val).padStart(4, "0")}`;
}

export async function setSequenceValue(
  prefix: SequenceType,
  value: number,
  tx?: any
): Promise<void> {
  const runner = tx || db;
  const seqName = prefix === "BCIS-SUB" ? "subscriber_account_seq" : "service_account_seq";
  await runner.execute(sql.raw(`CREATE SEQUENCE IF NOT EXISTS ${seqName} START WITH 1;`));
  await runner.execute(sql.raw(`SELECT setval('${seqName}', ${value}, true);`));
}
