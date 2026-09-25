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
  ledgerEntries,
  collectors,
  collectionAreas,
  suspensionRecords,
  reconnectionRecords,
  serviceAccountStatusHistory,
  auditLogs,
} from "../../db/schema/index.js";
import { eq, or, inArray } from "drizzle-orm";
import { getNextDocumentNumber } from "../../db/sequences.js";

async function cleanReceivablesTestData() {
  const existingSubs = await db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(
      or(
        eq(subscribers.accountNumber, "BCIS-SUB-TEST-REC-001"),
        eq(subscribers.accountNumber, "BCIS-SUB-TEST-REC-002"),
        eq(subscribers.accountNumber, "BCIS-SUB-TEST-REC-003")
      )
    );

  for (const sub of existingSubs) {
    const sas = await db
      .select({ id: serviceAccounts.id })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.subscriberId, sub.id));
    const saIds = sas.map((s) => s.id);

    if (saIds.length > 0) {
      await db.delete(reconnectionRecords).where(inArray(reconnectionRecords.serviceAccountId, saIds));
      await db.delete(suspensionRecords).where(inArray(suspensionRecords.serviceAccountId, saIds));
      await db.delete(serviceAccountStatusHistory).where(inArray(serviceAccountStatusHistory.serviceAccountId, saIds));

      const invs = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(inArray(invoices.serviceAccountId, saIds));
      const invIds = invs.map((i) => i.id);

      if (invIds.length > 0) {
        await db.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, invIds));
        await db.delete(invoices).where(inArray(invoices.id, invIds));
      }

      await db.delete(ledgerEntries).where(inArray(ledgerEntries.serviceAccountId, saIds));
      await db.delete(serviceAccounts).where(inArray(serviceAccounts.id, saIds));
    }

    await db.delete(subscriberAddresses).where(eq(subscriberAddresses.subscriberId, sub.id));
    await db.delete(subscribers).where(eq(subscribers.id, sub.id));
  }

  // Clean test billing cycles
  const cycles = await db
    .select({ id: billingCycles.id })
    .from(billingCycles)
    .where(
      or(
        eq(billingCycles.cycleCode, "2026-REC-01"),
        eq(billingCycles.cycleCode, "2026-REC-02"),
        eq(billingCycles.cycleCode, "2026-REC-03"),
        eq(billingCycles.cycleCode, "2026-REC-04"),
        eq(billingCycles.cycleCode, "2026-REC-05")
      )
    );
  if (cycles.length > 0) {
    const cycleIds = cycles.map((c) => c.id);
    await db.delete(invoices).where(inArray(invoices.billingCycleId, cycleIds));
    await db.delete(billingCycles).where(inArray(billingCycles.id, cycleIds));
  }
}

