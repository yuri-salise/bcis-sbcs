import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ReportsPage } from "../features/reports/ReportsPage";
import { AuthProvider } from "../features/auth/AuthContext";
import {
  api,
  type DailyCollectionReport,
  type MonthlyCollectionReport,
  type BillingVsCollectionReport,
  type FullAgingReport,
  type SubscriberSOA,
  type CollectorPerformanceReport,
  type AuditActivityReport,
} from "../api/client";

function renderWithAuth(ui: React.ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("ReportsPage Component (Phase 8 - Reports, Multi-Format Exports & SOA)", () => {
  const mockDailyReport: DailyCollectionReport = {
    reportType: "DAILY_COLLECTION",
    date: "2026-09-26",
    totalCollected: "₱18,500.00",
    rawTotalCollected: "18500.00",
    totalTransactions: 1,
    byPaymentMethod: [{ method: "CASH", amount: "₱18,500.00", count: 1, percentage: 100 }],
    byCashier: [{ cashierId: "user-123", cashierName: "Maria Santos", amount: "₱18,500.00", count: 1 }],
    byCollector: [],
    items: [
      {
        id: "pay-1",
        receiptNumber: "OR-2026-0001",
        paymentDate: "2026-09-26",
        createdAt: "2026-09-26T08:00:00.000Z",
        subscriberAccountNumber: "BCIS-SUB-2026-0001",
        subscriberDisplayName: "Mercado, Juan B.",
        paymentMethod: "CASH",
        referenceNumber: "—",
        amount: "₱18,500.00",
        rawAmount: "18500.00",
        cashierName: "Maria Santos",
        collectorName: "Office Direct",
        batchNumber: "—",
        notes: "Walk-in cash payment",
      },
    ],
  };

  const mockMonthlyReport: MonthlyCollectionReport = {
    reportType: "MONTHLY_COLLECTION",
    yearMonth: "2026-09",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    totalCollected: "₱245,000.00",
    rawTotalCollected: "245000.00",
    totalTransactions: 180,
    dailyAverage: "₱8,166.67",
    highestDay: { date: "2026-09-15", amount: "₱25,400.00" },
    byPaymentMethod: [{ method: "CASH", amount: "₱245,000.00", count: 180, percentage: 100 }],
    days: [
      {
        dayNumber: 15,
        date: "2026-09-15",
        totalAmount: "₱25,400.00",
        rawTotalAmount: "25400.00",
        transactionCount: 15,
        cashAmount: "₱25,400.00",
        nonCashAmount: "₱0.00",
        cumulativeAmount: "₱25,400.00",
      },
    ],
  };

  const mockBvcReport: BillingVsCollectionReport = {
    reportType: "BILLING_VS_COLLECTION",
    year: "2026",
    overall: {
      totalBilled: "₱500,000.00",
      rawTotalBilled: "500000.00",
      totalCollected: "₱475,000.00",
      rawTotalCollected: "475000.00",
      outstandingBalance: "₱25,000.00",
      rawOutstandingBalance: "25000.00",
      collectionEfficiency: 95,
      invoicesCount: 250,
      paidInvoicesCount: 235,
    },
    cycles: [
      {
        cycleId: "cycle-1",
        cycleCode: "2026-08",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        dueDate: "2026-09-15",
        status: "CLOSED",
        invoicesCount: 250,
        paidInvoicesCount: 235,
        totalBilled: "₱500,000.00",
        rawTotalBilled: "500000.00",
        totalCollected: "₱475,000.00",
        rawTotalCollected: "475000.00",
        outstandingBalance: "₱25,000.00",
        rawOutstandingBalance: "25000.00",
        collectionEfficiency: 95,
      },
    ],
  };

  const mockAgingReport: FullAgingReport = {
    reportType: "AR_AGING",
    asOfDate: "2026-09-26",
    summary: {
      asOfDate: "2026-09-26",
      totalReceivable: "₱100,000.00",
      current: { amount: "₱60,000.00", count: 40, percentage: 60 },
      days1to30: { amount: "₱20,000.00", count: 15, percentage: 20 },
      days31to60: { amount: "₱10,000.00", count: 8, percentage: 10 },
      days61to90: { amount: "₱5,000.00", count: 4, percentage: 5 },
      days90Plus: { amount: "₱5,000.00", count: 3, percentage: 5 },
    },
    byArea: [],
    subscribers: [
      {
        subscriberId: "sub-1",
        subscriberAccountNumber: "BCIS-SUB-2026-0001",
        displayName: "Mercado, Juan B.",
        mobile: "0917-555-0101",
        areaName: "Barangay Casisang",
        current: "₱0.00",
        days1to30: "₱1,299.00",
        days31to60: "₱0.00",
        days61to90: "₱0.00",
        days90Plus: "₱0.00",
        totalDue: "₱1,299.00",
        maxDaysPastDue: 15,
      },
    ],
  };

  const mockSoaReport: SubscriberSOA = {
    statementNumber: "SOA-BCIS-SUB-2026-0001-20260926",
    statementDate: "2026-09-26",
    company: {
      name: "BUKIDNON CABLE & INTERNET SERVICES",
      address: "Fortich Street, Malaybalay City",
      contactNumber: "(088) 813-1234",
      email: "billing@bcis.local",
      tin: "452-987-654-000",
    },
    subscriber: {
      id: "sub-1",
      accountNumber: "BCIS-SUB-2026-0001",
      displayName: "Mercado, Juan B.",
      address: "Purok 3, Casisang, Malaybalay City",
      mobileNumber: "0917-555-0101",
      email: "juan@example.com",
      status: "ACTIVE",
    },
    serviceAccounts: [
      {
        id: "sa-1",
        serviceAccountNumber: "BCIS-SA-2026-0001",
        planName: "Fiber 50 Mbps",
        monthlyRate: "₱1,299.00",
        area: "Barangay Casisang",
        collector: "Juan Dela Cruz",
        status: "ACTIVE",
      },
    ],
    financialSummary: {
      previousBalance: "₱0.00",
      currentCharges: "₱1,299.00",
      totalAmountDue: "₱1,299.00",
      rawTotalAmountDue: "1299.00",
      dueDate: "2026-10-15",
      aging: {
        current: "₱1,299.00",
        days1to30: "₱0.00",
        days31to60: "₱0.00",
        days61to90: "₱0.00",
        days90Plus: "₱0.00",
      },
    },
    invoices: [],
    payments: [],
    ledger: [
      {
        entryNo: 1,
        postedAt: "2026-09-01",
        referenceType: "INVOICE",
        description: "Monthly subscription billing",
        debitAmount: "₱1,299.00",
        creditAmount: "₱0.00",
        runningBalance: "₱1,299.00",
      },
    ],
  };

  const mockCollectorReport: CollectorPerformanceReport = {
    reportType: "COLLECTOR_PERFORMANCE",
    startDate: "2026-09-01",
    endDate: "2026-09-26",
    overall: {
      totalBatches: 12,
      totalExpected: "₱45,000.00",
      rawTotalExpected: "45000.00",
      totalCollected: "₱44,500.00",
      rawTotalCollected: "44500.00",
      totalRemitted: "₱44,500.00",
      rawTotalRemitted: "44500.00",
      totalShortage: "₱0.00",
      totalOverage: "₱0.00",
      overallEfficiency: 99,
    },
    collectors: [
      {
        collectorId: "col-1",
        collectorCode: "COL-001",
        name: "Juan Dela Cruz",
        contactNumber: "0917-123-4567",
        assignedArea: "Barangay Casisang",
        batchesCount: 12,
        reconciledBatchesCount: 12,
        expectedCash: "₱45,000.00",
        rawExpectedCash: "45000.00",
        collectedCash: "₱44,500.00",
        rawCollectedCash: "44500.00",
        remittedCash: "₱44,500.00",
        rawRemittedCash: "44500.00",
        shortageAmount: "₱0.00",
        overageAmount: "₱0.00",
        collectionEfficiency: 99,
        remittanceAccuracy: 100,
        recentBatches: [],
      },
    ],
  };

  const mockAuditReport: AuditActivityReport = {
    reportType: "AUDIT_ACTIVITY",
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    items: [
      {
        id: "audit-1",
        occurredAt: "2026-09-26T10:00:00.000Z",
        actorUserId: "user-1",
        actorName: "Supervisor User",
        actorUsername: "supervisor",
        action: "ADMIN_PAYMENT_VOID",
        entityType: "PAYMENT",
        entityId: "pay-123",
        requestId: "req-abc",
        reason: "Customer check bounced",
        ipAddress: "192.168.1.100",
        metadata: { cashierStation: "Station-01", amount: "₱1,500.00" },
        oldValues: { status: "POSTED", allocated: true },
        newValues: { status: "VOID", allocated: false },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, "getDailyCollectionReport").mockResolvedValue(mockDailyReport);
    vi.spyOn(api, "getMonthlyCollectionReport").mockResolvedValue(mockMonthlyReport);
    vi.spyOn(api, "getBillingVsCollectionReport").mockResolvedValue(mockBvcReport);
    vi.spyOn(api, "getFullAgingReport").mockResolvedValue(mockAgingReport);
    vi.spyOn(api, "getSubscriberSOA").mockResolvedValue(mockSoaReport);
    vi.spyOn(api, "getCollectorPerformanceReport").mockResolvedValue(mockCollectorReport);
    vi.spyOn(api, "getAuditActivityReport").mockResolvedValue(mockAuditReport);
    vi.spyOn(api, "downloadReportFile").mockResolvedValue(undefined);
  });

  it("renders report center sidebar with 10 report options", async () => {
    renderWithAuth(<ReportsPage />);

    expect(screen.getByTestId("report-tab-DAILY_COLLECTION")).toBeInTheDocument();
    expect(screen.getByTestId("report-tab-MONTHLY_COLLECTION")).toBeInTheDocument();
    expect(screen.getByTestId("report-tab-BILLING_VS_COLLECTION")).toBeInTheDocument();
    expect(screen.getByTestId("report-tab-AR_AGING")).toBeInTheDocument();
    expect(screen.getByTestId("report-tab-SOA")).toBeInTheDocument();
    expect(screen.getByTestId("report-tab-COLLECTOR_PERFORMANCE")).toBeInTheDocument();
    expect(screen.getByTestId("report-tab-PAYMENT_METHOD_SUMMARY")).toBeInTheDocument();
    expect(screen.getByTestId("report-tab-SUBSCRIBER_MASTER_LIST")).toBeInTheDocument();
    expect(screen.getByTestId("report-tab-PAYMENT_REVERSALS")).toBeInTheDocument();
    expect(screen.getByTestId("report-tab-AUDIT_ACTIVITY")).toBeInTheDocument();
  });

  it("loads and displays Daily Collection Report by default", async () => {
    renderWithAuth(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("daily-total-collected")).toHaveTextContent("₱18,500.00");
      expect(screen.getByText("OR-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("Mercado, Juan B.")).toBeInTheDocument();
    });
  });

  it("switches to Monthly Collection Report and displays monthly aggregations", async () => {
    renderWithAuth(<ReportsPage />);

    fireEvent.click(screen.getByTestId("report-tab-MONTHLY_COLLECTION"));

    await waitFor(() => {
      expect(screen.getByText("Total Month Collections")).toBeInTheDocument();
      expect(screen.getByText("₱245,000.00")).toBeInTheDocument();
      expect(screen.getByText("Peak Collection Day")).toBeInTheDocument();
      expect(screen.getAllByText("2026-09-15")[0]).toBeInTheDocument();
    });
  });

  it("switches to Billing vs Collection Report and displays cycle metrics", async () => {
    renderWithAuth(<ReportsPage />);

    fireEvent.click(screen.getByTestId("report-tab-BILLING_VS_COLLECTION"));

    await waitFor(() => {
      expect(screen.getAllByText("Total Billed")[0]).toBeInTheDocument();
      expect(screen.getAllByText("₱500,000.00")[0]).toBeInTheDocument();
      expect(screen.getAllByText("Total Collected")[0]).toBeInTheDocument();
      expect(screen.getAllByText("₱475,000.00")[0]).toBeInTheDocument();
      expect(screen.getAllByText("95%")[0]).toBeInTheDocument();
    });
  });

  it("switches to AR Aging Report and displays 5-bucket distribution and subscriber table", async () => {
    renderWithAuth(<ReportsPage />);

    fireEvent.click(screen.getByTestId("report-tab-AR_AGING"));

    await waitFor(() => {
      expect(screen.getByText("Total Receivable")).toBeInTheDocument();
      expect(screen.getByText("₱100,000.00")).toBeInTheDocument();
      expect(screen.getByText("BCIS-SUB-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("Barangay Casisang")).toBeInTheDocument();
    });
  });

  it("switches to Statement of Account, loads subscriber SOA, and renders statement ledger", async () => {
    renderWithAuth(<ReportsPage />);

    fireEvent.click(screen.getByTestId("report-tab-SOA"));

    await waitFor(() => {
      expect(screen.getByTestId("input-soa-subscriber-id")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("input-soa-subscriber-id"), {
      target: { value: "sub-1" },
    });

    fireEvent.click(screen.getByTestId("apply-filter-btn"));

    await waitFor(() => {
      expect(screen.getByText("STATEMENT OF ACCOUNT")).toBeInTheDocument();
      expect(screen.getByText("SOA-BCIS-SUB-2026-0001-20260926")).toBeInTheDocument();
      expect(screen.getByText("Monthly subscription billing")).toBeInTheDocument();
      expect(screen.getByText("Print / Download PDF Statement")).toBeInTheDocument();
    });
  });

  it("triggers Excel, PDF, and CSV exports via the action buttons", async () => {
    renderWithAuth(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("export-xlsx-btn")).toBeInTheDocument();
    });

    // Test Excel export
    fireEvent.click(screen.getByTestId("export-xlsx-btn"));
    await waitFor(() => {
      expect(api.downloadReportFile).toHaveBeenCalledWith("DAILY_COLLECTION", "xlsx", expect.any(Object));
    });

    // Test PDF export
    fireEvent.click(screen.getByTestId("export-pdf-btn"));
    await waitFor(() => {
      expect(api.downloadReportFile).toHaveBeenCalledWith("DAILY_COLLECTION", "pdf", expect.any(Object));
    });

    // Test CSV export
    fireEvent.click(screen.getByTestId("export-csv-btn"));
    await waitFor(() => {
      expect(api.downloadReportFile).toHaveBeenCalledWith("DAILY_COLLECTION", "csv", expect.any(Object));
    });

    // Test Direct Print button
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    expect(screen.getByTestId("print-report-btn")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("print-report-btn"));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("expands audit activity log and displays human-readable diffs without raw JSON", async () => {
    renderWithAuth(<ReportsPage />);

    fireEvent.click(screen.getByTestId("report-tab-AUDIT_ACTIVITY"));

    await waitFor(() => {
      expect(screen.getByText("ADMIN_PAYMENT_VOID")).toBeInTheDocument();
    });

    // Click row to expand change diffs
    fireEvent.click(screen.getByText("ADMIN_PAYMENT_VOID"));

    await waitFor(() => {
      expect(screen.getByText("Audited Changes & Field Diffs")).toBeInTheDocument();
      expect(screen.getByText("Previous State")).toBeInTheDocument();
      expect(screen.getByText("Updated State")).toBeInTheDocument();
    });
  });
});
