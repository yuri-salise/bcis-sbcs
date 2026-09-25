import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { GcashVerificationPage } from "../features/gcash/GcashVerificationPage";
import { AuthProvider } from "../features/auth/AuthContext";
import {
  api,
  type GcashProofItem,
  type GcashProofDetail,
  type PaymentAllocationPreviewResult,
  type VerifyGcashProofResponse,
} from "../api/client";

function renderWithAuth(ui: React.ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("GcashVerificationPage Component (Phase 5 - AT-05)", () => {
  const mockQueueItems: GcashProofItem[] = [
    {
      id: "proof-1",
      referenceNumber: "GCASH-100234857219",
      amount: "1200.00",
      transactionDate: "2026-09-10",
      senderName: "Juan Dela Cruz",
      senderMobile: "09171234567",
      verificationStatus: "PENDING",
      submittedAt: "2026-09-10T14:30:00Z",
      originalFilename: "proof_1.png",
      mimeType: "image/png",
      fileSize: 45000,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      subscriberId: "sub-1",
      subscriberAccountNumber: "BCIS-SUB-2026-0001",
      subscriberFirstName: "Juan",
      subscriberLastName: "Mercado",
      subscriberDisplayName: "Juan Mercado",
      duplicateDetected: false,
    },
    {
      id: "proof-2",
      referenceNumber: "GCASH-DUPLICATE-9999",
      amount: "1500.00",
      transactionDate: "2026-09-11",
      senderName: "Pedro Penduko",
      senderMobile: "09189876543",
      verificationStatus: "FLAGGED",
      submittedAt: "2026-09-11T09:15:00Z",
      originalFilename: "proof_2.png",
      mimeType: "image/png",
      fileSize: 62000,
      sha256: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
      subscriberId: "sub-2",
      subscriberAccountNumber: "BCIS-SUB-2026-0002",
      subscriberFirstName: "Maria",
      subscriberLastName: "Clara",
      subscriberDisplayName: "Maria Clara",
      duplicateDetected: true,
      duplicateWarning: "Matches active Payment Receipt #BCIS-REC-2026-0004",
    },
  ];

  const mockProofDetail1: GcashProofDetail = {
    ...mockQueueItems[0]!,
    storageKey: "proof-uuid-1.png",
    notes: "Counter submission",
    subscriberEmail: "juan@example.com",
    subscriberMobile: "0917-555-0101",
    duplicateDetection: {
      isDuplicate: false,
      matchedPayment: null,
      matchedProof: null,
    },
  };

  const mockProofDetailDuplicate: GcashProofDetail = {
    ...mockQueueItems[1]!,
    storageKey: "proof-uuid-2.png",
    notes: "Online submission",
    subscriberEmail: "maria@example.com",
    subscriberMobile: "0918-555-0202",
    duplicateDetection: {
      isDuplicate: true,
      duplicateWarning: "Warning: Reference number 'GCASH-DUPLICATE-9999' matches existing posted Receipt #BCIS-REC-2026-0004.",
      matchedPayment: {
        id: "pmt-4",
        receiptNumber: "BCIS-REC-2026-0004",
        amountPaid: "1500.00",
        paymentDate: "2026-09-08",
        status: "POSTED",
      },
      matchedProof: null,
    },
  };

  const mockAllocationPreview: PaymentAllocationPreviewResult = {
    totalPaymentAmount: "1200.00",
    totalAllocated: "1200.00",
    advanceCredit: "0.00",
    invoiceAllocations: [
      {
        invoiceId: "inv-1",
        invoiceNumber: "BCIS-INV-2026-0001",
        cycleCode: "2026-09",
        dueDate: "2026-10-15",
        currentBalance: "1200.00",
        allocatedAmount: "1200.00",
        remainingBalance: "0.00",
        resultingStatus: "PAID",
      },
    ],
  };

  const mockVerifyResponse: VerifyGcashProofResponse = {
    proof: { ...mockProofDetail1, verificationStatus: "VERIFIED" },
    payment: {
      id: "pmt-new",
      receiptNumber: "BCIS-REC-2026-0005",
      subscriberId: "sub-1",
      paymentDate: "2026-09-10",
      paymentMethod: "GCASH",
      referenceNumber: "GCASH-100234857219",
      amountPaid: "1200.00",
      allocatedAmount: "1200.00",
      advanceAmount: "0.00",
      status: "POSTED",
      cashierId: "user-admin",
      isReversed: false,
      createdAt: "2026-09-10T15:00:00Z",
      updatedAt: "2026-09-10T15:00:00Z",
    },
    allocations: [
      {
        invoiceId: "inv-1",
        invoiceNumber: "BCIS-INV-2026-0001",
        allocatedAmount: "1200.00",
        previousBalance: "1200.00",
        remainingBalance: "0.00",
        status: "PAID",
      },
    ],
    advanceCredit: "0.00",
    receiptNumber: "BCIS-REC-2026-0005",
    message: "GCash proof verified successfully. Official Receipt #BCIS-REC-2026-0005 issued.",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    api.setToken("mock-token-abc");

    vi.spyOn(api, "getMe").mockResolvedValue({
      user: { id: "user-admin", username: "admin", displayName: "System Admin", email: "admin@bcis.local" },
      roles: ["ADMIN"],
      permissions: ["gcash.verify", "payment.create", "payment.view"],
    });

    vi.spyOn(api, "listGcashQueue").mockResolvedValue({
      data: mockQueueItems,
      pagination: { total: 2, page: 1, limit: 15, totalPages: 1 },
    });

    vi.spyOn(api, "getGcashProof").mockImplementation(async (id: string) => {
      if (id === "proof-2") return mockProofDetailDuplicate;
      return mockProofDetail1;
    });

    // Mock blob retrieval
    const fakeBlob = new Blob(["fake png data"], { type: "image/png" });
    vi.spyOn(api, "getGcashProofFileBlob").mockResolvedValue(fakeBlob);

    // Mock URL.createObjectURL
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn(() => "blob:http://localhost/fake-proof-blob");
    }
  });

  it("renders the verification queue header and pending items", async () => {
    renderWithAuth(<GcashVerificationPage />);

    expect(screen.getByText("GCash Proof Verification")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("GCASH-100234857219")).toBeInTheDocument();
      expect(screen.getByText("GCASH-DUPLICATE-9999")).toBeInTheDocument();
    });

    // Check duplicate badge indicator
    expect(screen.getByText("Matches active Payment Receipt #BCIS-REC-2026-0004")).toBeInTheDocument();
  });

  it("displays proof details and inspection metadata for selected item", async () => {
    renderWithAuth(<GcashVerificationPage />);

    await waitFor(() => {
      expect(screen.getByText("GCASH-100234857219")).toBeInTheDocument();
    });

    // Verify right pane displays details
    await waitFor(() => {
      expect(screen.getByText("Juan Dela Cruz")).toBeInTheDocument();
      expect(screen.getByText("09171234567")).toBeInTheDocument();
      expect(screen.getByText("BCIS-SUB-2026-0001")).toBeInTheDocument();
    });
  });

  it("prominently renders AT-05 duplicate reference warning when flagged proof is selected", async () => {
    renderWithAuth(<GcashVerificationPage />);

    await waitFor(() => {
      expect(screen.getByText("GCASH-DUPLICATE-9999")).toBeInTheDocument();
    });

    // Click second item in queue
    fireEvent.click(screen.getByText("GCASH-DUPLICATE-9999"));

    await waitFor(() => {
      expect(screen.getByText(/DUPLICATE REFERENCE DETECTED \(AT-05\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Matches active Payment Receipt #BCIS-REC-2026-0004/i)).toBeInTheDocument();
    });
  });

  it("opens verify modal, loads oldest-first allocation preview, and posts payment", async () => {
    vi.spyOn(api, "previewPaymentAllocation").mockResolvedValue(mockAllocationPreview);
    vi.spyOn(api, "verifyGcashProof").mockResolvedValue(mockVerifyResponse);

    renderWithAuth(<GcashVerificationPage />);

    await waitFor(() => {
      expect(screen.getByText("Verify & Post Payment")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Verify & Post Payment"));

    // Verify modal appears
    await waitFor(() => {
      expect(screen.getByText("Automatic Oldest-First Allocation Preview:")).toBeInTheDocument();
      expect(screen.getByText("BCIS-INV-2026-0001")).toBeInTheDocument();
    });

    // Confirm verification
    const confirmBtn = screen.getByText("Confirm & Issue Receipt");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText("Official Receipt Issued")).toBeInTheDocument();
      expect(screen.getByText("BCIS-REC-2026-0005")).toBeInTheDocument();
    });
  });

  it("handles proof rejection with mandatory reason", async () => {
    const rejectSpy = vi.spyOn(api, "rejectGcashProof").mockResolvedValue({
      proof: { ...mockProofDetail1, verificationStatus: "REJECTED" },
      message: "GCash proof rejected. Evidence preserved for auditing.",
    });

    renderWithAuth(<GcashVerificationPage />);

    await waitFor(() => {
      expect(screen.getByText("Reject Proof")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Reject Proof"));

    await waitFor(() => {
      expect(screen.getByText("Mandatory Rejection Reason:")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Unreadable screenshot/i);
    fireEvent.change(textarea, { target: { value: "Invalid reference number provided by customer" } });

    const rejectSubmitBtn = screen.getAllByRole("button", { name: /Reject Proof/i })[1];
    expect(rejectSubmitBtn).toBeDefined();
    fireEvent.click(rejectSubmitBtn!);

    await waitFor(() => {
      expect(rejectSpy).toHaveBeenCalledWith("proof-1", {
        reason: "Invalid reference number provided by customer",
      });
    });
  });
});