describe("Receivables, AR Aging & Service Control Integration Tests (Phase 7)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let cashierToken: string;
  let techToken: string;

  let testServiceAccountId1: string; // Used for aging and overdue
  let testServiceAccountId2: string; // Used for suspension & reconnection integration gate
  let testPlanId: string;

  beforeAll(async () => {
    app = buildServer();
    await app.ready();

    await cleanReceivablesTestData();

    // 1. Authenticate tokens
    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin", password: "Password123!" },
    });
    adminToken = JSON.parse(adminLogin.body).token;

    const cashierLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "cashier", password: "Password123!" },
    });
    cashierToken = JSON.parse(cashierLogin.body).token;

    const techLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "tech", password: "Password123!" },
    });
    techToken = JSON.parse(techLogin.body).token;

    // 2. Fetch seed prerequisites
    const [st] = await db.select().from(serviceTypes).limit(1);
    const [sp] = await db.select().from(servicePlans).limit(1);
    const [ca] = await db.select().from(collectionAreas).limit(1);
    const [col] = await db.select().from(collectors).limit(1);

    testPlanId = sp.id;

    // 3. Create test billing cycles for aging buckets
    // As-of reference: 2026-09-25
    // Current (due 2026-10-05) -> days past due <= 0
    // 1-30 days (due 2026-09-10) -> 15 days past due
    // 31-60 days (due 2026-08-10) -> 46 days past due
    // 61-90 days (due 2026-07-10) -> 77 days past due
    // 90+ days (due 2026-05-10) -> 138 days past due
    const testCycles = [
      { code: "2026-REC-01", start: "2026-10-01", end: "2026-10-31", billDate: "2026-10-01", due: "2026-10-05" },
      { code: "2026-REC-02", start: "2026-09-01", end: "2026-09-30", billDate: "2026-09-01", due: "2026-09-10" },
      { code: "2026-REC-03", start: "2026-08-01", end: "2026-08-31", billDate: "2026-08-01", due: "2026-08-10" },
      { code: "2026-REC-04", start: "2026-07-01", end: "2026-07-31", billDate: "2026-07-01", due: "2026-07-10" },
      { code: "2026-REC-05", start: "2026-05-01", end: "2026-05-31", billDate: "2026-05-01", due: "2026-05-10" },
    ];

    const cycleMap = new Map<string, string>();
    for (const c of testCycles) {
      const [newCycle] = await db
        .insert(billingCycles)
        .values({
          cycleCode: c.code,
          periodStart: c.start,
          periodEnd: c.end,
          billingDate: c.billDate,
          dueDate: c.due,
          status: "OPEN",
        })
        .returning();
      cycleMap.set(c.code, newCycle.id);
    }

    // 4. Create Subscriber 1 (Multiple invoices across aging buckets)
    const [sub1] = await db
      .insert(subscribers)
      .values({
        accountNumber: "BCIS-SUB-TEST-REC-001",
        firstName: "Fernando",
        lastName: "Poe",
        businessName: "FPJ Cinema Hub",
        primaryContactNumber: "09171112233",
        status: "ACTIVE",
      })
      .returning();

    const [addr1] = await db
      .insert(subscriberAddresses)
      .values({
        subscriberId: sub1.id,
        label: "Primary Site",
        line1: "Purok 1 Sayre Highway",
        barangay: "Casisang",
        cityMunicipality: "Malaybalay City",
        province: "Bukidnon",
      })
      .returning();

    const [sa1] = await db
      .insert(serviceAccounts)
      .values({
        subscriberId: sub1.id,
        serviceAccountNumber: "BCIS-SA-TEST-REC-001",
        serviceTypeId: st.id,
        servicePlanId: sp.id,
        installationAddressId: addr1.id,
        activationDate: "2026-01-01",
        billingStartDate: "2026-01-01",
        currentRate: "1000.00",
        status: "ACTIVE",
        collectionAreaId: ca.id,
        collectorId: col.id,
        cachedBalanceDue: "5000.00",
      })
      .returning();
    testServiceAccountId1 = sa1.id;

    // Create 5 invoices for Subscriber 1 across aging buckets (1,000 each)
    const bucketInvoices = [
      { cycleCode: "2026-REC-01", due: "2026-10-05", amount: "1000.00" }, // Current
      { cycleCode: "2026-REC-02", due: "2026-09-10", amount: "1000.00" }, // 1-30 days
      { cycleCode: "2026-REC-03", due: "2026-08-10", amount: "1000.00" }, // 31-60 days
      { cycleCode: "2026-REC-04", due: "2026-07-10", amount: "1000.00" }, // 61-90 days
      { cycleCode: "2026-REC-05", due: "2026-05-10", amount: "1000.00" }, // 90+ days
    ];

    for (let i = 0; i < bucketInvoices.length; i++) {
      const b = bucketInvoices[i]!;
      const invNum = await getNextDocumentNumber("BCIS-INV");
      await db.insert(invoices).values({
        invoiceNumber: invNum,
        serviceAccountId: sa1.id,
        billingCycleId: cycleMap.get(b.cycleCode)!,
        invoiceDate: b.due,
        dueDate: b.due,
        status: "UNPAID",
        subtotal: b.amount,
        totalAmount: b.amount,
        amountPaidCache: "0.00",
        balanceDueCache: b.amount,
      });
    }

    // 5. Create Subscriber 2 (Delinquent candidate for service control lifecycle)
    const [sub2] = await db
      .insert(subscribers)
      .values({
        accountNumber: "BCIS-SUB-TEST-REC-002",
        firstName: "Ricardo",
        lastName: "Dalisay",
        primaryContactNumber: "09179998877",
        status: "ACTIVE",
      })
      .returning();

    const [addr2] = await db
      .insert(subscriberAddresses)
      .values({
        subscriberId: sub2.id,
        label: "Residence",
        line1: "Purok 4 Poblacion",
        barangay: "Poblacion",
        cityMunicipality: "Malaybalay City",
        province: "Bukidnon",
      })
      .returning();

    const [sa2] = await db
      .insert(serviceAccounts)
      .values({
        subscriberId: sub2.id,
        serviceAccountNumber: "BCIS-SA-TEST-REC-002",
        serviceTypeId: st.id,
        servicePlanId: sp.id,
        installationAddressId: addr2.id,
        activationDate: "2026-01-01",
        billingStartDate: "2026-01-01",
        currentRate: "1800.00",
        status: "ACTIVE",
        collectionAreaId: ca.id,
        collectorId: col.id,
        cachedBalanceDue: "3600.00",
      })
      .returning();
    testServiceAccountId2 = sa2.id;

    // Create 2 overdue invoices for Sub 2 (exceeding ₱1,500 threshold)
    const sub2Invoices = [
      { cycleCode: "2026-REC-02", due: "2026-09-10", amount: "1800.00" },
      { cycleCode: "2026-REC-03", due: "2026-08-10", amount: "1800.00" },
    ];
    for (const b of sub2Invoices) {
      const invNum = await getNextDocumentNumber("BCIS-INV");
      await db.insert(invoices).values({
        invoiceNumber: invNum,
        serviceAccountId: sa2.id,
        billingCycleId: cycleMap.get(b.cycleCode)!,
        invoiceDate: b.due,
        dueDate: b.due,
        status: "UNPAID",
        subtotal: b.amount,
        totalAmount: b.amount,
        amountPaidCache: "0.00",
        balanceDueCache: b.amount,
      });
    }
  });

  afterAll(async () => {
    await cleanReceivablesTestData();
    await app.close();
  });

  // --- TEST 1: Outstanding Receivables ---
  it("GET /api/v1/receivables/outstanding returns all open invoices with balance > 0", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/receivables/outstanding?serviceAccountId=" + testServiceAccountId1,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(5);
    expect(body.pagination.total).toBe(5);
    expect(body.totalOutstanding).toContain("5,000.00");

    const first = body.data[0];
    expect(first).toHaveProperty("invoiceNumber");
    expect(first).toHaveProperty("subscriberDisplayName");
    expect(first.subscriberDisplayName).toContain("FPJ Cinema Hub");
    expect(first.serviceAccountNumber).toBe("BCIS-SA-TEST-REC-001");
  });

  // --- TEST 2: Overdue Receivables with Grace Period ---
  it("GET /api/v1/receivables/overdue filters invoices taking grace period into account", async () => {
    // As of 2026-09-25 with 5-day grace period:
    // Due 2026-10-05 (Current) is not overdue
    // Due 2026-09-10 (15 days ago) is past 5-day grace period -> Overdue
    // Due 2026-08-10 (46 days ago) -> Overdue
    // Due 2026-07-10 (77 days ago) -> Overdue
    // Due 2026-05-10 (138 days ago) -> Overdue
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/receivables/overdue?asOfDate=2026-09-25&includeGracePeriod=true`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.gracePeriodDays).toBe(5);
    expect(body.data.length).toBeGreaterThanOrEqual(4);

    // Verify all returned invoices have daysOverdue > 5
    for (const inv of body.data) {
      expect(inv.daysOverdue).toBeGreaterThan(5);
    }
  });

  // --- TEST 3: AR Aging Report across 5 Standard Buckets (PRODUCT.md Section 8.9) ---
  it("GET /api/v1/receivables/aging calculates exact amounts in Current, 1-30, 31-60, 61-90, 90+ buckets relative to asOfDate", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/receivables/aging?asOfDate=2026-09-25",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const summary = body.summary;

    expect(summary.asOfDate).toBe("2026-09-25");

    // In Subscriber 1:
    // Current (due 2026-10-05): ₱1,000.00
    // 1-30 days (due 2026-09-10, 15 days past due): ₱1,000.00
    // 31-60 days (due 2026-08-10, 46 days past due): ₱1,000.00
    // 61-90 days (due 2026-07-10, 77 days past due): ₱1,000.00
    // 90+ days (due 2026-05-10, 138 days past due): ₱1,000.00
    // In Subscriber 2:
    // Due 2026-09-10 (15 days past due): ₱1,800.00 -> 1-30 days
    // Due 2026-08-10 (46 days past due): ₱1,800.00 -> 31-60 days

    // Total in 1-30: 1000 + 1800 = 2800.00
    // Total in 31-60: 1000 + 1800 = 2800.00
    // Total in 61-90: 1000.00
    // Total in 90+: 1000.00
    // Total Current: at least 1000.00

    expect(summary.totalReceivable).toMatch(/^₱[\d,]+\.\d{2}$/);
    expect(summary.current.amount).toMatch(/^₱[\d,]+\.\d{2}$/);
    expect(summary.days1to30.amount).toMatch(/^₱[\d,]+\.\d{2}$/);
    expect(summary.days31to60.amount).toMatch(/^₱[\d,]+\.\d{2}$/);
    expect(summary.days61to90.amount).toMatch(/^₱[\d,]+\.\d{2}$/);
    expect(summary.days90Plus.amount).toMatch(/^₱[\d,]+\.\d{2}$/);

    // Check subscriber rows
    const subRows = body.subscribers;
    expect(subRows.length).toBeGreaterThanOrEqual(2);

    const fpjRow = subRows.find((r: any) => r.subscriberAccountNumber === "BCIS-SUB-TEST-REC-001");
    expect(fpjRow).toBeDefined();
    expect(fpjRow.currentAmount).toContain("1,000.00");
    expect(fpjRow.days1to30Amount).toContain("1,000.00");
    expect(fpjRow.days31to60Amount).toContain("1,000.00");
    expect(fpjRow.days61to90Amount).toContain("1,000.00");
    expect(fpjRow.days90PlusAmount).toContain("1,000.00");
    expect(fpjRow.days61to90Amount).toContain("1,000.00");
    expect(fpjRow.days90PlusAmount).toContain("1,000.00");
    expect(fpjRow.totalDue).toContain("5,000.00");
  });

  // --- TEST 4: Suspension Candidates Screener ---
  it("GET /api/v1/receivables/suspension-candidates flags accounts exceeding overdue threshold", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/receivables/suspension-candidates?asOfDate=2026-09-25",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    const candidate = body.data.find((c: any) => c.serviceAccountNumber === "BCIS-SA-TEST-REC-002");
    expect(candidate).toBeDefined();
    expect(candidate.subscriberDisplayName).toBe("Ricardo Dalisay");
    expect(candidate.overdueBalance).toContain("3,600.00");
    expect(candidate.candidateReasons.length).toBeGreaterThan(0);
    expect(candidate.candidateReasons.some((r: string) => r.includes("exceeds threshold"))).toBe(true);
  });

  // --- TEST 5: Service Suspension Workflow Validation ---
  it("POST /api/v1/service-accounts/:id/suspend validates reason length and records suspension", async () => {
    // 1. Rejects short reason (< 5 chars)
    const badRes = await app.inject({
      method: "POST",
      url: `/api/v1/service-accounts/${testServiceAccountId2}/suspend`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { reason: "due" },
    });
    expect(badRes.statusCode).toBe(422);

    // 2. Suspends account with valid reason
    const okRes = await app.inject({
      method: "POST",
      url: `/api/v1/service-accounts/${testServiceAccountId2}/suspend`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        reason: "Delinquent past 30 days; overdue balance ₱3,600 exceeds threshold.",
        notes: "Notice delivered on 2026-09-20.",
        effectiveDate: "2026-09-25",
      },
    });

    expect(okRes.statusCode).toBe(200);
    const body = JSON.parse(okRes.body);
    expect(body.message).toContain("successfully suspended");
    expect(body.serviceAccount.status).toBe("SUSPENDED");
    expect(body.suspension).toBeDefined();
    expect(body.suspension.reason).toBe("Delinquent past 30 days; overdue balance ₱3,600 exceeds threshold.");

    // 3. Attempting to suspend again fails with 400
    const dupRes = await app.inject({
      method: "POST",
      url: `/api/v1/service-accounts/${testServiceAccountId2}/suspend`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        reason: "Second suspension attempt",
      },
    });
    expect(dupRes.statusCode).toBe(400);
    expect(JSON.parse(dupRes.body).message).toContain("already suspended");
  });

  // --- TEST 6: Reconnection Workflow & Work Order Lifecycle ---
  it("POST /api/v1/service-accounts/:id/reconnect creates reconnection order and completes work order", async () => {
    // 1. Create a scheduled reconnection work order
    const reconRes = await app.inject({
      method: "POST",
      url: `/api/v1/service-accounts/${testServiceAccountId2}/reconnect`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        fee: "300.00",
        scheduledAt: "2026-09-26T10:00:00Z",
        notes: "Subscriber paid full arrears at cashier. Restoring service.",
      },
    });

    expect(reconRes.statusCode).toBe(200);
    const reconBody = JSON.parse(reconRes.body);
    const order = reconBody.reconnection;
    expect(order.reconnectionNumber).toMatch(/^BCIS-RECON-\d{4}-\d{4}$/);
    expect(order.status).toBe("SCHEDULED");
    expect(order.fee).toBe("300.00");

    // 2. Complete the work order
    const completeRes = await app.inject({
      method: "POST",
      url: `/api/v1/receivables/reconnections/${order.id}/complete`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        notes: "Optical jumper cable replaced and signal verified (-18.2 dBm).",
      },
    });

    expect(completeRes.statusCode).toBe(200);
    const completeBody = JSON.parse(completeRes.body);
    expect(completeBody.reconnection.status).toBe("COMPLETED");
    expect(completeBody.serviceAccount.status).toBe("ACTIVE");
  });

  // --- TEST 7: Phase 7 Integration Gate ---
  it("Phase 7 Integration Gate: Proves an overdue account progresses through service-control workflow without losing historical state", async () => {
    // Service Account 2 was ACTIVE -> SUSPENDED -> RECONNECTED (ACTIVE)
    const historyRes = await app.inject({
      method: "GET",
      url: `/api/v1/service-accounts/${testServiceAccountId2}/service-history`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(historyRes.statusCode).toBe(200);
    const body = JSON.parse(historyRes.body);
    const events = body.events;

    expect(events.length).toBeGreaterThanOrEqual(3);

    // Verify presence of all transition events
    const hasSuspensionEvent = events.some((e: any) => e.eventType === "SUSPENSION");
    const hasReconnectionEvent = events.some((e: any) => e.eventType === "RECONNECTION");
    const hasStatusTransitions = events.filter((e: any) => e.eventType === "STATUS_CHANGE");

    expect(hasSuspensionEvent).toBe(true);
    expect(hasReconnectionEvent).toBe(true);
    expect(hasStatusTransitions.length).toBeGreaterThanOrEqual(2);

    // Verify status changes: ACTIVE -> SUSPENDED and SUSPENDED -> ACTIVE
    const toSuspended = hasStatusTransitions.find((e: any) => e.title.includes("ACTIVE → SUSPENDED"));
    const toActive = hasStatusTransitions.find((e: any) => e.title.includes("SUSPENDED → ACTIVE"));

    expect(toSuspended).toBeDefined();
    expect(toActive).toBeDefined();

    // Verify actor name is recorded
    expect(toSuspended.actorName).toContain("Maria Santos");
  });

  // --- TEST 8: RBAC Enforcement ---
  it("enforces RBAC permissions: Cashier without service.control cannot suspend or reconnect accounts", async () => {
    // Cashier attempts to suspend
    const resSuspend = await app.inject({
      method: "POST",
      url: `/api/v1/service-accounts/${testServiceAccountId1}/suspend`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { reason: "Unauthorized cashier suspension attempt" },
    });
    expect(resSuspend.statusCode).toBe(403);

    // Cashier attempts to reconnect
    const resReconnect = await app.inject({
      method: "POST",
      url: `/api/v1/service-accounts/${testServiceAccountId1}/reconnect`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { fee: "300.00" },
    });
    expect(resReconnect.statusCode).toBe(403);

    // Technician with service.control IS authorized
    const resTechHistory = await app.inject({
      method: "GET",
      url: `/api/v1/service-accounts/${testServiceAccountId2}/service-history`,
      headers: { authorization: `Bearer ${techToken}` },
    });
    expect(resTechHistory.statusCode).toBe(200);
  });
});
