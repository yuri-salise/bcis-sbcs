import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ReceivablesPage } from "../features/receivables/ReceivablesPage";
import { AuthProvider } from "../features/auth/AuthContext";
import { api } from "../api/client";

function renderWithAuth(ui: React.ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("ReceivablesPage Component (Phase 7 - Receivables, Aging, Suspension & Reconnection)", () => {
  const mockAgingReport = {
    asOfDate: "2026-09-25",
    summary: {
      current: { amount: "₱5,000.00", count: 4, percentage: 50 },
      days1to30: { amount: "₱2,500.00", count: 2, percentage: 25 },
      days31to60: { amount: "₱1,500.00", count: 1, percentage: 15 },
      days61to90: { amount: "₱1,000.00", count: 1, percentage: 10 },
      days90Plus: { amount: "₱0.00", count: 0, percentage: 0 },
      totalReceivable: "₱10,000.00",
    },
    subscribers: [
      {
        subscriberId: "sub-1",
        subscriberAccountNumber: "BCIS-SUB-2026-0001",
        displayName: "Mercado, Juan B.",
        currentAmount: "₱0.00",
        days1to30Amount: "₱0.00",
        days31to60Amount: "₱1,500.00",
        days61to90Amount: "₱0.00",
        days90PlusAmount: "₱0.00",
        totalDue: "₱1,500.00",
        maxDaysOverdue: 40,
        hasSuspendedService: false,
      },
    ],
  };

  const mockOverdueResponse = {
    asOfDate: "2026-09-25",
    gracePeriodDays: 5,
    totalOverdue: "₱1,500.00",
    data: [
      {
        invoiceId: "inv-101",
        invoiceNumber: "BCIS-INV-2026-0001",
        subscriberId: "sub-1",
        subscriberAccountNumber: "BCIS-SUB-2026-0001",
        subscriberDisplayName: "Mercado, Juan B.",
        serviceAccountId: "sa-1",
        serviceAccountNumber: "BCIS-SA-2026-0001",
        servicePlanName: "Fiber 50 Mbps",
        dueDate: "2026-08-15",
        daysPastDueDate: 41,
        daysOverdue: 36,
        balanceDue: "₱1,500.00",
        totalAmount: "₱1,500.00",
        status: "OVERDUE",
        collectionAreaName: "Barangay Casisang",
      },
    ],
    pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
  };

  const mockCandidatesResponse = {
    asOfDate: "2026-09-25",
    thresholds: {
      gracePeriodDays: 5,
      suspensionThresholdAmount: "1500.00",
      suspensionThresholdOverdueDays: 30,
    },
    data: [
      {
        serviceAccountId: "sa-1",
        serviceAccountNumber: "BCIS-SA-2026-0001",
        subscriberId: "sub-1",
        subscriberAccountNumber: "BCIS-SUB-2026-0001",
        subscriberDisplayName: "Mercado, Juan B.",
        subscriberMobile: "0917-555-0101",
        servicePlanName: "Fiber 50 Mbps",
        collectionAreaName: "Barangay Casisang",
        collectorName: "Juan Dela Cruz",
        overdueBalance: "₱1,500.00",
        overdueInvoicesCount: 2,
        daysOverdue: 36,
        candidateReasons: [
          "Overdue balance >= ₱1500.00",
          "Delinquent >= 30 days past grace period",
          "2 consecutive unpaid billing cycles",
        ],
      },
    ],
  };

  const mockReconnectionsResponse = {
    data: [
      {
        id: "recon-1",
        reconnectionNumber: "BCIS-RECON-2026-0001",
        serviceAccountId: "sa-1",
        serviceAccountNumber: "BCIS-SA-2026-0001",
        subscriberId: "sub-1",
        subscriberAccountNumber: "BCIS-SUB-2026-0001",
        subscriberDisplayName: "Mercado, Juan B.",
        servicePlanName: "Fiber 50 Mbps",
        requestDate: "2026-09-25",
        status: "REQUESTED",
        fee: "300.00",
        technicianUserId: "tech-1",
        scheduledAt: null,
        completedAt: null,
        notes: "Settled full balance",
      },
    ],
    pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
  };

  const mockTechnicians = {
    data: [
      {
        id: "tech-1",
        username: "tech_pedro",
        displayName: "Pedro Penduko",
        role: "FIELD_COLLECTOR",
      },
    ],
  };

  const mockHistoryResponse = {
    serviceAccountId: "sa-1",
    serviceAccountNumber: "BCIS-SA-2026-0001",
    currentStatus: "SUSPENDED",
    events: [
      {
        id: "evt-1",
        eventType: "SUSPENSION" as const,
        occurredAt: "2026-09-25T10:00:00Z",
        title: "Service Account Suspended",
        description: "NON_PAYMENT: Overdue balance exceeds policy threshold.",
        actorName: "Maria Santos (Super Admin)",
      },
    ],
  };

  beforeEach(() => {
    localStorage.clear();
    api.setToken("mock-token-abc");

    vi.spyOn(api, "listCollectionAreas").mockResolvedValue([
      { id: "area-1", code: "AREA-CAS", name: "Barangay Casisang", isActive: true },
    ]);
    vi.spyOn(api, "listTechnicians").mockResolvedValue(mockTechnicians as any);
    vi.spyOn(api, "getAgingReport").mockResolvedValue(mockAgingReport as any);
    vi.spyOn(api, "getOverdueReceivables").mockResolvedValue(mockOverdueResponse as any);
    vi.spyOn(api, "getSuspensionCandidates").mockResolvedValue(mockCandidatesResponse as any);
    vi.spyOn(api, "listReconnections").mockResolvedValue(mockReconnectionsResponse as any);
    vi.spyOn(api, "suspendServiceAccount").mockResolvedValue({
      message: "Service account suspended successfully.",
      serviceAccount: { id: "sa-1", status: "SUSPENDED" } as any,
      suspension: { id: "susp-1" } as any,
    });
    vi.spyOn(api, "requestReconnection").mockResolvedValue({
      message: "Reconnection work order created successfully.",
      reconnection: { id: "recon-1", reconnectionNumber: "BCIS-RECON-2026-0001" } as any,
      reconnectedImmediately: false,
    });
    vi.spyOn(api, "completeReconnection").mockResolvedValue({
      message: "Reconnection completed and service account restored to ACTIVE.",
      reconnection: { id: "recon-1", status: "COMPLETED" } as any,
      serviceAccount: { id: "sa-1", status: "ACTIVE" } as any,
    });
    vi.spyOn(api, "getServiceControlHistory").mockResolvedValue(mockHistoryResponse as any);
  });

  it("renders AR aging 5-bucket metric cards and subscriber breakdown table", async () => {
    renderWithAuth(<ReceivablesPage />);

    expect(screen.getByText("Accounts Receivable & Service Control")).toBeInTheDocument();

    await waitFor(() => {
      // 5-bucket metrics
      expect(screen.getByText("Current (Not Overdue)")).toBeInTheDocument();
      expect(screen.getByText("1–30 Days Past Due")).toBeInTheDocument();
      expect(screen.getByText("31–60 Days Past Due")).toBeInTheDocument();
      expect(screen.getByText("61–90 Days Past Due")).toBeInTheDocument();
      expect(screen.getByText("90+ Days Past Due")).toBeInTheDocument();
      expect(screen.getByText("Total Receivables")).toBeInTheDocument();

      // Values from summary
      expect(screen.getByText("₱5,000.00")).toBeInTheDocument();
      expect(screen.getByText("₱2,500.00")).toBeInTheDocument();
      expect(screen.getByText("₱10,000.00")).toBeInTheDocument();

      // Breakdown table row
      expect(screen.getByText("Mercado, Juan B.")).toBeInTheDocument();
      expect(screen.getByText("BCIS-SUB-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("Delinquent")).toBeInTheDocument();
    });
  });

  it("switches to Overdue Receivables tab and displays delinquent invoices with grace period policy", async () => {
    renderWithAuth(<ReceivablesPage />);

    const overdueTab = screen.getByRole("button", { name: /overdue receivables/i });
    fireEvent.click(overdueTab);

    await waitFor(() => {
      expect(screen.getByText(/Delinquency Grace Period Policy/i)).toBeInTheDocument();
      expect(screen.getByText(/5 days/i)).toBeInTheDocument();
      expect(screen.getByText("BCIS-INV-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("BCIS-SA-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("36 days")).toBeInTheDocument();
    });
  });

  it("switches to Suspension Candidates tab and executes service suspension", async () => {
    renderWithAuth(<ReceivablesPage />);

    const suspensionTab = screen.getByRole("button", { name: /suspension candidates/i });
    fireEvent.click(suspensionTab);

    await waitFor(() => {
      expect(screen.getByText("BCIS-SA-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("1 Candidate Accounts")).toBeInTheDocument();
      expect(screen.getByText("Overdue balance >= ₱1500.00")).toBeInTheDocument();
    });

    const suspendBtn = screen.getByRole("button", { name: /suspend/i });
    fireEvent.click(suspendBtn);

    await waitFor(() => {
      expect(screen.getByText("Suspend Service Account")).toBeInTheDocument();
      expect(screen.getByText("Suspension Reason * (min 5 characters)")).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole("button", { name: /confirm suspension/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.suspendServiceAccount).toHaveBeenCalledWith(
        "sa-1",
        expect.objectContaining({
          reason: "NON_PAYMENT: Overdue balance exceeds policy threshold.",
        })
      );
    });
  });

  it("switches to Reconnections tab and completes work order restoring service account", async () => {
    renderWithAuth(<ReceivablesPage />);

    const reconTab = screen.getByRole("button", { name: /reconnections & work orders/i });
    fireEvent.click(reconTab);

    await waitFor(() => {
      expect(screen.getByText("BCIS-RECON-2026-0001")).toBeInTheDocument();
      expect(screen.getAllByText("Requested").length).toBeGreaterThan(0);
      expect(screen.getByText("Pedro Penduko")).toBeInTheDocument();
    });

    const completeBtn = screen.getByRole("button", { name: /complete/i });
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(screen.getByText("Complete Reconnection Work Order")).toBeInTheDocument();
      expect(screen.getByText(/Confirming completion of order/i)).toBeInTheDocument();
    });

    const confirmCompleteBtn = screen.getByRole("button", { name: /complete & restore service/i });
    fireEvent.click(confirmCompleteBtn);

    await waitFor(() => {
      expect(api.completeReconnection).toHaveBeenCalledWith(
        "recon-1",
        expect.objectContaining({
          notes: undefined,
        })
      );
    });
  });

  it("opens service control history timeline drawer", async () => {
    renderWithAuth(<ReceivablesPage />);

    const reconTab = screen.getByRole("button", { name: /reconnections & work orders/i });
    fireEvent.click(reconTab);

    await waitFor(() => {
      expect(screen.getByText("BCIS-RECON-2026-0001")).toBeInTheDocument();
    });

    const historyBtn = screen.getByTitle("View History");
    fireEvent.click(historyBtn);

    await waitFor(() => {
      expect(screen.getByText("Service Control & Status History")).toBeInTheDocument();
      expect(screen.getByText("NON_PAYMENT: Overdue balance exceeds policy threshold.")).toBeInTheDocument();
      expect(screen.getByText(/Maria Santos \(Super Admin\)/i)).toBeInTheDocument();
    });
  });
});
