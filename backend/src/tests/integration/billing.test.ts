import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildServer } from "../../app/server.js";

describe("Monthly Billing Engine & Invoicing Tests (Phase 3 - AT-11)", () => {
  let server: FastifyInstance;
  let adminToken: string;
  let cashierToken: string;
  let techToken: string;
  let sampleInvoiceId: string;
  let sampleSubscriberId: string;

  beforeAll(async () => {
    server = buildServer();
    await server.ready();

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

    // Reset 2026-09 test cycle to clean OPEN state for test isolation
    const { db } = await import("../../db/db.js");
    const { billingCycles, invoices } = await import("../../db/schema/billing.js");
    const { paymentAllocations } = await import("../../db/schema/payments.js");
    const { eq, inArray } = await import("drizzle-orm");

    const [sept] = await db.select().from(billingCycles).where(eq(billingCycles.cycleCode, "2026-09")).limit(1);
    if (sept) {
      const invs = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.billingCycleId, sept.id));
      if (invs.length > 0) {
        const invIds = invs.map((i) => i.id);
        await db.delete(paymentAllocations).where(inArray(paymentAllocations.invoiceId, invIds));
        await db.delete(invoices).where(eq(invoices.billingCycleId, sept.id));
      }
      await db.update(billingCycles).set({ status: "OPEN" }).where(eq(billingCycles.id, sept.id));
    }
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /api/v1/billing/cycles returns 401 for unauthenticated request", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/billing/cycles",
    });

    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/billing/cycles allows Cashier to view cycles", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/billing/cycles",
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    expect(res.statusCode).toBe(200);
    const cycles = JSON.parse(res.body);
    expect(Array.isArray(cycles)).toBe(true);
    expect(cycles.length).toBeGreaterThanOrEqual(2);

    const sept = cycles.find((c: any) => c.cycleCode === "2026-09");
    expect(sept).toBeDefined();
    expect(sept.status).toBe("OPEN");
  });

  it("POST /api/v1/billing/cycles rejects Cashier (lacks billing.generate)", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/billing/cycles",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        cycleCode: "2026-11",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        billingDate: "2026-11-01",
        dueDate: "2026-11-15",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("POST /api/v1/billing/cycles allows Admin to create a new cycle", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/billing/cycles",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        cycleCode: "2026-10",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
        billingDate: "2026-10-01",
        dueDate: "2026-10-15",
      },
    });

    // 201 Created or 409 if already exists
    expect([201, 409]).toContain(res.statusCode);
  });

  it("GET /api/v1/billing/generate/preview calculates eligible active accounts and projected revenue", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/billing/generate/preview?cycleCode=2026-09",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const preview = JSON.parse(res.body);
    expect(preview.cycle.cycleCode).toBe("2026-09");
    expect(preview.billableCount).toBeGreaterThanOrEqual(1);
    expect(parseFloat(preview.estimatedTotalSum)).toBeGreaterThan(0);
    expect(Array.isArray(preview.billableAccounts)).toBe(true);
  });

  it("POST /api/v1/billing/generate returns 403 Forbidden for Cashier", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/billing/generate",
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { cycleCode: "2026-09" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("POST /api/v1/billing/generate generates invoices, rate snapshots, and ledger debits for active accounts", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/billing/generate",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cycleCode: "2026-09" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.cycleCode).toBe("2026-09");
    expect(body.generatedCount).toBeGreaterThanOrEqual(1);
    expect(parseFloat(body.totalAmount)).toBeGreaterThan(0);
    expect(body.invoices.length).toBeGreaterThanOrEqual(1);

    const firstInvoice = body.invoices[0];
    expect(firstInvoice.invoiceNumber).toMatch(/^BCIS-INV-\d{4}-\d{4}$/);
    expect(firstInvoice.status).toBe("UNPAID");
    expect(parseFloat(firstInvoice.totalAmount)).toBeGreaterThan(0);

    sampleInvoiceId = firstInvoice.id;
  });

  it("AT-11 VERIFICATION: Running billing generation twice for the same cycle creates NO duplicate invoices", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/billing/generate",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cycleCode: "2026-09" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ALREADY_GENERATED");
    expect(body.generatedCount).toBe(0);
    expect(body.invoices.length).toBe(0);
    expect(body.message).toContain("already been invoiced");
  });

  it("GET /api/v1/invoices allows Cashier to view and search invoices", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/invoices?cycleCode=2026-09",
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    const inv = body.data[0];
    expect(inv.billingCycle.cycleCode).toBe("2026-09");
    expect(inv.serviceAccount).toBeDefined();
    expect(inv.subscriber).toBeDefined();
    expect(inv.status).toBe("UNPAID");

    sampleSubscriberId = inv.subscriber.id;
  });

  it("GET /api/v1/invoices/:id returns complete invoice with itemized snapshot charges", async () => {
    const res = await server.inject({
      method: "GET",
      url: `/api/v1/invoices/${sampleInvoiceId}`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    expect(res.statusCode).toBe(200);
    const inv = JSON.parse(res.body);
    expect(inv.id).toBe(sampleInvoiceId);
    expect(inv.items.length).toBeGreaterThanOrEqual(1);

    const line = inv.items[0];
    expect(line.lineType).toBe("SUBSCRIPTION");
    expect(line.unitPrice).toBe(inv.totalAmount);
    expect(line.lineTotal).toBe(inv.totalAmount);
  });

  it("GET /api/v1/subscribers/:id/ledger returns ledger entries with exact computed running balance", async () => {
    const res = await server.inject({
      method: "GET",
      url: `/api/v1/subscribers/${sampleSubscriberId}/ledger`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    expect(res.statusCode).toBe(200);
    const ledger = JSON.parse(res.body);
    expect(ledger.subscriber.id).toBe(sampleSubscriberId);
    expect(ledger.entries.length).toBeGreaterThanOrEqual(1);

    const invoiceEntry = ledger.entries.find((e: any) => e.referenceType === "INVOICE");
    expect(invoiceEntry).toBeDefined();
    expect(parseFloat(invoiceEntry.debitAmount)).toBeGreaterThan(0);
    expect(invoiceEntry.creditAmount).toBe("0.00");
    const entryIdx = ledger.entries.findIndex((e: any) => e.id === invoiceEntry.id);
    const priorBalance = entryIdx > 0 ? parseFloat(ledger.entries[entryIdx - 1].runningBalance) : 0;
    expect(parseFloat(invoiceEntry.runningBalance)).toBeCloseTo(priorBalance + parseFloat(invoiceEntry.debitAmount), 2);
    expect(parseFloat(ledger.currentTotalBalance)).not.toBeNaN();
  });
});
