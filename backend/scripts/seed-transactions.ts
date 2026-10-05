import { db, queryClient } from "../src/db/db.js";
import { users } from "../src/db/schema/auth.js";
import { subscribers, serviceAccounts, collectors } from "../src/db/schema/subscribers.js";
import { eq } from "drizzle-orm";
import { BillingService } from "../src/modules/billing/billing.service.js";
import { PaymentService } from "../src/modules/payments/payment.service.js";
import { Money } from "../src/shared/money/money.js";

import { billingCycles } from "../src/db/schema/billing.js";

async function seedTransactions() {
  console.log("Starting realistic transaction seeding...");
  const [admin] = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  if (!admin) throw new Error("Admin not found");

  await db.update(billingCycles).set({ status: "OPEN" });

  const paymentService = new PaymentService();
  const allAccounts = await db.select().from(serviceAccounts);
  
  // CYCLES: CYCLE-2026-08, CYCLE-2026-09, CYCLE-2026-10
  
  // 1. Generate August 2026 Invoices
  console.log("Generating August 2026 Billing...");
  await BillingService.generateMonthlyBilling("2026-08", admin.id);

  // 2. Make payments for August
  for (let i = 0; i < allAccounts.length; i++) {
    const acc = allAccounts[i];
    // Skip a few accounts randomly or by index to create "Overdue" ones
    if (i === 2 || i === 9) continue; // Let's say index 2 and 9 didn't pay in August

    console.log(`Processing August payment for subscriber ${acc.subscriberId}`);
    try {
      await paymentService.createPayment({
        subscriberId: acc.subscriberId,
        serviceAccountId: acc.id,
        paymentDate: "2026-08-20T10:00:00Z",
        paymentMethod: i % 2 === 0 ? "CASH" : "GCASH",
        referenceNumber: i % 2 !== 0 ? `GCASH-AUG-${acc.id.slice(0,5)}` : undefined,
        amountPaid: acc.currentRate, // Full payment
        tenderedAmount: acc.currentRate,
      }, admin.id);
    } catch (e) {
      console.log(`Skipped payment for ${acc.id} in August: ${e.message}`);
    }
  }

  // 3. Generate September 2026 Invoices
  console.log("Generating September 2026 Billing...");
  await BillingService.generateMonthlyBilling("2026-09", admin.id);

  // 4. Make payments for September
  for (let i = 0; i < allAccounts.length; i++) {
    const acc = allAccounts[i];
    // Index 2 is still overdue, Index 9 pays everything now, Index 5 forgets to pay.
    if (i === 2 || i === 5) continue;
    
    // Calculate how much they owe (we can just pay their current rate, or for 9, pay double)
    let amountToPay = acc.currentRate;
    if (i === 9) {
      amountToPay = Money.fromDecimal(acc.currentRate).multiply(2).format(); // Pay for Aug and Sept
    }

    console.log(`Processing September payment for subscriber ${acc.subscriberId}`);
    try {
      await paymentService.createPayment({
        subscriberId: acc.subscriberId,
        serviceAccountId: acc.id,
        paymentDate: "2026-09-22T10:00:00Z",
        paymentMethod: "CASH",
        amountPaid: Money.fromDecimal(amountToPay).toDecimalString(), 
        tenderedAmount: Money.fromDecimal(amountToPay).toDecimalString(),
      }, admin.id);
    } catch (e) {
      console.log(`Skipped payment for ${acc.id} in September: ${e.message}`);
    }
  }

  // 5. Generate October 2026 Invoices
  console.log("Generating October 2026 Billing...");
  try {
    await BillingService.createBillingCycle({
      cycleCode: "2026-10",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      billingDate: "2026-10-01",
      dueDate: "2026-10-15"
    }, admin.id);
  } catch (e) {} // Ignore if already exists
  await BillingService.generateMonthlyBilling("2026-10", admin.id);

  // 6. A few early payments for October
  for (let i = 0; i < allAccounts.length; i++) {
    const acc = allAccounts[i];
    // Only half pay early
    if (i % 2 !== 0) continue; 
    if (i === 2) continue; // Index 2 is REALLY overdue now (3 months)

    console.log(`Processing October payment for subscriber ${acc.subscriberId}`);
    try {
      await paymentService.createPayment({
        subscriberId: acc.subscriberId,
        serviceAccountId: acc.id,
        paymentDate: "2026-10-05T10:00:00Z",
        paymentMethod: "GCASH",
        referenceNumber: `GCASH-OCT-${acc.id.slice(0,5)}`,
        amountPaid: Money.fromDecimal(acc.currentRate).toDecimalString(), 
        tenderedAmount: Money.fromDecimal(acc.currentRate).toDecimalString(),
      }, admin.id);
    } catch (e) {
      console.log(`Skipped payment for ${acc.id} in October: ${e.message}`);
    }
  }

  console.log("Transaction seeding completed successfully.");
  await queryClient.end();
  process.exit(0);
}

seedTransactions().catch((err) => {
  console.error("Error seeding transactions:", err);
  process.exit(1);
});
