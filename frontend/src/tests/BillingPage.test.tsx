import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BillingPage } from "../features/billing/BillingPage";
import { AuthProvider } from "../features/auth/AuthContext";
import { api } from "../api/client";

function renderWithAuth(ui: React.ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("BillingPage Component (Phase 3 & AT-11)", () => {
  const mockCycles = [
    {
      id: "cycle-1",
      cycleCode: "2026-09",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      dueDate: "2026-10-15",
      status: "OPEN" as const,
      totalInvoiced: "1299.00",
      invoiceCount: 1,
      generatedAt: "2026-09-01T08:00:00Z",
      generatedBy: "user-123",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T08:00:00Z",
    },
    {
      id: "cycle-2",
      cycleCode: "2026-08",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      dueDate: "2026-09-15",
      status: "CLOSED" as const,
      totalInvoiced: "1299.00",
      invoiceCount: 1,
      generatedAt: "2026-08-01T08:00:00Z",
      generatedBy: "user-123",
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-31T23:59:59Z",
    },
  ];

  const mockInvoices = [
    {
      id: "inv-1",
      invoiceNumber: "BCIS-INV-2026-0001",
      subscriberId: "sub-1",
      serviceAccountId: "sa-1",
      billingCycleId: "cycle-1",
      billingPeriodStart: "2026-09-01",
      billingPeriodEnd: "2026-09-30",
      invoiceDate: "2026-09-01",
      dueDate: "2026-10-15",
      subtotal: "1299.00",
      discountTotal: "0.00",
      penaltyTotal: "0.00",
      adjustmentTotal: "0.00",
      totalAmount: "1299.00",
      amountPaidCache: "0.00",
      balanceDueCache: "1299.00",
      status: "UNPAID" as const,
      createdAt: "2026-09-01T08:00:00Z",
      updatedAt: "2026-09-01T08:00:00Z",
      subscriber: {
        id: "sub-1",
        accountNumber: "BCIS-SUB-2026-0001",
        firstName: "Juan",
        middleName: "B.",
        lastName: "Mercado",
        businessName: null,
      },
      serviceAccount: {
        id: "sa-1",
        serviceAccountNumber: "BCIS-SA-2026-0001",
        servicePlan: {
          id: "plan-1",
          name: "Fiber 50 Mbps",
        },
      },
      servicePlan: {
        id: "plan-1",
        name: "Fiber 50 Mbps",
      },
      items: [
        {
          id: "item-1",
          invoiceId: "inv-1",
          description: "Monthly Subscription - Fiber 50 Mbps",
          itemType: "MONTHLY_FEE",
          amount: "1299.00",
          quantity: 1,
          unitPrice: "1299.00",
          servicePeriodStart: "2026-09-01",
          servicePeriodEnd: "2026-09-30",
          createdAt: "2026-09-01T08:00:00Z",
        },
      ],
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    api.setToken("mock-token-abc");

    vi.spyOn(api, "listBillingCycles").mockResolvedValue(mockCycles);
    vi.spyOn(api, "listInvoices").mockResolvedValue({
      data: mockInvoices,
      pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
    });
    vi.spyOn(api, "getInvoiceById").mockResolvedValue(mockInvoices[0]);
    vi.spyOn(api, "previewBillingGeneration").mockResolvedValue({
      cycle: mockCycles[0],
      totalActiveAccounts: 3,
      alreadyBilledCount: 0,
      billableCount: 3,
      estimatedTotalSum: "3897.00",
      billableAccounts: [
        {
          serviceAccountId: "sa-1",
          serviceAccountNumber: "BCIS-SA-2026-0001",
          subscriberName: "Mercado, Juan B.",
          planName: "Fiber 50 Mbps",
          serviceType: "Fiber Internet",
          monthlyRate: "1299.00",
        },
      ],
    });
    vi.spyOn(api, "generateMonthlyBilling").mockResolvedValue({
      cycleCode: "2026-09",
      status: "COMPLETED",
      message: "Billing generation completed. 3 invoices generated.",
      generatedCount: 3,
      skippedCount: 0,
      totalAmount: "3897.00",
      invoices: mockInvoices,
    });
    vi.spyOn(api, "getSubscriberLedger").mockResolvedValue({
      subscriber: {
        id: "sub-1",
        accountNumber: "BCIS-SUB-2026-0001",
        firstName: "Juan",
        lastName: "Mercado",
        primaryContactNumber: "0917-555-0101",
        status: "ACTIVE",
        createdAt: "2026-01-15T00:00:00Z",
        updatedAt: "2026-01-15T00:00:00Z",
      },
      serviceAccounts: [],
      currentTotalBalance: "1299.00",
      entries: [
        {
          id: "entry-1",
          serviceAccountId: "sa-1",
          serviceAccountNumber: "BCIS-SA-2026-0001",
          entryNo: 1,
          postedAt: "2026-09-01T08:00:00Z",
          entryDate: "2026-09-01",
          referenceType: "INVOICE",
          referenceId: "inv-1",
          description: "Monthly Billing - Cycle 2026-09",
          debitAmount: "1299.00",
          creditAmount: "0.00",
          currency: "PHP",
          runningBalance: "1299.00",
          createdAt: "2026-09-01T08:00:00Z",
        },
      ],
    });
  });

  it("renders billing cycles ribbon and invoices table", async () => {
    renderWithAuth(<BillingPage />);

    expect(screen.getByText("Monthly Billing & Invoicing")).toBeInTheDocument();

    await waitFor(() => {
      // Cycles ribbon
      expect(screen.getAllByText("2026-09").length).toBeGreaterThan(0);
      expect(screen.getByText("2026-08")).toBeInTheDocument();

      // Invoices table
      expect(screen.getByText("BCIS-INV-2026-0001")).toBeInTheDocument();
      expect(screen.getByText(/Mercado, Juan/i)).toBeInTheDocument();
      expect(screen.getByText(/Fiber 50 Mbps/i)).toBeInTheDocument();
      expect(screen.getAllByText("₱1,299.00").length).toBeGreaterThan(0);
      expect(screen.getByText("UNPAID")).toBeInTheDocument();
    });
  });

  it("opens Billing Generation Wizard with preview metrics and AT-11 guardrail", async () => {
    renderWithAuth(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /generate monthly billing/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /generate monthly billing/i }));

    await waitFor(() => {
      expect(screen.getByText("Monthly Billing Generation Engine")).toBeInTheDocument();
      expect(screen.getByText("To Bill Now")).toBeInTheDocument();
      expect(screen.getByText("₱3,897.00")).toBeInTheDocument();
    });

    // Execute generation
    const confirmBtn = screen.getByRole("button", { name: /execute billing \(3 accounts\)/i });
    expect(confirmBtn).toBeInTheDocument();
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.generateMonthlyBilling).toHaveBeenCalledWith("2026-09");
      expect(screen.getByText("Generation Completed")).toBeInTheDocument();
      expect(screen.getByText("Billing generation completed. 3 invoices generated.")).toBeInTheDocument();
    });
  });

  it("opens printable billing statement modal", async () => {
    renderWithAuth(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText("BCIS-INV-2026-0001")).toBeInTheDocument();
    });

    const statementBtn = screen.getByRole("button", { name: /view invoice statement/i });
    fireEvent.click(statementBtn);

    await waitFor(() => {
      expect(screen.getByText("BUKIDNON CABLE & INTERNET SERVICES")).toBeInTheDocument();
      expect(screen.getByText("Monthly Subscription - Fiber 50 Mbps")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
    });
  });

  it("opens subscriber financial ledger modal with running balances", async () => {
    renderWithAuth(<BillingPage />);

    await waitFor(() => {
      expect(screen.getByText("BCIS-INV-2026-0001")).toBeInTheDocument();
    });

    const ledgerBtn = screen.getByRole("button", { name: /view subscriber ledger/i });
    fireEvent.click(ledgerBtn);

    await waitFor(() => {
      expect(screen.getByText("Subscriber Financial Ledger")).toBeInTheDocument();
      expect(screen.getByText(/Account #BCIS-SUB-2026-0001/i)).toBeInTheDocument();
      expect(screen.getByText("Monthly Billing - Cycle 2026-09")).toBeInTheDocument();
      expect(screen.getAllByText("₱1,299.00").length).toBeGreaterThan(0);
    });
  });
});
