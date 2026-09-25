import { sql } from "drizzle-orm";
import { db } from "./db.js";

export type SequenceType = "BCIS-SUB" | "BCIS-SA" | "BCIS-INV" | "BCIS-REC";

interface SequenceConfig {
  sequenceName: string;
  tableName: string;
  columnName: string;
}

function getSequenceConfig(prefix: SequenceType): SequenceConfig {
  switch (prefix) {
    case "BCIS-SUB":
      return {
        sequenceName: "subscriber_account_seq",
        tableName: "subscribers",
        columnName: "account_number",
      };
    case "BCIS-SA":
      return {
        sequenceName: "service_account_seq",
        tableName: "service_accounts",
        columnName: "service_account_number",
      };
    case "BCIS-INV":
      return {
        sequenceName: "invoice_number_seq",
        tableName: "invoices",
        columnName: "invoice_number",
      };
    case "BCIS-REC":
      return {
        sequenceName: "receipt_number_seq",
        tableName: "payments",
        columnName: "receipt_number",
      };
  }
}

/**
 * Authoritative Document & Account Number Generator
 * 
 * Invariants:
 * 1. Mints sequential numbers in format `${prefix}-${year}-${NNNN}`
 * 2. Self-healing: Automatically detects existing maximum numeric suffixes
 *    and ensures the sequence never falls behind or collides with existing records.
 */
export async function getNextDocumentNumber(
  prefix: SequenceType,
  tx?: any
): Promise<string> {
  const runner = tx || db;
  const { sequenceName, tableName, columnName } = getSequenceConfig(prefix);
  const year = new Date().getFullYear();

  await runner.execute(sql.raw(`CREATE SEQUENCE IF NOT EXISTS ${sequenceName} START WITH 1;`));

  // Find current maximum numeric suffix from table to prevent any collision
  const maxResult: any = await runner.execute(
    sql.raw(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(${columnName} FROM '\\d+$') AS integer)), 0) AS max_num FROM ${tableName};`
    )
  );
  const maxRow = Array.isArray(maxResult) ? maxResult[0] : maxResult?.rows?.[0];
  const maxExisting = Number(maxRow?.max_num || 0);

  // Synchronize sequence if it is behind table records
  const currResult: any = await runner.execute(
    sql.raw(`SELECT last_value, is_called FROM ${sequenceName};`)
  );
  const currRow = Array.isArray(currResult) ? currResult[0] : currResult?.rows?.[0];
  const lastVal = Number(currRow?.last_value || 0);
  const isCalled = Boolean(currRow?.is_called);

  if (maxExisting > 0 && maxExisting >= (isCalled ? lastVal : 0)) {
    await runner.execute(sql.raw(`SELECT setval('${sequenceName}', ${maxExisting}, true);`));
  }

  const nextResult: any = await runner.execute(sql.raw(`SELECT nextval('${sequenceName}') AS val;`));
  const nextRow = Array.isArray(nextResult) ? nextResult[0] : nextResult?.rows?.[0];
  const val = Number(nextRow?.val ?? 1);

  return `${prefix}-${year}-${String(val).padStart(4, "0")}`;
}

export async function setSequenceValue(
  prefix: SequenceType,
  value: number,
  tx?: any
): Promise<void> {
  const runner = tx || db;
  const { sequenceName, tableName, columnName } = getSequenceConfig(prefix);

  await runner.execute(sql.raw(`CREATE SEQUENCE IF NOT EXISTS ${sequenceName} START WITH 1;`));

  // Ensure sequence never drops below existing table records
  const maxResult: any = await runner.execute(
    sql.raw(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(${columnName} FROM '\\d+$') AS integer)), 0) AS max_num FROM ${tableName};`
    )
  );
  const maxRow = Array.isArray(maxResult) ? maxResult[0] : maxResult?.rows?.[0];
  const maxExisting = Number(maxRow?.max_num || 0);
  const effectiveVal = Math.max(value, maxExisting);

  if (effectiveVal > 0) {
    await runner.execute(sql.raw(`SELECT setval('${sequenceName}', ${effectiveVal}, true);`));
  }
}
