import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildServer } from "../../app/server.js";
import { db } from "../../db/db.js";
import {
  subscribers,
  subscriberAddresses,
  serviceAccounts,
  serviceTypes,
  servicePlans,
  billingCycles,
  invoices,
  invoiceItems,
  payments,
  paymentAllocations,
  ledgerEntries,
} from "../../db/schema/index.js";
import { eq, and, or, inArray } from "drizzle-orm";
import { getNextDocumentNumber } from "../../db/sequences.js";

async function cleanTestSubscribers() {
  const existingTestSubs = await db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(
      or(
        eq(subscribers.accountNumber, "BCIS-SUB-TEST-P4-001"),
        eq(subscribers.accountNumber, "BCIS-SUB-TEST-P4-002")
      )
    );

  for (const sub of existingTestSubs) {
    const sas = await db
      .select({ id: serviceAccounts.id })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.subscriberId, sub.id));
    const saIds = sas.map((s) => s.id);
    if (saIds.length > 0) {
      const invs = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(inArray(invoices.serviceAccountId, saIds));
      const invIds = invs.map((i) => i.id);
      if (invIds.length > 0) {
        await db.delete(paymentAllocations).where(inArray(paymentAllocations.invoiceId, invIds));
        await db.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, invIds));
        await db.delete(invoices).where(inArray(invoices.id, invIds));
      }
      await db.delete(payments).where(eq(payments.subscriberId, sub.id));
      await db.delete(ledgerEntries).where(inArray(ledgerEntries.serviceAccountId, saIds));
      await db.delete(serviceAccounts).where(inArray(serviceAccounts.id, saIds));
    }
    await db.delete(subscriberAddresses).where(eq(subscriberAddresses.subscriberId, sub.id));
    await db.delete(subscribers).where(eq(subscribers.id, sub.id));
  }
}

