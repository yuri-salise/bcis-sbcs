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
  paymentProofs,
  ledgerEntries,
} from "../../db/schema/index.js";
import { eq, or, inArray } from "drizzle-orm";
import { getNextDocumentNumber } from "../../db/sequences.js";

async function cleanGcashTestEntities() {
  const existingTestSubs = await db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(
      or(
        eq(subscribers.accountNumber, "BCIS-SUB-TEST-GCASH-01"),
        eq(subscribers.accountNumber, "BCIS-SUB-TEST-GCASH-02")
      )
    );

  for (const sub of existingTestSubs) {
    const sas = await db
      .select({ id: serviceAccounts.id })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.subscriberId, sub.id));
    const saIds = sas.map((s) => s.id);

    await db.delete(paymentProofs).where(eq(paymentProofs.subscriberId, sub.id));

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

describe("GCash Verification Tests (Phase 5 - AT-05)", () => {
  let server: FastifyInstance;
  let adminToken: string;
  let cashierToken: string;
  let techToken: string;

  let testSubId: string;
  let testSaId: string;
  let testInvoiceId: string;
  let testCycleId: string;

  // Tiny 1x1 transparent PNG image base64
  const samplePngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  beforeAll(async () => {
    server = buildServer();
    await server.ready();

    await cleanGcashTestEntities();

    // 1. Authenticate users
    const adminRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin", password: "Password123!" },
    });
    expect(adminRes.statusCode).toBe(200);
    adminToken = JSON.parse(adminRes.body).token;

    const cashierRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "cashier", password: "Password123!" },
    });
    expect(cashierRes.statusCode).toBe(200);
    cashierToken = JSON.parse(cashierRes.body).token;

    const techRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "tech", password: "Password123!" },
    });
    expect(techRes.statusCode).toBe(200);
    techToken = JSON.parse(techRes.body).token;

    // 2. Set up test subscriber and account
    const [sub] = await db
      .insert(subscribers)
      .values({
        accountNumber: "BCIS-SUB-TEST-GCASH-01",
        firstName: "GCash",
        lastName: "Payer",
        primaryContactNumber: "09170009999",
        status: "ACTIVE",
      })
      .returning();
    testSubId = sub.id;

    const [addr] = await db
      .insert(subscriberAddresses)
      .values({
        subscriberId: testSubId,
        line1: "Purok 1, Sayre Highway",
        barangay: "Casisang",
        cityMunicipality: "Malaybalay City",
        province: "Bukidnon",
      })
      .returning();

    const [plan] = await db
      .select()
      .from(servicePlans)
      .where(eq(servicePlans.isActive, true))
      .limit(1);

    const [st] = await db.select().from(serviceTypes).limit(1);

    const [sa] = await db
      .insert(serviceAccounts)
      .values({
        subscriberId: testSubId,
        serviceAccountNumber: "SA-GCASH-TEST-001",
        serviceTypeId: st.id,
        servicePlanId: plan.id,
        installationAddressId: addr.id,
        activationDate: "2026-08-01",
        billingStartDate: "2026-08-01",
        billingDay: 1,
        dueDay: 15,
        currentRate: "1200.00",
        cachedBalanceDue: "1200.00",
        status: "ACTIVE",
      })
      .returning();
    testSaId = sa.id;

    // Create billing cycle & invoice
    const [cycle] = await db
      .insert(billingCycles)
      .values({
        cycleCode: "2026-09-GCASH-TEST",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        billingDate: "2026-09-01",
        dueDate: "2026-10-15",
        status: "OPEN",
      })
      .returning();
    testCycleId = cycle.id;

    const invNum = await getNextDocumentNumber("BCIS-INV");
    const [inv] = await db
      .insert(invoices)
      .values({
        invoiceNumber: invNum,
        billingCycleId: testCycleId,
        serviceAccountId: testSaId,
        invoiceDate: "2026-09-01",
        dueDate: "2026-10-15",
        subtotal: "1200.00",
        totalAmount: "1200.00",
        amountPaidCache: "0.00",
        balanceDueCache: "1200.00",
        status: "UNPAID",
      })
      .returning();
    testInvoiceId = inv.id;

    await db.insert(invoiceItems).values({
      invoiceId: testInvoiceId,
      lineType: "SUBSCRIPTION",
      description: "Fiber Plan Monthly Subscription",
      quantity: 1,
      unitPrice: "1200.00",
      lineTotal: "1200.00",
    });
  });

  afterAll(async () => {
    await cleanGcashTestEntities();
    if (testCycleId) {
      await db.delete(billingCycles).where(eq(billingCycles.id, testCycleId));
    }
    await server.close();
  });

  it("submits a valid GCash proof and creates a PENDING queue record", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/gcash/submit",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: testSubId,
        serviceAccountId: testSaId,
        referenceNumber: "GCASH-REF-TEST-0001",
        senderName: "Juan Dela Cruz",
        senderMobile: "09171234567",
        amount: "1200.00",
        transactionDate: "2026-09-10",
        notes: "Uploaded at front counter",
        originalFilename: "gcash_screenshot.png",
        mimeType: "image/png",
        fileBase64: samplePngBase64,
      },
    });

    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.body);
    expect(data.proof).toBeDefined();
    expect(data.proof.verificationStatus).toBe("PENDING");
    expect(data.proof.referenceNumber).toBe("GCASH-REF-TEST-0001");
    expect(data.proof.amount).toBe("1200.00");
    expect(data.proof.sha256).toBeDefined();
    expect(data.proof.storageKey).toMatch(/^proof-/);
    expect(data.isFlagged).toBe(false);
  });

  it("validates file type and rejects unsupported attachments", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/gcash/submit",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: testSubId,
        referenceNumber: "GCASH-REF-MALICIOUS",
        amount: "1200.00",
        transactionDate: "2026-09-10",
        originalFilename: "payload.exe",
        mimeType: "application/x-msdownload",
        fileBase64: samplePngBase64,
      },
    });

    expect(res.statusCode).toBe(500);
    const data = JSON.parse(res.body);
    expect(data.message).toContain("Allowed types: JPEG, PNG, WebP, PDF");
  });

  it("retrieves the verification queue with search, pagination, and proof details", async () => {
    const queueRes = await server.inject({
      method: "GET",
      url: "/api/v1/gcash/verification-queue?search=GCASH-REF-TEST-0001",
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    expect(queueRes.statusCode).toBe(200);
    const queueData = JSON.parse(queueRes.body);
    expect(queueData.items.length).toBeGreaterThanOrEqual(1);

    const item = queueData.items[0];
    expect(item.referenceNumber).toBe("GCASH-REF-TEST-0001");
    expect(item.subscriberDisplayName).toBe("GCash Payer");
    expect(item.verificationStatus).toBe("PENDING");
    expect(item.duplicateDetected).toBe(false);

    // Get Single Proof
    const detailRes = await server.inject({
      method: "GET",
      url: `/api/v1/gcash/proofs/${item.id}`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.body);
    expect(detail.id).toBe(item.id);
    expect(detail.duplicateDetection.isDuplicate).toBe(false);

    // Stream File
    const fileRes = await server.inject({
      method: "GET",
      url: `/api/v1/gcash/proofs/${item.id}/file`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(fileRes.statusCode).toBe(200);
    expect(fileRes.headers["content-type"]).toBe("image/png");
  });

  it("verifies the GCash proof, mints official receipt, and allocates oldest-first", async () => {
    // 1. Fetch pending proof
    const queueRes = await server.inject({
      method: "GET",
      url: "/api/v1/gcash/verification-queue?search=GCASH-REF-TEST-0001",
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    const item = JSON.parse(queueRes.body).items[0];

    // 2. Cashier verifies the proof
    const verifyRes = await server.inject({
      method: "POST",
      url: `/api/v1/gcash/proofs/${item.id}/verify`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        notes: "Approved after verifying bank text alert",
      },
    });

    expect(verifyRes.statusCode).toBe(200);
    const verifyData = JSON.parse(verifyRes.body);
    expect(verifyData.receiptNumber).toMatch(/^BCIS-REC-\d{4}-\d{4}$/);
    expect(verifyData.payment.paymentMethod).toBe("GCASH");
    expect(verifyData.payment.referenceNumber).toBe("GCASH-REF-TEST-0001");
    expect(verifyData.proof.verificationStatus).toBe("VERIFIED");
    expect(verifyData.allocations.length).toBe(1);
    expect(verifyData.allocations[0].invoiceId).toBe(testInvoiceId);
    expect(verifyData.allocations[0].remainingBalance).toBe("0.00");

    // 3. Verify invoice is marked PAID in database
    const [updatedInv] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, testInvoiceId));
    expect(updatedInv.status).toBe("PAID");
    expect(updatedInv.balanceDueCache).toBe("0.00");
    expect(updatedInv.amountPaidCache).toBe("1200.00");

    // 4. Verify subscriber ledger has credit
    const [ledger] = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.serviceAccountId, testSaId));
    expect(ledger).toBeDefined();
    expect(ledger.creditAmount).toBe("1200.00");
    expect(ledger.referenceType).toBe("PAYMENT");
  });

  it("enforces AT-05: prevents double-posting when a duplicate GCash reference is submitted and verified", async () => {
    // 1. Submit a second proof with the SAME reference number that was already verified and posted
    const submitRes = await server.inject({
      method: "POST",
      url: "/api/v1/gcash/submit",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: testSubId,
        serviceAccountId: testSaId,
        referenceNumber: "GCASH-REF-TEST-0001", // DUPLICATE REFERENCE!
        senderName: "Imposter or Re-uploader",
        amount: "1200.00",
        transactionDate: "2026-09-10",
        notes: "Trying to submit duplicate proof",
        originalFilename: "dup_screenshot.png",
        mimeType: "image/png",
        fileBase64: samplePngBase64,
      },
    });

    expect(submitRes.statusCode).toBe(201);
    const submitData = JSON.parse(submitRes.body);
    expect(submitData.isFlagged).toBe(true);
    expect(submitData.proof.verificationStatus).toBe("FLAGGED");
    expect(submitData.duplicateWarning).toContain("already posted under Receipt");

    const duplicateProofId = submitData.proof.id;

    // 2. Check the verification queue: duplicate warning must be prominent
    const queueRes = await server.inject({
      method: "GET",
      url: `/api/v1/gcash/proofs/${duplicateProofId}`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(queueRes.statusCode).toBe(200);
    const detailData = JSON.parse(queueRes.body);
    expect(detailData.duplicateDetection.isDuplicate).toBe(true);
    expect(detailData.duplicateDetection.duplicateWarning).toContain("matches existing posted Receipt");
    expect(detailData.duplicateDetection.matchedPayment).toBeDefined();

    // 3. Attempting to verify this duplicate proof MUST FAIL with 409 Conflict (AT-05)
    const verifyRes = await server.inject({
      method: "POST",
      url: `/api/v1/gcash/proofs/${duplicateProofId}/verify`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {},
    });

    expect(verifyRes.statusCode).toBe(409);
    const verifyErr = JSON.parse(verifyRes.body);
    expect(verifyErr.message).toContain("Double-posting is strictly prohibited (AT-05)");

    // 4. Verify proof status is NOT VERIFIED
    const [dupProof] = await db
      .select()
      .from(paymentProofs)
      .where(eq(paymentProofs.id, duplicateProofId));
    expect(dupProof.verificationStatus).not.toBe("VERIFIED");
    expect(dupProof.paymentId).toBeNull();
  });

  it("handles rejection workflow: preserves evidence and records rejection reason without altering financials", async () => {
    // 1. Submit another proof destined for rejection
    const submitRes = await server.inject({
      method: "POST",
      url: "/api/v1/gcash/submit",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: testSubId,
        serviceAccountId: testSaId,
        referenceNumber: "GCASH-REF-REJECT-01",
        senderName: "Blurry Sender",
        amount: "500.00",
        transactionDate: "2026-09-12",
        originalFilename: "blurry_receipt.png",
        mimeType: "image/png",
        fileBase64: samplePngBase64,
      },
    });
    expect(submitRes.statusCode).toBe(201);
    const proofId = JSON.parse(submitRes.body).proof.id;

    // 2. Reject without reason -> validation error
    const rejectInvalid = await server.inject({
      method: "POST",
      url: `/api/v1/gcash/proofs/${proofId}/reject`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { reason: "bad" }, // < 5 chars
    });
    expect(rejectInvalid.statusCode).toBe(422);

    // 3. Reject with valid operational reason
    const rejectRes = await server.inject({
      method: "POST",
      url: `/api/v1/gcash/proofs/${proofId}/reject`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { reason: "Screenshot is unreadable and amount does not match statement" },
    });
    expect(rejectRes.statusCode).toBe(200);
    const rejectData = JSON.parse(rejectRes.body);
    expect(rejectData.proof.verificationStatus).toBe("REJECTED");
    expect(rejectData.proof.rejectionReason).toBe("Screenshot is unreadable and amount does not match statement");

    // 4. Proof remains stored on disk and in database
    const fileRes = await server.inject({
      method: "GET",
      url: `/api/v1/gcash/proofs/${proofId}/file`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(fileRes.statusCode).toBe(200);

    // Cannot verify a rejected proof
    const verifyRejected = await server.inject({
      method: "POST",
      url: `/api/v1/gcash/proofs/${proofId}/verify`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {},
    });
    expect(verifyRejected.statusCode).toBe(500);
    expect(JSON.parse(verifyRejected.body).message).toContain("was previously rejected");
  });

  it("enforces RBAC: denies verify and reject to users without gcash.verify permission", async () => {
    // Submit a proof
    const submitRes = await server.inject({
      method: "POST",
      url: "/api/v1/gcash/submit",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        subscriberId: testSubId,
        referenceNumber: "GCASH-REF-RBAC-01",
        amount: "100.00",
        transactionDate: "2026-09-15",
        originalFilename: "proof.png",
        mimeType: "image/png",
        fileBase64: samplePngBase64,
      },
    });
    const proofId = JSON.parse(submitRes.body).proof.id;

    // Tech user lacks gcash.verify
    const techVerify = await server.inject({
      method: "POST",
      url: `/api/v1/gcash/proofs/${proofId}/verify`,
      headers: { authorization: `Bearer ${techToken}` },
      payload: {},
    });
    expect(techVerify.statusCode).toBe(403);

    const techReject = await server.inject({
      method: "POST",
      url: `/api/v1/gcash/proofs/${proofId}/reject`,
      headers: { authorization: `Bearer ${techToken}` },
      payload: { reason: "Unauthorized attempt" },
    });
    expect(techReject.statusCode).toBe(403);
  });
});
