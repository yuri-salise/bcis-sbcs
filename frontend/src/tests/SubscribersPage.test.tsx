import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SubscribersPage } from "../features/subscribers/SubscribersPage";
import { AuthProvider } from "../features/auth/AuthContext";
import { api } from "../api/client";

function renderWithAuth(ui: React.ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("SubscribersPage Component (Phase 2)", () => {
  beforeEach(() => {
    localStorage.clear();
    api.setToken("mock-token-abc");

    // Mock API methods on client
    vi.spyOn(api, "listSubscribers").mockResolvedValue({
      data: [
        {
          id: "sub-1",
          accountNumber: "BCIS-SUB-2026-0001",
          firstName: "Juan",
          middleName: "B.",
          lastName: "Mercado",
          businessName: null,
          primaryContactNumber: "0917-555-0101",
          status: "ACTIVE",
          createdAt: "2026-01-15T00:00:00Z",
          updatedAt: "2026-01-15T00:00:00Z",
          primaryAddress: {
            label: "Home",
            line1: "Purok 3",
            barangay: "Casisang",
            cityMunicipality: "Malaybalay City",
            province: "Bukidnon",
          },
          serviceAccountsCount: 1,
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    vi.spyOn(api, "getSubscriberById").mockResolvedValue({
      id: "sub-1",
      accountNumber: "BCIS-SUB-2026-0001",
      firstName: "Juan",
      middleName: "B.",
      lastName: "Mercado",
      businessName: null,
      primaryContactNumber: "0917-555-0101",
      secondaryContactNumber: "088-813-1101",
      email: "juan.mercado@gmail.com",
      status: "ACTIVE",
      notes: "Residential fiber subscriber",
      createdAt: "2026-01-15T00:00:00Z",
      updatedAt: "2026-01-15T00:00:00Z",
      addresses: [
        {
          id: "addr-1",
          label: "Home",
          line1: "Purok 3",
          barangay: "Casisang",
          cityMunicipality: "Malaybalay City",
          province: "Bukidnon",
          postalCode: "8700",
          isPrimary: true,
        },
      ],
      serviceAccounts: [
        {
          id: "sa-1",
          subscriberId: "sub-1",
          serviceAccountNumber: "BCIS-SA-2026-0001",
          serviceTypeId: "type-1",
          servicePlanId: "plan-1",
          installationAddressId: "addr-1",
          activationDate: "2026-01-15",
          billingStartDate: "2026-01-15",
          billingDay: 1,
          dueDay: 15,
          currentRate: "1299.00",
          status: "ACTIVE",
          cachedBalanceDue: "0.00",
          createdAt: "2026-01-15T00:00:00Z",
          updatedAt: "2026-01-15T00:00:00Z",
          servicePlan: {
            id: "plan-1",
            code: "PLAN-INT-50M",
            name: "Fiber 50 Mbps",
            monthlyPrice: "1299.00",
            installationFee: "1500.00",
            reconnectionFee: "300.00",
            speedMbps: 50,
            channelCount: null,
            isActive: true,
            serviceType: { id: "type-1", code: "INTERNET", name: "Fiber Internet" },
          },
          serviceType: { id: "type-1", code: "INTERNET", name: "Fiber Internet" },
          collectionArea: { id: "area-1", code: "AREA-CAS", name: "Barangay Casisang", isActive: true },
          collector: { id: "col-1", collectorCode: "COL-001", name: "Juan Dela Cruz", isActive: true },
          statusHistory: [
            {
              id: "hist-1",
              serviceAccountId: "sa-1",
              fromStatus: "NONE",
              toStatus: "ACTIVE",
              effectiveAt: "2026-01-15T00:00:00Z",
              reason: "Initial activation",
            },
          ],
        },
      ],
    });
  });

  it("renders subscriber directory table with seeded records", async () => {
    renderWithAuth(<SubscribersPage />);

    expect(screen.getByText("Subscriber Directory")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by account #/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("BCIS-SUB-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("Mercado, Juan B.")).toBeInTheDocument();
      expect(screen.getByText("0917-555-0101")).toBeInTheDocument();
      expect(screen.getByText(/Casisang, Malaybalay City/i)).toBeInTheDocument();
      expect(screen.getByText("1 active")).toBeInTheDocument();
    });
  });

  it("opens subscriber profile drawer upon clicking View Profile", async () => {
    renderWithAuth(<SubscribersPage />);

    await waitFor(() => {
      expect(screen.getByText("BCIS-SUB-2026-0001")).toBeInTheDocument();
    });

    const viewButton = screen.getByRole("button", { name: /view profile/i });
    fireEvent.click(viewButton);

    await waitFor(() => {
      expect(screen.getByText("Contact & Account Information")).toBeInTheDocument();
      expect(screen.getByText("juan.mercado@gmail.com")).toBeInTheDocument();
      expect(screen.getByText("Residential fiber subscriber")).toBeInTheDocument();
      expect(screen.getByText("Registered Addresses")).toBeInTheDocument();
      expect(screen.getByText("Billable Service Subscriptions (1)")).toBeInTheDocument();
      expect(screen.getByText("BCIS-SA-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("Fiber 50 Mbps")).toBeInTheDocument();
      expect(screen.getByText("₱1,299.00")).toBeInTheDocument();
    });
  });
});