describe("Payments, Allocation, Receipts & Reversals Tests (Phase 4 - AT-01 to AT-06)", () => {
  let server: FastifyInstance;
  let adminToken: string;
  let cashierToken: string;
  let techToken: string;

  // Test Entities
  let testSubId: string;
  let testSaId: string;
  let augCycleId: string;
  let septCycleId: string;
  let augInvoiceId: string;
  let septInvoiceId: string;

  // Multi-invoice test entities for AT-04
  let multiSubId: string;
  let multiSaId: string;
  let multiInvAId: string;
  let multiInvBId: string;

  beforeAll(async () => {
    server = buildServer();
    await server.ready();

    // Clean any prior run leftovers
    await cleanTestSubscribers();

    // Login Admin
    const adminRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin", password: "Password123!" },
    });
    expect(adminRes.statusCode).toBe(200);
    adminToken = JSON.parse(adminRes.body).token;

    // Login Cashier
    const cashierRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "cashier", password: "Password123!" },
    });
    expect(cashierRes.statusCode).toBe(200);
    cashierToken = JSON.parse(cashierRes.body).token;

    // Login Tech
    const techRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "tech", password: "Password123!" },
    });
    expect(techRes.statusCode).toBe(200);
    techToken = JSON.parse(techRes.body).token;

    // Setup Billing Cycles for tests
    const [augCycle] = await db
      .select()
      .from(billingCycles)
      .where(eq(billingCycles.cycleCode, "2026-08"))
      .limit(1);
    augCycleId = augCycle.id;

    const [septCycle] = await db
      .select()
      .from(billingCycles)
      .where(eq(billingCycles.cycleCode, "2026-09"))
      .limit(1);
    septCycleId = septCycle.id;

    // Get catalog plan and type
    const [plan] = await db.select().from(servicePlans).limit(1);
    const [stype] = await db.select().from(serviceTypes).limit(1);

    // 1. Create a dedicated Subscriber 1 for AT-01, AT-02, AT-03, AT-05, AT-06
    const [sub1] = await db
      .insert(subscribers)
      .values({
        accountNumber: "BCIS-SUB-TEST-P4-001",
        firstName: "TestPayment",
        lastName: "Subscriber",
        primaryContactNumber: "0917-000-0001",
        status: "ACTIVE",
      })
      .returning();
    testSubId = sub1.id;

    const [addr1] = await db
      .insert(subscriberAddresses)
      .values({
        subscriberId: testSubId,
        label: "Home",
        line1: "Purok Test",
        barangay: "Poblacion",
        cityMunicipality: "Malaybalay City",
        province: "Bukidnon",
        postalCode: "8700",
        isPrimary: true,
      })
      .returning();

    const [sa1] = await db
      .insert(serviceAccounts)
      .values({
        subscriberId: testSubId,
        serviceAccountNumber: "BCIS-SA-TEST-P4-001",
        serviceTypeId: stype.id,
        servicePlanId: plan.id,
        installationAddressId: addr1.id,
        activationDate: "2026-08-01",
        billingStartDate: "2026-08-01",
        billingDay: 1,
        dueDay: 15,
        currentRate: "1000.00",
        status: "ACTIVE",
        cachedBalanceDue: "2500.00", // 1000 Aug + 1500 Sept
      })
      .returning();
    testSaId = sa1.id;

    // Aug Invoice: ₱1000.00, Due 2026-08-15
    const [invAug] = await db
      .insert(invoices)
      .values({
        invoiceNumber: "BCIS-INV-TEST-AUG-001",
        serviceAccountId: testSaId,
        billingCycleId: augCycleId,
        invoiceDate: "2026-08-01",
        dueDate: "2026-08-15",
        status: "UNPAID",
        subtotal: "1000.00",
        totalAmount: "1000.00",
        amountPaidCache: "0.00",
        balanceDueCache: "1000.00",
      })
      .returning();
    augInvoiceId = invAug.id;

    // Sept Invoice: ₱1500.00, Due 2026-09-15
    const [invSept] = await db
      .insert(invoices)
      .values({
        invoiceNumber: "BCIS-INV-TEST-SEPT-001",
        serviceAccountId: testSaId,
        billingCycleId: septCycleId,
        invoiceDate: "2026-09-01",
        dueDate: "2026-09-15",
        status: "UNPAID",
        subtotal: "1500.00",
        totalAmount: "1500.00",
        amountPaidCache: "0.00",
        balanceDueCache: "1500.00",
      })
      .returning();
    septInvoiceId = invSept.id;

    // 2. Create dedicated Subscriber 2 for AT-04 (Oldest-First Arrears Allocation)
    const [sub2] = await db
      .insert(subscribers)
      .values({
        accountNumber: "BCIS-SUB-TEST-P4-002",
        firstName: "OldestFirst",
        lastName: "AllocationTest",
        primaryContactNumber: "0917-000-0002",
        status: "ACTIVE",
      })
      .returning();
    multiSubId = sub2.id;

    const [addr2] = await db
      .insert(subscriberAddresses)
      .values({
        subscriberId: multiSubId,
        label: "Home",
        line1: "Purok Arrears",
        barangay: "Casisang",
        cityMunicipality: "Malaybalay City",
        province: "Bukidnon",
        postalCode: "8700",
        isPrimary: true,
      })
      .returning();

    const [sa2] = await db
      .insert(serviceAccounts)
      .values({
        subscriberId: multiSubId,
        serviceAccountNumber: "BCIS-SA-TEST-P4-002",
        serviceTypeId: stype.id,
        servicePlanId: plan.id,
        installationAddressId: addr2.id,
        activationDate: "2026-08-01",
        billingStartDate: "2026-08-01",
        billingDay: 1,
        dueDay: 15,
        currentRate: "1000.00",
        status: "ACTIVE",
        cachedBalanceDue: "2000.00", // 800 + 1200
      })
      .returning();
    multiSaId = sa2.id;

    // Multi Invoice A: Older due date 2026-08-15, total ₱800.00
    const [invA] = await db
      .insert(invoices)
      .values({
        invoiceNumber: "BCIS-INV-TEST-MULTI-A",
        serviceAccountId: multiSaId,
        billingCycleId: augCycleId,
        invoiceDate: "2026-08-01",
        dueDate: "2026-08-15",
        status: "UNPAID",
        subtotal: "800.00",
        totalAmount: "800.00",
        amountPaidCache: "0.00",
        balanceDueCache: "800.00",
      })
      .returning();
    multiInvAId = invA.id;

    // Multi Invoice B: Newer due date 2026-09-15, total ₱1200.00
    const [invB] = await db
      .insert(invoices)
      .values({
        invoiceNumber: "BCIS-INV-TEST-MULTI-B",
        serviceAccountId: multiSaId,
        billingCycleId: septCycleId,
        invoiceDate: "2026-09-01",
        dueDate: "2026-09-15",
        status: "UNPAID",
        subtotal: "1200.00",
        totalAmount: "1200.00",
        amountPaidCache: "0.00",
        balanceDueCache: "1200.00",
      })
      .returning();
    multiInvBId = invB.id;
  });

  afterAll(async () => {
    await cleanTestSubscribers();
    await server.close();
  });

  // --------------------------------------------------------------------------
  // Authorization & Permissions
  // --------------------------------------------------------------------------

  it("GET /api/v1/payments returns 401 for unauthenticated request", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/payments",
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/payments returns 403 for Technician (missing payment.create)", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: { authorization: `Bearer ${techToken}` },
      payload: {
        subscriberId: testSubId,
        paymentMethod: "CASH",
        amountPaid: "500.00",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  // --------------------------------------------------------------------------
  // Allocation Preview
  // --------------------------------------------------------------------------

  it("POST /api/v1/payments/preview calculates live oldest-first projection without mutating state", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/payments/preview",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: multiSubId,
        amount: "1000.00",
      },
    });

    expect(res.statusCode).toBe(200);
    const preview = JSON.parse(res.body);

    expect(preview.totalPaymentAmount).toBe("1000.00");
    expect(preview.totalAllocated).toBe("1000.00");
    expect(preview.advanceCredit).toBe("0.00");
    expect(preview.invoiceAllocations.length).toBe(2);

    // Oldest invoice (Due Aug 15, ₱800) gets fully satisfied
    expect(preview.invoiceAllocations[0].invoiceId).toBe(multiInvAId);
    expect(preview.invoiceAllocations[0].allocatedAmount).toBe("800.00");
    expect(preview.invoiceAllocations[0].remainingBalance).toBe("0.00");
    expect(preview.invoiceAllocations[0].resultingStatus).toBe("PAID");

    // Newer invoice (Due Sept 15, ₱1200) gets remaining ₱200
    expect(preview.invoiceAllocations[1].invoiceId).toBe(multiInvBId);
    expect(preview.invoiceAllocations[1].allocatedAmount).toBe("200.00");
    expect(preview.invoiceAllocations[1].remainingBalance).toBe("1000.00");
    expect(preview.invoiceAllocations[1].resultingStatus).toBe("PARTIALLY_PAID");
  });

  // --------------------------------------------------------------------------
  // AT-01: Exact Payment
  // --------------------------------------------------------------------------

  let at01ReceiptNumber: string;

  it("AT-01: Exact payment satisfies invoice balance, sets PAID, mints receipt, and posts ledger credit", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: testSubId,
        serviceAccountId: testSaId,
        paymentMethod: "CASH",
        amountPaid: "1000.00",
        tenderedAmount: "1000.00",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.payment).toBeDefined();
    expect(body.payment.receiptNumber).toMatch(/^BCIS-REC-\d{4}-\d{4}$/);
    expect(body.payment.status).toBe("POSTED");
    expect(body.payment.amountPaid).toBe("1000.00");
    expect(body.payment.allocatedAmount).toBe("1000.00");
    expect(body.payment.advanceAmount).toBe("0.00");
    expect(body.payment.changeAmount).toBe("0.00");
    at01ReceiptNumber = body.payment.receiptNumber;

    // Verify August Invoice status in DB
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, augInvoiceId));
    expect(inv.status).toBe("PAID");
    expect(inv.balanceDueCache).toBe("0.00");
    expect(inv.amountPaidCache).toBe("1000.00");

    // Verify Service Account cached balance decremented by 1000 (was 2500 -> 1500)
    const [sa] = await db.select().from(serviceAccounts).where(eq(serviceAccounts.id, testSaId));
    expect(sa.cachedBalanceDue).toBe("1500.00");

    // Verify Subscriber Ledger has payment credit entry
    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.serviceAccountId, testSaId), eq(ledgerEntries.referenceType, "PAYMENT")));
    expect(entries.length).toBeGreaterThanOrEqual(1);

    const latest = entries[entries.length - 1];
    expect(latest.creditAmount).toBe("1000.00");
    expect(latest.debitAmount).toBe("0.00");
    expect(latest.referenceId).toBe(body.payment.id);
  });

  // --------------------------------------------------------------------------
  // AT-02: Partial Payment
  // --------------------------------------------------------------------------

  it("AT-02: Partial payment transitions invoice to PARTIALLY_PAID and decrements balanceDueCache accurately", async () => {
    // September invoice has ₱1500.00 due. Pay ₱500.00 partially.
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: testSubId,
        serviceAccountId: testSaId,
        paymentMethod: "CASH",
        amountPaid: "500.00",
        tenderedAmount: "1000.00", // Tendered 1000 -> change 500
        notes: "AT-02 Partial Payment Test",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.payment.amountPaid).toBe("500.00");
    expect(body.payment.changeAmount).toBe("500.00");
    expect(body.payment.allocatedAmount).toBe("500.00");
    expect(body.payment.advanceAmount).toBe("0.00");

    // Verify September Invoice status
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, septInvoiceId));
    expect(inv.status).toBe("PARTIALLY_PAID");
    expect(inv.balanceDueCache).toBe("1000.00");
    expect(inv.amountPaidCache).toBe("500.00");

    // Verify Service Account cached balance decremented to 1000.00
    const [sa] = await db.select().from(serviceAccounts).where(eq(serviceAccounts.id, testSaId));
    expect(sa.cachedBalanceDue).toBe("1000.00");
  });

  // --------------------------------------------------------------------------
  // AT-03: Advance Payment
  // --------------------------------------------------------------------------

  it("AT-03: Advance payment fully settles outstanding invoice and stores surplus in advanceAmount", async () => {
    // Remaining balance on September invoice is ₱1000.00. Pay ₱1300.00.
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: testSubId,
        serviceAccountId: testSaId,
        paymentMethod: "BANK_TRANSFER",
        referenceNumber: "BANK-TXN-12345",
        amountPaid: "1300.00",
        notes: "AT-03 Advance Payment Test",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.payment.amountPaid).toBe("1300.00");
    expect(body.payment.allocatedAmount).toBe("1000.00");
    expect(body.payment.advanceAmount).toBe("300.00");

    // Verify September invoice is now PAID
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, septInvoiceId));
    expect(inv.status).toBe("PAID");
    expect(inv.balanceDueCache).toBe("0.00");
    expect(inv.amountPaidCache).toBe("1500.00");

    // Verify Service Account cached balance reached 0.00
    const [sa] = await db.select().from(serviceAccounts).where(eq(serviceAccounts.id, testSaId));
    expect(sa.cachedBalanceDue).toBe("0.00");

    // Full payment amount (₱1300.00) posted to ledger
    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.serviceAccountId, testSaId), eq(ledgerEntries.referenceId, body.payment.id)));
    expect(entries.length).toBe(1);
    expect(entries[0].creditAmount).toBe("1300.00");
  });

  // --------------------------------------------------------------------------
  // AT-04: Oldest-First Arrears Allocation
  // --------------------------------------------------------------------------

  it("AT-04: Multi-invoice payment allocates strictly oldest-first before newer invoices", async () => {
    // multiSub has Invoice A (₱800, due Aug 15) and Invoice B (₱1200, due Sept 15).
    // Post payment of ₱1200.00.
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: multiSubId,
        paymentMethod: "CASH",
        amountPaid: "1200.00",
        notes: "AT-04 Oldest First Test",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);

    expect(body.allocations.length).toBe(2);

    // Allocation 1: Invoice A (oldest) gets ₱800 -> PAID, balance 0.00
    const allocA = body.allocations.find((a: any) => a.invoiceId === multiInvAId);
    expect(allocA).toBeDefined();
    expect(allocA.allocatedAmount).toBe("800.00");
    expect(allocA.remainingBalance).toBe("0.00");
    expect(allocA.status).toBe("PAID");

    // Allocation 2: Invoice B (newer) gets ₱400 -> PARTIALLY_PAID, balance 800.00
    const allocB = body.allocations.find((a: any) => a.invoiceId === multiInvBId);
    expect(allocB).toBeDefined();
    expect(allocB.allocatedAmount).toBe("400.00");
    expect(allocB.remainingBalance).toBe("800.00");
    expect(allocB.status).toBe("PARTIALLY_PAID");

    // Verify DB states
    const [invA] = await db.select().from(invoices).where(eq(invoices.id, multiInvAId));
    expect(invA.status).toBe("PAID");
    expect(invA.balanceDueCache).toBe("0.00");

    const [invB] = await db.select().from(invoices).where(eq(invoices.id, multiInvBId));
    expect(invB.status).toBe("PARTIALLY_PAID");
    expect(invB.balanceDueCache).toBe("800.00");
    expect(invB.amountPaidCache).toBe("400.00");
  });

  // --------------------------------------------------------------------------
  // AT-05: Duplicate GCash Reference Protection
  // --------------------------------------------------------------------------

  it("AT-05: System rejects duplicate GCash / payment reference numbers", async () => {
    const gcashRef = "GCASH-REF-DUP-99991";

    // First payment with GCash reference succeeds
    const res1 = await server.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: multiSubId,
        paymentMethod: "GCASH",
        referenceNumber: gcashRef,
        amountPaid: "100.00",
      },
    });
    expect(res1.statusCode).toBe(201);

    // Second payment with duplicate GCash reference MUST FAIL
    const res2 = await server.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: multiSubId,
        paymentMethod: "GCASH",
        referenceNumber: gcashRef,
        amountPaid: "100.00",
      },
    });

    expect(res2.statusCode).toBe(409);
    const body2 = JSON.parse(res2.body);
    expect(body2.message).toContain("Duplicate payment reference");
  });

  // --------------------------------------------------------------------------
  // AT-06: Payment Reversal with Audit Trail
  // --------------------------------------------------------------------------

  it("AT-06: Cashier is forbidden from reversing payments (lacks payment.reverse)", async () => {
    // Find an active payment to attempt reversing
    const [pmt] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.subscriberId, multiSubId), eq(payments.isReversed, false)))
      .limit(1);

    expect(pmt).toBeDefined();

    const res = await server.inject({
      method: "POST",
      url: `/api/v1/payments/${pmt.id}/reverse`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        reason: "Cashier unauthorized reversal attempt",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("AT-06: Admin successfully reverses payment, restoring invoice balances, statuses, and ledger compensatory debit", async () => {
    // Dedicated service account to respect AT-11 unique constraint (serviceAccountId, billingCycleId)
    const [plan] = await db.select().from(servicePlans).limit(1);
    const [stype] = await db.select().from(serviceTypes).limit(1);
    const [addr] = await db
      .select()
      .from(subscriberAddresses)
      .where(eq(subscriberAddresses.subscriberId, multiSubId))
      .limit(1);

    const [revSa] = await db
      .insert(serviceAccounts)
      .values({
        subscriberId: multiSubId,
        serviceAccountNumber: "BCIS-SA-TEST-REV-001",
        serviceTypeId: stype.id,
        servicePlanId: plan.id,
        installationAddressId: addr.id,
        activationDate: "2026-08-01",
        billingStartDate: "2026-08-01",
        billingDay: 1,
        dueDay: 15,
        currentRate: "700.00",
        status: "ACTIVE",
        cachedBalanceDue: "700.00",
      })
      .returning();

    const [freshInv] = await db
      .insert(invoices)
      .values({
        invoiceNumber: "BCIS-INV-REVERSAL-TEST",
        serviceAccountId: revSa.id,
        billingCycleId: septCycleId,
        invoiceDate: "2026-09-01",
        dueDate: "2026-09-15",
        status: "UNPAID",
        subtotal: "700.00",
        totalAmount: "700.00",
        amountPaidCache: "0.00",
        balanceDueCache: "700.00",
      })
      .returning();

    // Make exact payment
    const payRes = await server.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: multiSubId,
        serviceAccountId: revSa.id,
        paymentMethod: "CASH",
        amountPaid: "700.00",
        notes: "Payment to be reversed",
      },
    });

    expect(payRes.statusCode).toBe(201);
    const paymentId = JSON.parse(payRes.body).payment.id;

    // Verify invoice is PAID
    const [paidInv] = await db.select().from(invoices).where(eq(invoices.id, freshInv.id));
    expect(paidInv.status).toBe("PAID");
    expect(paidInv.balanceDueCache).toBe("0.00");

    // Admin reverses payment
    const revRes = await server.inject({
      method: "POST",
      url: `/api/v1/payments/${paymentId}/reverse`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        reason: "Customer check bounced / entry error reversal",
      },
    });

    expect(revRes.statusCode).toBe(200);
    const revBody = JSON.parse(revRes.body);
    expect(revBody.payment.isReversed).toBe(true);
    expect(revBody.payment.status).toBe("REVERSED");
    expect(revBody.payment.reversalReason).toBe("Customer check bounced / entry error reversal");
    expect(revBody.payment.reversedAt).toBeDefined();

    // Verify invoice was restored to UNPAID and ₱700.00 balance
    const [restoredInv] = await db.select().from(invoices).where(eq(invoices.id, freshInv.id));
    expect(restoredInv.status).toBe("UNPAID");
    expect(restoredInv.balanceDueCache).toBe("700.00");
    expect(restoredInv.amountPaidCache).toBe("0.00");

    // Verify compensatory DEBIT posted to ledger
    const [revLedgerEntry] = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.serviceAccountId, revSa.id), eq(ledgerEntries.referenceType, "REVERSAL")))
      .limit(1);

    expect(revLedgerEntry).toBeDefined();
    expect(revLedgerEntry.debitAmount).toBe("700.00");
    expect(revLedgerEntry.creditAmount).toBe("0.00");
    expect(revLedgerEntry.description).toContain("Payment Reversal");

    // Attempting to reverse an already reversed payment returns error
    const doubleRevRes = await server.inject({
      method: "POST",
      url: `/api/v1/payments/${paymentId}/reverse`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        reason: "Second reversal attempt",
      },
    });

    expect(doubleRevRes.statusCode).toBe(400);
    expect(JSON.parse(doubleRevRes.body).message).toContain("already been reversed");
  });

  // --------------------------------------------------------------------------
  // List and Hydrated Receipt View
  // --------------------------------------------------------------------------

  it("GET /api/v1/payments allows Cashier to list payments with filters", async () => {
    const res = await server.inject({
      method: "GET",
      url: `/api/v1/payments?subscriberId=${testSubId}`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);

    const first = body.data[0];
    expect(first.receiptNumber).toMatch(/^BCIS-REC-\d{4}-\d{4}$/);
    expect(first.subscriber).toBeDefined();
  });

  it("GET /api/v1/payments/:id returns complete receipt with allocation breakdown and cashier details", async () => {
    const listRes = await server.inject({
      method: "GET",
      url: `/api/v1/payments?subscriberId=${testSubId}`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    const sampleId = JSON.parse(listRes.body).data[0].id;

    const res = await server.inject({
      method: "GET",
      url: `/api/v1/payments/${sampleId}`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    expect(res.statusCode).toBe(200);
    const receipt = JSON.parse(res.body);
    expect(receipt.id).toBe(sampleId);
    expect(receipt.receiptNumber).toMatch(/^BCIS-REC-\d{4}-\d{4}$/);
    expect(receipt.subscriber).toBeDefined();
    expect(receipt.cashier).toBeDefined();
    expect(Array.isArray(receipt.allocations)).toBe(true);
  });
});
