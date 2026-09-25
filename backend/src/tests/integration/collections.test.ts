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
  collectors,
  collectionAreas,
  collectionBatches,
  collectionBatchAccounts,
  collectorRemittances,
} from "../../db/schema/index.js";
import { eq, and, or, inArray } from "drizzle-orm";
import { getNextDocumentNumber } from "../../db/sequences.js";

async function cleanCollectionsTestData() {
  // Clean up batches created in tests
  const testBatches = await db
    .select({ id: collectionBatches.id })
    .from(collectionBatches);
  
  const batchIds = testBatches.map((b) => b.id);
  if (batchIds.length > 0) {
    await db.delete(collectorRemittances).where(inArray(collectorRemittances.collectionBatchId, batchIds));
    await db.delete(collectionBatchAccounts).where(inArray(collectionBatchAccounts.collectionBatchId, batchIds));
    await db.delete(collectionBatches).where(inArray(collectionBatches.id, batchIds));
  }

  // Clean up test subscribers
  const existingSubs = await db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(
      or(
        eq(subscribers.accountNumber, "BCIS-SUB-TEST-COL-001"),
        eq(subscribers.accountNumber, "BCIS-SUB-TEST-COL-002"),
        eq(subscribers.accountNumber, "BCIS-SUB-TEST-COL-003")
      )
    );

  for (const sub of existingSubs) {
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

describe("Phase 6: Collections, Batches & Remittance Reconciliation (AT-07 & AT-08)", () => {
  let server: FastifyInstance;
  let adminToken: string;
  let supervisorToken: string;
  let cashierToken: string;
  let techToken: string;

  let collector1Id: string;
  let area1Id: string;
  let planId: string;
  let serviceTypeId: string;
  let cycleAugId: string;
  let cycleSeptId: string;

  let testSub1Id: string;
  let testSa1Id: string;
  let testInvoice1Id: string;

  let testSub2Id: string;
  let testSa2Id: string;
  let testInvoice2Id: string;

  let testSub3Id: string;
  let testSa3Id: string;
  let testInvoice3Id: string;

  beforeAll(async () => {
    server = buildServer();
    await server.ready();

    await cleanCollectionsTestData();

    // Login Admin
    const adminRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin", password: "Password123!" },
    });
    expect(adminRes.statusCode).toBe(200);
    adminToken = JSON.parse(adminRes.body).token;

    // Login Supervisor
    const supRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "supervisor", password: "Password123!" },
    });
    expect(supRes.statusCode).toBe(200);
    supervisorToken = JSON.parse(supRes.body).token;

    // Login Cashier
    const cashierRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "cashier", password: "Password123!" },
    });
    expect(cashierRes.statusCode).toBe(200);
    cashierToken = JSON.parse(cashierRes.body).token;

    // Login Technician (no collection permissions)
    const techRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "tech", password: "Password123!" },
    });
    expect(techRes.statusCode).toBe(200);
    techToken = JSON.parse(techRes.body).token;

    // Get Collector & Area
    const [col] = await db
      .select()
      .from(collectors)
      .where(eq(collectors.collectorCode, "COL-001"))
      .limit(1);
    expect(col).toBeDefined();
    collector1Id = col.id;

    const [area] = await db
      .select()
      .from(collectionAreas)
      .where(eq(collectionAreas.code, "AREA-CAS"))
      .limit(1);
    expect(area).toBeDefined();
    area1Id = area.id;

    // Get Cycles
    const [augCycle] = await db
      .select()
      .from(billingCycles)
      .where(eq(billingCycles.cycleCode, "2026-08"))
      .limit(1);
    expect(augCycle).toBeDefined();
    cycleAugId = augCycle.id;

    const [septCycle] = await db
      .select()
      .from(billingCycles)
      .where(eq(billingCycles.cycleCode, "2026-09"))
      .limit(1);
    expect(septCycle).toBeDefined();
    cycleSeptId = septCycle.id;

    // Get Service Plan
    const [plan] = await db
      .select()
      .from(servicePlans)
      .where(eq(servicePlans.code, "PLAN-INT-50M"))
      .limit(1);
    expect(plan).toBeDefined();
    planId = plan.id;
    serviceTypeId = plan.serviceTypeId;

    // --- Entity 1 (For Initial & AT-07 Tests) ---
    const [sub1] = await db
      .insert(subscribers)
      .values({
        accountNumber: "BCIS-SUB-TEST-COL-001",
        firstName: "Test",
        lastName: "CollectorRouteSub1",
        email: "test.col1@bcis.local",
        primaryContactNumber: "0917-000-1111",
        status: "ACTIVE",
      })
      .returning();
    testSub1Id = sub1.id;

    const [addr1] = await db
      .insert(subscriberAddresses)
      .values({
        subscriberId: sub1.id,
        addressType: "SERVICE",
        line1: "Purok 5",
        barangay: "Casisang",
        cityMunicipality: "Malaybalay City",
        province: "Bukidnon",
        postalCode: "8700",
        isPrimary: true,
      })
      .returning();

    const [sa1] = await db
      .insert(serviceAccounts)
      .values({
        subscriberId: sub1.id,
        serviceAccountNumber: "BCIS-SA-TEST-COL-001",
        installationAddressId: addr1.id,
        serviceTypeId,
        servicePlanId: planId,
        activationDate: "2026-01-01",
        billingStartDate: "2026-01-01",
        billingDay: 1,
        dueDay: 15,
        currentRate: "1299.00",
        status: "ACTIVE",
        collectorId: collector1Id,
        collectionAreaId: area1Id,
        cachedBalanceDue: "1299.00",
      })
      .returning();
    testSa1Id = sa1.id;

    const invNum1 = await getNextDocumentNumber("BCIS-INV");
    const [inv1] = await db
      .insert(invoices)
      .values({
        invoiceNumber: invNum1,
        serviceAccountId: sa1.id,
        billingCycleId: cycleAugId,
        invoiceDate: "2026-08-01",
        dueDate: "2026-08-15",
        status: "UNPAID",
        subtotal: "1299.00",
        totalAmount: "1299.00",
        amountPaidCache: "0.00",
        balanceDueCache: "1299.00",
      })
      .returning();
    testInvoice1Id = inv1.id;

    await db.insert(invoiceItems).values({
      invoiceId: inv1.id,
      description: "Monthly Fiber 50Mbps Subscription",
      lineType: "SUBSCRIPTION",
      quantity: 1,
      unitPrice: "1299.00",
      lineTotal: "1299.00",
    });

    // --- Entity 2 (For AT-08 Shortage Test) ---
    const [sub2] = await db
      .insert(subscribers)
      .values({
        accountNumber: "BCIS-SUB-TEST-COL-002",
        firstName: "Shortage",
        lastName: "Subscriber2",
        email: "test.col2@bcis.local",
        primaryContactNumber: "0917-000-2222",
        status: "ACTIVE",
      })
      .returning();
    testSub2Id = sub2.id;

    const [addr2] = await db
      .insert(subscriberAddresses)
      .values({
        subscriberId: sub2.id,
        addressType: "SERVICE",
        line1: "Purok 6",
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
        subscriberId: sub2.id,
        serviceAccountNumber: "BCIS-SA-TEST-COL-002",
        installationAddressId: addr2.id,
        serviceTypeId,
        servicePlanId: planId,
        activationDate: "2026-01-01",
        billingStartDate: "2026-01-01",
        billingDay: 1,
        dueDay: 15,
        currentRate: "2000.00",
        status: "ACTIVE",
        collectorId: collector1Id,
        collectionAreaId: area1Id,
        cachedBalanceDue: "2000.00",
      })
      .returning();
    testSa2Id = sa2.id;

    const invNum2 = await getNextDocumentNumber("BCIS-INV");
    const [inv2] = await db
      .insert(invoices)
      .values({
        invoiceNumber: invNum2,
        serviceAccountId: sa2.id,
        billingCycleId: cycleSeptId,
        invoiceDate: "2026-09-01",
        dueDate: "2026-09-15",
        status: "UNPAID",
        subtotal: "2000.00",
        totalAmount: "2000.00",
        amountPaidCache: "0.00",
        balanceDueCache: "2000.00",
      })
      .returning();
    testInvoice2Id = inv2.id;

    await db.insert(invoiceItems).values({
      invoiceId: inv2.id,
      description: "Monthly Service Fee",
      lineType: "SUBSCRIPTION",
      quantity: 1,
      unitPrice: "2000.00",
      lineTotal: "2000.00",
    });

    // --- Entity 3 (For Overage Test) ---
    const [sub3] = await db
      .insert(subscribers)
      .values({
        accountNumber: "BCIS-SUB-TEST-COL-003",
        firstName: "Overage",
        lastName: "Subscriber3",
        email: "test.col3@bcis.local",
        primaryContactNumber: "0917-000-3333",
        status: "ACTIVE",
      })
      .returning();
    testSub3Id = sub3.id;

    const [addr3] = await db
      .insert(subscriberAddresses)
      .values({
        subscriberId: sub3.id,
        addressType: "SERVICE",
        line1: "Purok 7",
        barangay: "Casisang",
        cityMunicipality: "Malaybalay City",
        province: "Bukidnon",
        postalCode: "8700",
        isPrimary: true,
      })
      .returning();

    const [sa3] = await db
      .insert(serviceAccounts)
      .values({
        subscriberId: sub3.id,
        serviceAccountNumber: "BCIS-SA-TEST-COL-003",
        installationAddressId: addr3.id,
        serviceTypeId,
        servicePlanId: planId,
        activationDate: "2026-01-01",
        billingStartDate: "2026-01-01",
        billingDay: 1,
        dueDay: 15,
        currentRate: "1000.00",
        status: "ACTIVE",
        collectorId: collector1Id,
        collectionAreaId: area1Id,
        cachedBalanceDue: "1000.00",
      })
      .returning();
    testSa3Id = sa3.id;

    const invNum3 = await getNextDocumentNumber("BCIS-INV");
    const [inv3] = await db
      .insert(invoices)
      .values({
        invoiceNumber: invNum3,
        serviceAccountId: sa3.id,
        billingCycleId: cycleSeptId,
        invoiceDate: "2026-09-01",
        dueDate: "2026-09-15",
        status: "UNPAID",
        subtotal: "1000.00",
        totalAmount: "1000.00",
        amountPaidCache: "0.00",
        balanceDueCache: "1000.00",
      })
      .returning();
    testInvoice3Id = inv3.id;

    await db.insert(invoiceItems).values({
      invoiceId: inv3.id,
      description: "Monthly Service Fee",
      lineType: "SUBSCRIPTION",
      quantity: 1,
      unitPrice: "1000.00",
      lineTotal: "1000.00",
    });
  });

  afterAll(async () => {
    await cleanCollectionsTestData();
    await server.close();
  });

  it("should list active collectors and collection areas", async () => {
    const colRes = await server.inject({
      method: "GET",
      url: "/api/v1/collections/collectors",
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(colRes.statusCode).toBe(200);
    const colBody = JSON.parse(colRes.body);
    expect(Array.isArray(colBody.data)).toBe(true);
    expect(colBody.data.length).toBeGreaterThan(0);
    expect(colBody.data.some((c: any) => c.collectorCode === "COL-001")).toBe(true);

    const areaRes = await server.inject({
      method: "GET",
      url: "/api/v1/collections/areas",
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(areaRes.statusCode).toBe(200);
    const areaBody = JSON.parse(areaRes.body);
    expect(Array.isArray(areaBody.data)).toBe(true);
    expect(areaBody.data.length).toBeGreaterThan(0);
    expect(areaBody.data.some((a: any) => a.code === "AREA-CAS")).toBe(true);
  });

  it("should create a collection batch and include route accounts with expected cash", async () => {
    const createRes = await server.inject({
      method: "POST",
      url: "/api/v1/collections/batches",
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        collectorId: collector1Id,
        collectionAreaId: area1Id,
        collectionDate: "2026-09-25",
        notes: "Morning field collection Casisang route",
      },
    });

    expect(createRes.statusCode).toBe(201);
    const body = JSON.parse(createRes.body);
    expect(body.data).toBeDefined();
    expect(body.data.batchNumber).toMatch(/^BCIS-BATCH-2026-\d{4}$/);
    expect(body.data.status).toBe("OPEN");
    expect(body.data.collectorId).toBe(collector1Id);
    expect(body.data.collectionAreaId).toBe(area1Id);

    // Verify route accounts were attached
    expect(body.accounts).toBeDefined();
    expect(body.accounts.length).toBeGreaterThan(0);
    const assignedAccount = body.accounts.find((a: any) => a.serviceAccountId === testSa1Id);
    expect(assignedAccount).toBeDefined();
    expect(assignedAccount.expectedAmount).toBe("1299.00");
    expect(assignedAccount.status).toBe("UNPAID");

    // Fetch batch detail
    const detailRes = await server.inject({
      method: "GET",
      url: `/api/v1/collections/batches/${body.data.id}`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.body);
    expect(detailBody.batchNumber).toBe(body.data.batchNumber);
    expect(detailBody.accounts.length).toBe(body.accounts.length);
  });

  it("AT-07: Full Happy Path - Balanced Remittance and Batch Lifecycle", async () => {
    // 1. Create Batch
    const createRes = await server.inject({
      method: "POST",
      url: "/api/v1/collections/batches",
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        collectorId: collector1Id,
        collectionAreaId: area1Id,
        collectionDate: "2026-09-25",
        notes: "AT-07 Balanced Remittance Batch",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const { data: batch, accounts } = JSON.parse(createRes.body);
    const batchId = batch.id;
    const targetAccount = accounts.find((a: any) => a.serviceAccountId === testSa1Id);
    expect(targetAccount).toBeDefined();

    // 2. Record Field Collection
    const collectRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/accounts/${targetAccount.id}/collect`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        amount: "1299.00",
        notes: "Field payment collected in cash",
      },
    });
    expect(collectRes.statusCode).toBe(200);
    const collectBody = JSON.parse(collectRes.body);
    expect(collectBody.paymentReceiptNumber).toMatch(/^BCIS-REC-2026-\d{4}$/);
    expect(collectBody.account.status).toBe("COLLECTED");
    expect(collectBody.account.collectedAmount).toBe("1299.00");
    expect(collectBody.batch.collectedCash).toBe("1299.00");
    expect(collectBody.batch.status).toBe("IN_PROGRESS");

    // Verify invoice was updated to PAID
    const [invCheck] = await db.select().from(invoices).where(eq(invoices.id, testInvoice1Id));
    expect(invCheck.status).toBe("PAID");
    expect(invCheck.balanceDueCache).toBe("0.00");

    // 3. Submit Batch
    const submitRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/submit`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(submitRes.statusCode).toBe(200);
    const submitBody = JSON.parse(submitRes.body);
    expect(submitBody.status).toBe("SUBMITTED");

    // 4. Record Remittance (AT-07: Balanced Remittance, remitted = collected)
    const remitRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/remit`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        remittedCash: "1299.00",
        remittedNonCash: "0.00",
        notes: "Juan dela Cruz remitted exact collected amount",
      },
    });
    expect(remitRes.statusCode).toBe(201);
    const remitBody = JSON.parse(remitRes.body);
    expect(remitBody.remittanceNumber).toMatch(/^BCIS-REMIT-2026-\d{4}$/);
    expect(remitBody.remittedCash).toBe("1299.00");
    expect(remitBody.difference).toBe("0.00");
    expect(remitBody.shortageAmount).toBe("0.00");
    expect(remitBody.overageAmount).toBe("0.00");
    expect(remitBody.batchStatus).toBe("REMITTED");

    // 5. Reconcile Batch (Supervisor)
    const reconcileRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/reconcile`,
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        notes: "Supervisor Carlos Reyes verified drawer count matches receipt total",
      },
    });
    expect(reconcileRes.statusCode).toBe(200);
    const reconcileBody = JSON.parse(reconcileRes.body);
    expect(reconcileBody.status).toBe("RECONCILED");

    // 6. Close Batch (Balanced: reason not required)
    const closeRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/close`,
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {},
    });
    expect(closeRes.statusCode).toBe(200);
    const closeBody = JSON.parse(closeRes.body);
    expect(closeBody.status).toBe("CLOSED");
  });

  it("AT-08: Collector Shortage - Explicit Shortage Recorded and Closing Guardrail", async () => {
    // 1. Create batch
    const createRes = await server.inject({
      method: "POST",
      url: "/api/v1/collections/batches",
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        collectorId: collector1Id,
        collectionAreaId: area1Id,
        collectionDate: "2026-09-25",
        notes: "AT-08 Shortage Test Batch",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const { data: batch, accounts } = JSON.parse(createRes.body);
    const batchId = batch.id;
    const targetAccount = accounts.find((a: any) => a.serviceAccountId === testSa2Id);
    expect(targetAccount).toBeDefined();

    // 2. Record field collection of 2000.00
    const collectRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/accounts/${targetAccount.id}/collect`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        amount: "2000.00",
        notes: "Collected 2000 from customer",
      },
    });
    expect(collectRes.statusCode).toBe(200);

    // 3. Submit Batch
    await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/submit`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    // 4. AT-08: Collector remits 1,500.00 cash instead of 2,000.00 (Shortage of ₱500.00)
    const remitRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/remit`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        remittedCash: "1500.00",
        remittedNonCash: "0.00",
        notes: "Collector short by 500 pesos due to miscounted envelope",
      },
    });
    expect(remitRes.statusCode).toBe(201);
    const remitBody = JSON.parse(remitRes.body);
    expect(remitBody.remittedCash).toBe("1500.00");
    expect(remitBody.difference).toBe("-500.00");
    expect(remitBody.shortageAmount).toBe("500.00");
    expect(remitBody.overageAmount).toBe("0.00");
    expect(remitBody.batchStatus).toBe("REMITTED");

    // 5. Reconcile Batch
    const reconcileRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/reconcile`,
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        notes: "Shortage of 500 acknowledged by collector and supervisor",
      },
    });
    expect(reconcileRes.statusCode).toBe(200);

    // 6. AT-08 GUARD: Attempt to close batch WITHOUT supervisor reason -> MUST FAIL
    const failCloseRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/close`,
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        reason: "", // empty reason
      },
    });
    expect(failCloseRes.statusCode).toBe(422);
    const failBody = JSON.parse(failCloseRes.body);
    expect(failBody.code).toBe("REASON_REQUIRED_FOR_UNBALANCED_BATCH");

    // Attempt to close with reason < 5 characters -> MUST FAIL
    const shortReasonRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/close`,
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        reason: "nope", // 4 characters
      },
    });
    expect(shortReasonRes.statusCode).toBe(422);

    // 7. AT-08 GUARD: Close batch WITH valid supervisor reason -> SUCCESS
    const successCloseRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/close`,
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        reason: "Collector Juan reported loss of 500 pesos; promissory note filed with HR/Finance.",
      },
    });
    expect(successCloseRes.statusCode).toBe(200);
    const closedBody = JSON.parse(successCloseRes.body);
    expect(closedBody.status).toBe("CLOSED");
  });

  it("should record collector overage when remitted cash exceeds collected cash", async () => {
    const createRes = await server.inject({
      method: "POST",
      url: "/api/v1/collections/batches",
      headers: { authorization: `Bearer ${supervisorToken}` },
      payload: {
        collectorId: collector1Id,
        collectionAreaId: area1Id,
        collectionDate: "2026-09-25",
        notes: "Overage Test Batch",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const { data: batch, accounts } = JSON.parse(createRes.body);
    const batchId = batch.id;
    const targetAccount = accounts.find((a: any) => a.serviceAccountId === testSa3Id);
    expect(targetAccount).toBeDefined();

    // Collect 1000
    await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/accounts/${targetAccount.id}/collect`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        amount: "1000.00",
      },
    });

    // Submit
    await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/submit`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    // Remit 1200 (200 overage)
    const remitRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/${batchId}/remit`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        remittedCash: "1200.00",
        remittedNonCash: "0.00",
        notes: "200 pesos excess cash turned in",
      },
    });
    expect(remitRes.statusCode).toBe(201);
    const remitBody = JSON.parse(remitRes.body);
    expect(remitBody.difference).toBe("200.00");
    expect(remitBody.overageAmount).toBe("200.00");
    expect(remitBody.shortageAmount).toBe("0.00");
  });

  it("should enforce RBAC authorization on collection operations", async () => {
    // Technician has no collection permissions -> 403
    const techCreateRes = await server.inject({
      method: "POST",
      url: "/api/v1/collections/batches",
      headers: { authorization: `Bearer ${techToken}` },
      payload: {
        collectorId: collector1Id,
        collectionAreaId: area1Id,
        collectionDate: "2026-09-25",
      },
    });
    expect(techCreateRes.statusCode).toBe(403);

    // Cashier cannot reconcile batches (only collection.reconcile: ADMIN & SUPERVISOR)
    const cashierReconcileRes = await server.inject({
      method: "POST",
      url: `/api/v1/collections/batches/00000000-0000-0000-0000-000000000000/reconcile`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {},
    });
    expect(cashierReconcileRes.statusCode).toBe(403);
  });
});
