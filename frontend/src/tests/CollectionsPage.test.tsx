import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CollectionsPage } from "../features/collections/CollectionsPage";
import { AuthProvider } from "../features/auth/AuthContext";
import {
  api,
  type CollectionBatch,
  type CollectionBatchDetail,
  type Collector,
  type CollectionArea,
} from "../api/client";

function renderWithAuth(ui: React.ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("CollectionsPage Component (Phase 6 - AT-07 & AT-08)", () => {
  const mockCollectors: Collector[] = [
    {
      id: "col-1",
      collectorCode: "COL-001",
      name: "Juan Dela Cruz",
      contactNumber: "0917-123-4567",
      isActive: true,
    },
  ];

  const mockAreas: CollectionArea[] = [
    {
      id: "area-1",
      code: "AREA-CAS",
      name: "Barangay Casisang",
      description: "Casisang route",
      isActive: true,
    },
  ];

  const mockBatches: CollectionBatch[] = [
    {
      id: "batch-1",
      batchNumber: "BCIS-BATCH-2026-0001",
      collectorId: "col-1",
      collectorCode: "COL-001",
      collectorName: "Juan Dela Cruz",
      collectionAreaId: "area-1",
      collectionAreaCode: "AREA-CAS",
      collectionAreaName: "Barangay Casisang",
      collectionDate: "2026-09-25",
      status: "OPEN",
      expectedCash: "1299.00",
      expectedNonCash: "0.00",
      expectedTotal: "1299.00",
      collectedCash: "0.00",
      collectedNonCash: "0.00",
      collectedTotal: "0.00",
      remittedCash: "0.00",
      difference: "0.00",
      shortageAmount: "0.00",
      overageAmount: "0.00",
      notes: "Morning field collection",
      createdAt: "2026-09-25T08:00:00Z",
    },
    {
      id: "batch-2",
      batchNumber: "BCIS-BATCH-2026-0002",
      collectorId: "col-1",
      collectorCode: "COL-001",
      collectorName: "Juan Dela Cruz",
      collectionAreaId: "area-1",
      collectionAreaCode: "AREA-CAS",
      collectionAreaName: "Barangay Casisang",
      collectionDate: "2026-09-25",
      status: "REMITTED",
      expectedCash: "2000.00",
      expectedNonCash: "0.00",
      expectedTotal: "2000.00",
      collectedCash: "2000.00",
      collectedNonCash: "0.00",
      collectedTotal: "2000.00",
      remittedCash: "1500.00",
      difference: "-500.00",
      shortageAmount: "500.00",
      overageAmount: "0.00",
      notes: "AT-08 Shortage Batch",
      createdAt: "2026-09-25T08:00:00Z",
    },
  ];

  const mockBatch1Detail: CollectionBatchDetail = {
    ...mockBatches[0]!,
    accounts: [
      {
        id: "acc-1",
        collectionBatchId: "batch-1",
        serviceAccountId: "sa-1",
        serviceAccountNumber: "BCIS-SA-2026-0001",
        subscriberId: "sub-1",
        subscriberDisplayName: "Maria Santos",
        addressLine: "Purok 3 Casisang",
        invoiceId: "inv-1",
        invoiceNumber: "BCIS-INV-2026-0001",
        expectedAmount: "1299.00",
        collectedAmount: "0.00",
        status: "UNPAID",
      },
    ],
    remittances: [],
  };

  const mockBatch2Detail: CollectionBatchDetail = {
    ...mockBatches[1]!,
    accounts: [
      {
        id: "acc-2",
        collectionBatchId: "batch-2",
        serviceAccountId: "sa-2",
        serviceAccountNumber: "BCIS-SA-2026-0002",
        subscriberId: "sub-2",
        subscriberDisplayName: "Roberto Tan",
        addressLine: "Purok 5 Sumpong",
        invoiceId: "inv-2",
        invoiceNumber: "BCIS-INV-2026-0002",
        expectedAmount: "2000.00",
        collectedAmount: "2000.00",
        status: "COLLECTED",
      },
    ],
    remittances: [
      {
        id: "rem-1",
        collectionBatchId: "batch-2",
        remittanceNumber: "BCIS-REMIT-2026-0001",
        remittedCash: "1500.00",
        remittedGcash: "0.00",
        remittedBankTransfer: "0.00",
        otherNonCash: "0.00",
        totalRemitted: "1500.00",
        expectedCash: "2000.00",
        shortageAmount: "500.00",
        overageAmount: "0.00",
        receivedBy: "cashier-1",
        receivedByDisplayName: "Elena Ramos (Cashier)",
        receivedAt: "2026-09-25T16:00:00Z",
        notes: "Envelope short by 500 pesos",
      },
    ],
  };

  beforeEach(() => {
    localStorage.clear();
    api.setToken("mock-token-abc");

    vi.spyOn(api, "listCollectors").mockResolvedValue(mockCollectors);
    vi.spyOn(api, "listCollectionAreas").mockResolvedValue(mockAreas);
    vi.spyOn(api, "listBatches").mockResolvedValue({
      data: mockBatches,
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });
    vi.spyOn(api, "getBatchById").mockImplementation(async (id: string) => {
      if (id === "batch-2") return mockBatch2Detail;
      return mockBatch1Detail;
    });
    vi.spyOn(api, "createBatch").mockResolvedValue({
      data: mockBatches[0]!,
      message: "Batch created successfully.",
    });
    vi.spyOn(api, "recordFieldCollection").mockResolvedValue({
      batch: mockBatches[0]!,
      account: mockBatch1Detail.accounts[0]!,
      payment: {} as any,
      receiptNumber: "BCIS-REC-2026-0001",
      message: "Collection recorded.",
    });
    vi.spyOn(api, "submitBatch").mockResolvedValue({
      batch: { ...mockBatches[0]!, status: "SUBMITTED" },
      status: "SUBMITTED",
      message: "Batch submitted.",
    });
    vi.spyOn(api, "recordRemittance").mockResolvedValue({
      batch: { ...mockBatches[0]!, status: "REMITTED" },
      remittance: mockBatch2Detail.remittances[0]!,
      remittanceNumber: "BCIS-REMIT-2026-0001",
      remittedCash: "1299.00",
      isBalanced: true,
      difference: "0.00",
      shortageAmount: "0.00",
      overageAmount: "0.00",
      batchStatus: "REMITTED",
      message: "Remittance recorded.",
    });
    vi.spyOn(api, "closeBatch").mockResolvedValue({
      batch: { ...mockBatches[1]!, status: "CLOSED" },
      status: "CLOSED",
      message: "Batch closed successfully.",
    });
  });

  it("renders page header and metric summary cards", async () => {
    renderWithAuth(<CollectionsPage />);

    expect(screen.getByText("Collections & Route Reconciliation")).toBeInTheDocument();
    expect(screen.getByText("Total Route Batches")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("BCIS-BATCH-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("BCIS-BATCH-2026-0002")).toBeInTheDocument();
    });
  });

  it("displays route sheet details for selected batch", async () => {
    renderWithAuth(<CollectionsPage />);

    await waitFor(() => {
      expect(screen.getByText("BCIS-SA-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("Maria Santos")).toBeInTheDocument();
      expect(screen.getByText("Route Accounts (1)")).toBeInTheDocument();
    });
  });

  it("opens field collection modal and records collection", async () => {
    renderWithAuth(<CollectionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Collect")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Collect"));

    await waitFor(() => {
      expect(screen.getByText("Record Field Collection")).toBeInTheDocument();
      expect(screen.getByText("Issue Official Receipt")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Issue Official Receipt"));

    await waitFor(() => {
      expect(api.recordFieldCollection).toHaveBeenCalledWith(
        "batch-1",
        expect.objectContaining({
          batchAccountId: "acc-1",
          amount: "1299.00",
          paymentMethod: "CASH",
        })
      );
    });
  });

  it("AT-08: Enforces supervisor reason requirement when closing unbalanced batch", async () => {
    renderWithAuth(<CollectionsPage />);

    // Select batch-2 (unbalanced shortage of ₱500)
    await waitFor(() => {
      expect(screen.getByText("BCIS-BATCH-2026-0002")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("BCIS-BATCH-2026-0002"));

    const closeBtn = await screen.findByRole("button", { name: /close batch/i });
    fireEvent.click(closeBtn);

    // Verify AT-08 warning alert is displayed
    await waitFor(() => {
      expect(screen.getByText("Acceptance Test AT-08: Unbalanced Batch Guardrail")).toBeInTheDocument();
      expect(screen.getByText(/Under BCIS audit invariants, an operational supervisor reason/)).toBeInTheDocument();
    });

    const submitBtn = screen.getByText("Confirm Close Batch");
    // Button must be disabled initially (empty reason)
    expect(submitBtn).toBeDisabled();

    // Type short reason (< 5 chars)
    const textarea = screen.getByPlaceholderText(/Shortage of ₱500 acknowledged/);
    fireEvent.change(textarea, { target: { value: "loss" } });
    expect(submitBtn).toBeDisabled();

    // Type valid reason (>= 5 chars)
    fireEvent.change(textarea, {
      target: { value: "Shortage of ₱500 acknowledged; promissory note filed with HR." },
    });
    expect(submitBtn).not.toBeDisabled();

    // Submit close
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.closeBatch).toHaveBeenCalledWith(
        "batch-2",
        expect.objectContaining({
          reason: "Shortage of ₱500 acknowledged; promissory note filed with HR.",
        })
      );
    });
  });
});
