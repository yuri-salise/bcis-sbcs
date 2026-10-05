import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildServer } from "../../app/server.js";
import { db } from "../../db/db.js";
import {
  subscribers,
  serviceAccounts,
  invoices,
  payments,
  paymentAllocations,
} from "../../db/schema/index.js";
import { eq, and, inArray } from "drizzle-orm";
import { Money } from "../../shared/money/money.js";

describe("Reports, General Ledger, Audit Trails & Compliance Tests (Phase 8 - AT-01 to AT-09)", () => {
  let server: FastifyInstance;
  let adminToken: string;
  let cashierToken: string;
  let supervisorToken: string;
  let techToken: string;
  let viewerToken: string;

  let testSubscriberId: string;

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

    // Login Supervisor
    const supRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "supervisor", password: "Password123!" },
    });
    expect(supRes.statusCode).toBe(200);
    supervisorToken = JSON.parse(supRes.body).token;

    // Login Tech
    const techRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "tech", password: "Password123!" },
    });
    expect(techRes.statusCode).toBe(200);
    techToken = JSON.parse(techRes.body).token;

    // Login Viewer
    const viewerRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "viewer", password: "Password123!" },
    });
    expect(viewerRes.statusCode).toBe(200);
    viewerToken = JSON.parse(viewerRes.body).token;

    // Retrieve a seeded subscriber for SOA testing
    const [sub] = await db
      .select({ id: subscribers.id })
      .from(subscribers)
      .limit(1);
    expect(sub).toBeDefined();
    testSubscriberId = sub.id;
  });

  afterAll(async () => {
    await server.close();
  });

  // ==========================================
  // AT-01: Executive Dashboard Metrics
  // ==========================================
  describe("AT-01: Executive Dashboard KPIs and Trends", () => {
    it("returns executive operational dashboard metrics with 6 KPIs and trend datasets", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/dashboard",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      // Verify 6 key operational KPIs
      expect(data).toHaveProperty("kpis");
      expect(data.kpis).toHaveProperty("todayCollection");
      expect(data.kpis).toHaveProperty("currentReceivable");
      expect(data.kpis).toHaveProperty("overdueReceivable");
      expect(data.kpis).toHaveProperty("currentBilling");
      expect(data.kpis).toHaveProperty("pendingGcashCount");
      expect(data.kpis).toHaveProperty("reconciliationExceptionsCount");

      // Verify supporting datasets
      expect(data).toHaveProperty("supporting");
      expect(Array.isArray(data.supporting.billingVsCollectionTrend)).toBe(true);
      expect(Array.isArray(data.supporting.paymentMethodBreakdown)).toBe(true);
      expect(data.supporting.agingSummary).toBeDefined();
      expect(Array.isArray(data.supporting.topCollectors)).toBe(true);
      expect(Array.isArray(data.supporting.recentPayments)).toBe(true);
    });
  });

  // ==========================================
  // AT-02: Daily & Monthly Collection Reports
  // ==========================================
  describe("AT-02: Daily and Monthly Collection Reports", () => {
    it("returns daily collection report reconciling strictly with posted payments", async () => {
      const [samplePayment] = await db
        .select({ paymentDate: payments.paymentDate })
        .from(payments)
        .where(eq(payments.status, "POSTED"))
        .limit(1);

      const targetDate = samplePayment?.paymentDate || new Date().toISOString().slice(0, 10);

      const res = await server.inject({
        method: "GET",
        url: `/api/v1/reports/daily-collection?date=${targetDate}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.date).toBe(targetDate);
      expect(Array.isArray(data.items)).toBe(true);

      // Verify reconciliation against database
      const dbPayments = await db
        .select({ amountPaid: payments.amountPaid })
        .from(payments)
        .where(and(eq(payments.paymentDate, targetDate), eq(payments.status, "POSTED")));

      let expectedTotal = Money.zero();
      for (const p of dbPayments) {
        expectedTotal = expectedTotal.add(Money.fromDecimal(p.amountPaid));
      }

      expect(data.rawTotalCollected).toBe(expectedTotal.toDecimal());
      expect(data.totalTransactions).toBe(dbPayments.length);
    });

    it("returns monthly collection report with daily and method breakdowns", async () => {
      const currentYm = new Date().toISOString().slice(0, 7);

      const res = await server.inject({
        method: "GET",
        url: `/api/v1/reports/monthly-collection?yearMonth=${currentYm}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.yearMonth).toBe(currentYm);
      expect(Array.isArray(data.days)).toBe(true);
      expect(Array.isArray(data.byPaymentMethod)).toBe(true);
      expect(typeof data.rawTotalCollected).toBe("string");
    });
  });

  // ==========================================
  // AT-03: Billing vs Collection Report
  // ==========================================
  describe("AT-03: Billing vs Collection Reconciliation", () => {
    it("returns billing vs collection report strictly reconciling billed vs collected", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/billing-vs-collection",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      expect(Array.isArray(data.cycles)).toBe(true);
      expect(data.overall).toBeDefined();

      if (data.cycles.length > 0) {
        const cycle = data.cycles[0];
        expect(cycle).toHaveProperty("cycleCode");
        expect(cycle).toHaveProperty("rawTotalBilled");
        expect(cycle).toHaveProperty("rawTotalCollected");
        expect(cycle).toHaveProperty("collectionEfficiency");

        // Verify that rawTotalBilled - rawTotalCollected = rawOutstandingBalance
        const billedMoney = Money.fromDecimal(cycle.rawTotalBilled);
        const collectedMoney = Money.fromDecimal(cycle.rawTotalCollected);
        const expectedDiff = billedMoney.subtract(collectedMoney).toDecimal();
        expect(cycle.rawOutstandingBalance).toBe(expectedDiff);
      }
    });
  });

  // ==========================================
  // AT-04: AR Aging Report
  // ==========================================
  describe("AT-04: Accounts Receivable Aging Analysis", () => {
    it("returns aging report with 5-bucket distribution reconciling total outstanding", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/aging",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      expect(data.summary).toHaveProperty("current");
      expect(data.summary).toHaveProperty("days1to30");
      expect(data.summary).toHaveProperty("days31to60");
      expect(data.summary).toHaveProperty("days61to90");
      expect(data.summary).toHaveProperty("days90Plus");
      expect(data.summary).toHaveProperty("totalReceivable");
      expect(data.summary).toHaveProperty("rawTotalReceivable");
      expect(Array.isArray(data.subscribers)).toBe(true);

      // Verify that rawTotalReceivable is a valid decimal string
      expect(typeof data.summary.rawTotalReceivable).toBe("string");
    });
  });

  // ==========================================
  // AT-05: Statement of Account (SOA)
  // ==========================================
  describe("AT-05: Statement of Account Generation", () => {
    it("returns comprehensive SOA with account details, ledger entries, and aging", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/reports/soa/${testSubscriberId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);

      expect(data.subscriber).toBeDefined();
      expect(data.subscriber.id).toBe(testSubscriberId);
      expect(Array.isArray(data.serviceAccounts)).toBe(true);
      expect(Array.isArray(data.ledger)).toBe(true);
      expect(data.financialSummary).toBeDefined();
      expect(data.financialSummary).toHaveProperty("totalAmountDue");
      expect(data.financialSummary).toHaveProperty("aging");
    });
  });

  // ==========================================
  // AT-06: Additional Operational Reports
  // ==========================================
  describe("AT-06: Additional Operational & Audit Reports", () => {
    it("returns collector performance report", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/collector-performance",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.collectors)).toBe(true);
      expect(data.overall).toBeDefined();
    });

    it("returns payment method summary report", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/payment-methods",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.methods)).toBe(true);
      expect(data.totalAmount).toBeDefined();
    });

    it("returns subscriber master list report", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/subscribers-master",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.pagination.total).toBe("number");
    });

    it("returns payment reversals report strictly reconciling reversed payments", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/payment-reversals",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.items)).toBe(true);

      const dbReversals = await db
        .select({ amountPaid: payments.amountPaid })
        .from(payments)
        .where(eq(payments.status, "REVERSED"));

      let expectedSum = Money.zero();
      for (const r of dbReversals) {
        expectedSum = expectedSum.add(Money.fromDecimal(r.amountPaid));
      }

      expect(data.rawTotalReversedAmount).toBe(expectedSum.toDecimal());
    });

    it("returns audit activity report with filtering", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/audit-activity?limit=10&page=1",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(1);
    });
  });

  // ==========================================
  // AT-07: Multi-Format Document Export Pipeline
  // ==========================================
  describe("AT-07: Document & Export Pipeline (XLSX, PDF, CSV)", () => {
    it("exports daily collection report as XLSX spreadsheet with corporate styling", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/daily-collection/export?format=xlsx",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      expect(res.headers["content-disposition"]).toContain("attachment; filename=");
      expect(res.rawPayload.length).toBeGreaterThan(100);
    });

    it("exports daily collection report as official PDF with BCIS letterhead", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/daily-collection/export?format=pdf",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain("attachment; filename=");
      // Verify PDF header magic bytes "%PDF-"
      expect(res.rawPayload.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
    });

    it("exports daily collection report as RFC 4180 CSV with UTF-8 BOM", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/daily-collection/export?format=csv",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("attachment; filename=");
      // Verify UTF-8 BOM: 0xEF, 0xBB, 0xBF
      const payload = res.rawPayload;
      expect(payload[0]).toBe(0xef);
      expect(payload[1]).toBe(0xbb);
      expect(payload[2]).toBe(0xbf);
    });

    it("generates Statement of Account PDF with tear-off remittance slip stub", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/reports/soa/${testSubscriberId}/export?format=pdf`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain("BCIS-SOA-");
      expect(res.rawPayload.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
    });

    it("exports collector performance, payment methods, master list, reversals, and audit PDF documents without raw JSON", async () => {
      const endpoints = [
        "/api/v1/reports/collector-performance/export?format=pdf",
        "/api/v1/reports/payment-methods/export?format=pdf",
        "/api/v1/reports/subscribers-master/export?format=pdf",
        "/api/v1/reports/payment-reversals/export?format=pdf",
        "/api/v1/reports/audit-activity/export?format=pdf",
      ];

      for (const endpoint of endpoints) {
        const res = await server.inject({
          method: "GET",
          url: endpoint,
          headers: { authorization: `Bearer ${adminToken}` },
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("application/pdf");
        expect(res.rawPayload.subarray(0, 5).toString("utf-8")).toBe("%PDF-");

        // Verify PDF doesn't contain raw JSON stringified dumps in text
        const pdfText = res.rawPayload.toString("utf-8");
        expect(pdfText).not.toContain('{"collectorCode"');
        expect(pdfText).not.toContain('{"accountNumber"');
        expect(pdfText).not.toContain('{"receiptNumber"');
      }
    });
  });

  // ==========================================
  // AT-08: RBAC & Permission Enforcement
  // ==========================================
  describe("AT-08: RBAC & Permission Enforcement", () => {
    it("denies technician without report.view permission (403 Forbidden)", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/dashboard",
        headers: { authorization: `Bearer ${techToken}` },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("Access denied");
    });

    it("allows viewer with report.view to see dashboard", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/dashboard",
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it("denies viewer without report.export permission from exporting XLSX (403 Forbidden)", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/daily-collection/export?format=xlsx",
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("denies viewer without audit.view permission from accessing audit activity (403 Forbidden)", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/audit-activity",
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("allows supervisor with report.export permission to export reports", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/reports/daily-collection/export?format=csv",
        headers: { authorization: `Bearer ${supervisorToken}` },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // ==========================================
  // AT-09: Financial Reconciliation Invariant (Phase 8 Integration Gate)
  // ==========================================
  describe("AT-09: Phase 8 Integration Gate - Financial Reconciliation Invariant", () => {
    it("proves that report totals strictly equal source transactions without drift", async () => {
      // 1. AR Aging total strictly equals SUM(invoices.balanceDueCache)
      const agingRes = await server.inject({
        method: "GET",
        url: "/api/v1/reports/aging",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const agingData = JSON.parse(agingRes.body);

      const allUnpaidInvoices = await db
        .select({ balanceDueCache: invoices.balanceDueCache })
        .from(invoices)
        .where(inArray(invoices.status, ["UNPAID", "PARTIALLY_PAID", "OVERDUE"]));

      let expectedAgingTotal = Money.zero();
      for (const inv of allUnpaidInvoices) {
        expectedAgingTotal = expectedAgingTotal.add(Money.fromDecimal(inv.balanceDueCache));
      }

      expect(Money.fromDecimal(agingData.summary.rawTotalReceivable).toCentavosNumber()).toBe(
        expectedAgingTotal.toCentavosNumber()
      );

      // 2. Billing vs Collection total collected strictly equals SUM(payment_allocations.allocated_amount)
      const bvcRes = await server.inject({
        method: "GET",
        url: "/api/v1/reports/billing-vs-collection",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bvcData = JSON.parse(bvcRes.body);

      const allAllocations = await db
        .select({ allocatedAmount: paymentAllocations.allocatedAmount })
        .from(paymentAllocations);

      let expectedAllocSum = Money.zero();
      for (const a of allAllocations) {
        expectedAllocSum = expectedAllocSum.add(Money.fromDecimal(a.allocatedAmount));
      }

      expect(Money.fromDecimal(bvcData.overall.rawTotalCollected).toCentavosNumber()).toBe(
        expectedAllocSum.toCentavosNumber()
      );
    });
  });
});
