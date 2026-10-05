import { db, queryClient } from "../src/db/db.js";
import { serviceAccounts } from "../src/db/schema/subscribers.js";
import { invoices } from "../src/db/schema/billing.js";
import { eq } from "drizzle-orm";
import { Money } from "../src/shared/money/money.js";

async function main() {
  const sas = await db.select().from(serviceAccounts);
  for (const sa of sas) {
    const invs = await db.select().from(invoices).where(eq(invoices.serviceAccountId, sa.id));
    let bal = Money.zero();
    for (const inv of invs) {
      bal = bal.add(Money.fromDecimal(inv.balanceDueCache));
    }
    await db.update(serviceAccounts)
      .set({ cachedBalanceDue: bal.toDecimalString() })
      .where(eq(serviceAccounts.id, sa.id));
    console.log(`Updated SA ${sa.serviceAccountNumber} to ${bal.toDecimalString()}`);
  }
  await queryClient.end();
}

main().catch(console.error);