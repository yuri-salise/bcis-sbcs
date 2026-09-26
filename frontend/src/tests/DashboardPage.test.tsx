import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { AuthProvider } from "../features/auth/AuthContext";
import { api, type DashboardMetrics } from "../api/client";

function renderWithAuth(ui: React.ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("DashboardPage Component (Phase 8 - Executive Dashboard & Operational KPIs)", () => {
  const mockDashboardData: DashboardMetrics = {
    kpis: {
      currentReceivable: "₱145,250.00",
      overdueReceivable: "₱32,400.00",
      todayCollection: "₱18,500.00",
      currentBilling: "₱180,000.00",
      pendingGcashCount: 3,
      reconciliationExceptionsCount: 1,
    },
    supporting: {
      billingVsCollectionTrend: [
        {
          cycleId: "cycle-1",
          cycleCode: "2026-08",
          period: "2026-08-01 to 2026-08-31",
          billedAmount: "₱150,000.00",
          collectedAmount: "₱142,500.00",
          billedNumber: "150000.00",
          collectedNumber: "142500.00",
        },
      ],
      paymentMethodBreakdown: [
        { method: "CASH", amount: "₱12,500.00", count: 10, percentage: 68 },
        { method: "GCASH", amount: "₱6,000.00", count: 4, percentage: 32 },
      ],
      agingSummary: {
        totalReceivable: "₱177,650.00",
        current: { amount: "₱145,250.00", count: 110, percentage: 82 },
        days1to30: { amount: "₱18,400.00", count: 14, percentage: 10 },
        days31to60: { amount: "₱8,000.00", count: 6, percentage: 5 },
        days61to90: { amount: "₱4,000.00", count: 3, percentage: 2 },
        days90Plus: { amount: "₱2,000.00", count: 2, percentage: 1 },
      },
      topCollectors: [
        {
          id: "col-1",
          name: "Juan Dela Cruz",
          code: "COL-001",
          areaName: "Barangay Casisang",
          collectedThisMonth: "₱45,000.00",
          batchesCount: 12,
          efficiencyPercentage: 98,
        },
      ],
      delinquencyAlerts: {
        overdueInvoicesCount: 5,
        daysOverdue30PlusCount: 2,
      },
      recentPayments: [
        {
          id: "pay-1",
          receiptNumber: "OR-2026-0001",
          paymentDate: "2026-09-26",
          amount: "₱1,299.00",
          paymentMethod: "CASH",
          subscriberName: "Juan Mercado",
          collectorName: "Juan Dela Cruz",
        },
      ],
    },
    asOfDate: "2026-09-26",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, "getDashboardMetrics").mockResolvedValue(mockDashboardData);
  });

  it("renders executive dashboard header and operational title", async () => {
    renderWithAuth(<DashboardPage />);

    expect(screen.getByText("Loading executive dashboard & operational metrics...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Executive Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Live Operations")).toBeInTheDocument();
    });
  });

  it("displays all 6 compact operational KPI cards", async () => {
    renderWithAuth(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("kpi-today-collection")).toHaveTextContent("₱18,500.00");
      expect(screen.getByTestId("kpi-current-receivable")).toHaveTextContent("₱145,250.00");
      expect(screen.getByTestId("kpi-overdue-receivable")).toHaveTextContent("₱32,400.00");
      expect(screen.getByTestId("kpi-current-billing")).toHaveTextContent("₱180,000.00");
      expect(screen.getByTestId("kpi-pending-gcash")).toHaveTextContent("3");
      expect(screen.getByTestId("kpi-reconciliation-exceptions")).toHaveTextContent("1");
    });
  });

  it("renders 6-month billing vs collection comparative bars", async () => {
    renderWithAuth(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Billing vs Collection Trend")).toBeInTheDocument();
      expect(screen.getByText("2026-08 (2026-08-01 to 2026-08-31)")).toBeInTheDocument();
      expect(screen.getByText("95% Collected")).toBeInTheDocument();
    });
  });

  it("renders AR aging distribution and payment method channels", async () => {
    renderWithAuth(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Accounts Receivable Aging")).toBeInTheDocument();
      expect(screen.getByText("Total: ₱177,650.00")).toBeInTheDocument();
      expect(screen.getByText("Payment Channels & Methods")).toBeInTheDocument();
      expect(screen.getByText("💵 Cash")).toBeInTheDocument();
      expect(screen.getByText("📱 GCash")).toBeInTheDocument();
    });
  });

  it("renders collector leaderboard and recent payments ticker", async () => {
    renderWithAuth(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Collector Leaderboard")).toBeInTheDocument();
      expect(screen.getAllByText("Juan Dela Cruz")[0]).toBeInTheDocument();
      expect(screen.getByText("98% efficiency")).toBeInTheDocument();

      expect(screen.getByText("Recent Payment Transactions")).toBeInTheDocument();
      expect(screen.getByText("OR-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("Juan Mercado")).toBeInTheDocument();
    });
  });

  it("allows refreshing dashboard metrics via the refresh button", async () => {
    renderWithAuth(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("refresh-dashboard-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("refresh-dashboard-btn"));

    await waitFor(() => {
      expect(api.getDashboardMetrics).toHaveBeenCalledTimes(2);
    });
  });

  it("displays error state with retry button when loading fails", async () => {
    vi.spyOn(api, "getDashboardMetrics").mockRejectedValueOnce(new Error("Network connection lost"));
    renderWithAuth(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Operational Dashboard Error")).toBeInTheDocument();
      expect(screen.getByText("Network connection lost")).toBeInTheDocument();
      expect(screen.getByText("Retry Loading")).toBeInTheDocument();
    });
  });
});
