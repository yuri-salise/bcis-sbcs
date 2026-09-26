import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ServicesPage } from "../features/services/ServicesPage";
import { AuthProvider } from "../features/auth/AuthContext";
import { api, type ServicePlan, type CollectionArea, type Collector } from "../api/client";

function renderWithAuth(ui: React.ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("ServicesPage Component (Phase 2 & Desktop Navigation)", () => {
  const mockPlans: ServicePlan[] = [
    {
      id: "plan-1",
      code: "FIBER-50",
      name: "Fiber Broadband 50 Mbps",
      description: "High-speed optical fiber for residential streaming",
      monthlyPrice: "1299.00",
      installationFee: "1500.00",
      reconnectionFee: "300.00",
      speedMbps: 50,
      channelCount: null,
      isActive: true,
      serviceType: {
        id: "type-1",
        code: "INTERNET",
        name: "Fiber Internet",
      },
    },
    {
      id: "plan-2",
      code: "CABLE-STD",
      name: "Standard Digital Cable",
      description: "Clear digital channels including HD sports and news",
      monthlyPrice: "550.00",
      installationFee: "1000.00",
      reconnectionFee: "250.00",
      speedMbps: null,
      channelCount: 85,
      isActive: true,
      serviceType: {
        id: "type-2",
        code: "CABLE",
        name: "Cable TV",
      },
    },
    {
      id: "plan-3",
      code: "COMBO-MAX",
      name: "Fiber 100 Mbps + Digital Cable",
      description: "Dual play broadband and television bundle",
      monthlyPrice: "1899.00",
      installationFee: "1500.00",
      reconnectionFee: "350.00",
      speedMbps: 100,
      channelCount: 110,
      isActive: true,
      serviceType: {
        id: "type-3",
        code: "COMBO",
        name: "Dual-Play Bundle",
      },
    },
  ];

  const mockAreas: CollectionArea[] = [
    {
      id: "area-1",
      code: "AREA-CAS",
      name: "Barangay Casisang",
      description: "Purok 1-7 Residential Zone",
      isActive: true,
    },
    {
      id: "area-2",
      code: "AREA-SUM",
      name: "Barangay Sumpong",
      description: "Commercial & Residential Zone",
      isActive: true,
    },
  ];

  const mockCollectors: Collector[] = [
    {
      id: "col-1",
      collectorCode: "COL-001",
      name: "Juan Dela Cruz",
      contactNumber: "0917-123-4567",
      isActive: true,
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    api.setToken("mock-token-xyz");

    vi.spyOn(api, "listServicePlans").mockResolvedValue(mockPlans);
    vi.spyOn(api, "listCollectionAreas").mockResolvedValue(mockAreas);
    vi.spyOn(api, "listCollectors").mockResolvedValue(mockCollectors);
  });

  it("renders Services & Plans catalog with KPI metrics and plan table", async () => {
    renderWithAuth(<ServicesPage />);

    expect(screen.getByText("Services & Plans Catalog")).toBeInTheDocument();

    await waitFor(() => {
      // Metric counters
      expect(screen.getByText("Active Service Plans")).toBeInTheDocument();
      expect(screen.getByText("Fiber Broadband Tiers")).toBeInTheDocument();

      // Plan rows
      expect(screen.getByText("FIBER-50")).toBeInTheDocument();
      expect(screen.getByText("Fiber Broadband 50 Mbps")).toBeInTheDocument();
      expect(screen.getByText("50 Mbps")).toBeInTheDocument();
      expect(screen.getByText("₱1,299.00")).toBeInTheDocument();

      expect(screen.getByText("CABLE-STD")).toBeInTheDocument();
      expect(screen.getByText("85 Channels")).toBeInTheDocument();
    });
  });

  it("filters service plans by category type", async () => {
    renderWithAuth(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText("FIBER-50")).toBeInTheDocument();
      expect(screen.getByText("CABLE-STD")).toBeInTheDocument();
    });

    // Click "Cable TV" filter
    const cableBtn = screen.getByRole("button", { name: /^cable tv$/i });
    fireEvent.click(cableBtn);

    await waitFor(() => {
      expect(screen.getByText("CABLE-STD")).toBeInTheDocument();
      expect(screen.queryByText("FIBER-50")).not.toBeInTheDocument();
    });
  });

  it("switches to Coverage & Collection Areas tab", async () => {
    renderWithAuth(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /coverage & collection areas/i })).toBeInTheDocument();
    });

    const areasTabBtn = screen.getByRole("button", { name: /coverage & collection areas/i });
    fireEvent.click(areasTabBtn);

    await waitFor(() => {
      expect(screen.getByText("AREA-CAS")).toBeInTheDocument();
      expect(screen.getByText("Barangay Casisang")).toBeInTheDocument();
      expect(screen.getByText("AREA-SUM")).toBeInTheDocument();
      expect(screen.getByText("Barangay Sumpong")).toBeInTheDocument();
    });
  });

  it("switches to Service Policies & Fees tab", async () => {
    renderWithAuth(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText("FIBER-50")).toBeInTheDocument();
    });

    const policyTabBtn = screen.getByTestId("tab-policies");
    fireEvent.click(policyTabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Billing Cycles & Due Dates/i)).toBeInTheDocument();
      expect(screen.getByText(/Suspension & Reconnection Standards/i)).toBeInTheDocument();
    });
  });
});
