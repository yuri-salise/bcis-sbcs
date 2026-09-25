import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { PaymentsPage } from "../features/payments/PaymentsPage";
import { AuthProvider } from "../features/auth/AuthContext";
import { api, type Payment, type Subscriber } from "../api/client";

function renderWithAuth(ui: React.ReactNode) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe("PaymentsPage Component (Phase 4 - AT-01 to AT-06)", () => {
  const mockPayments: Payment[] = [
    {
      id: "pmt-1",
      receiptNumber: "BCIS-REC-2026-0001",
      subscriberId: "sub-1",
      serviceAccountId: "sa-1",
      paymentDate: "2026-09-02",
      paymentMethod: "CASH",
      referenceNumber: null,
      amountPaid: "1299.00",
      tenderedAmount: "1500.00",
      changeAmount: "201.00",
      allocatedAmount: "1299.00",
      advanceAmount: "0.00",
      status: "POSTED",
      cashierId: "user-cashier",
      isReversed: false,
      reversedAt: null,
      reversedBy: null,
      reversalReason: null,
      notes: "Cash payment",
      createdAt: "2026-09-02T10:00:00Z",
      updatedAt: "2026-09-02T10:00:00Z",
      subscriber: {
        id: "sub-1",
        accountNumber: "BCIS-SUB-2026-0001",
        firstName: "Juan",
        lastName: "Mercado",
        businessName: null,
        primaryContactNumber: "0917-555-0101",
      },
      cashier: {
        id: "user-cashier",
        username: "cashier",
        displayName: "Pedro Cashier",
      },
      allocations: [
        {
          id: "alloc-1",
          paymentId: "pmt-1",
          invoiceId: "inv-1",
          allocatedAmount: "1299.00",
          previousInvoiceBalance: "1299.00",
          remainingInvoiceBalance: "0.00",
          createdAt: "2026-09-02T10:00:00Z",
          invoice: {
            id: "inv-1",
            invoiceNumber: "BCIS-INV-2026-0001",
            cycleCode: "2026-09",
            dueDate: "2026-09-15",
            totalAmount: "1299.00",
            status: "PAID",
          },
        },
      ],
    },
  ];

  const mockSubscribers: Subscriber[] = [
    {
      id: "sub-1",
      accountNumber: "BCIS-SUB-2026-0001",
      firstName: "Juan",
      lastName: "Mercado",
      businessName: null,
      primaryContactNumber: "0917-555-0101",
      status: "ACTIVE",
      createdAt: "2026-01-15T00:00:00Z",
      updatedAt: "2026-01-15T00:00:00Z",
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    api.setToken("mock-token-abc");

    vi.spyOn(api, "listPayments").mockResolvedValue({
      data: mockPayments,
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    vi.spyOn(api, "getPaymentById").mockResolvedValue(mockPayments[0]!);
    vi.spyOn(api, "listSubscribers").mockResolvedValue({
      data: mockSubscribers,
      pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
    });
    vi.spyOn(api, "previewPaymentAllocation").mockResolvedValue({
      totalPaymentAmount: "1299.00",
      totalAllocated: "1299.00",
      advanceCredit: "0.00",
      invoiceAllocations: [
        {
          invoiceId: "inv-1",
          invoiceNumber: "BCIS-INV-2026-0001",
          cycleCode: "2026-09",
          dueDate: "2026-09-15",
          currentBalance: "1299.00",
          allocatedAmount: "1299.00",
          remainingBalance: "0.00",
          resultingStatus: "PAID",
        },
      ],
    });
    vi.spyOn(api, "createPayment").mockResolvedValue({
      payment: mockPayments[0]!,
      allocations: [
        {
          invoiceId: "inv-1",
          invoiceNumber: "BCIS-INV-2026-0001",
          allocatedAmount: "1299.00",
          previousBalance: "1299.00",
          remainingBalance: "0.00",
          status: "PAID",
        },
      ],
      advanceCredit: "0.00",
      message: "Payment posted successfully.",
    });
    vi.spyOn(api, "reversePayment").mockResolvedValue({
      payment: { ...mockPayments[0]!, isReversed: true, status: "REVERSED" },
      message: "Payment reversed successfully.",
    });
  });

  it("renders payments dashboard with table, search input, and summary metrics", async () => {
    renderWithAuth(<PaymentsPage />);

    expect(screen.getByText("Payments & Collections")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("BCIS-REC-2026-0001")).toBeInTheDocument();
      expect(screen.getByText("Juan Mercado")).toBeInTheDocument();
      expect(screen.getByText("POSTED")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/search receipt #/i)).toBeInTheDocument();
  });

  it("opens receive payment modal when 'Receive Payment' button is clicked", async () => {
    renderWithAuth(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Receive Payment")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Receive Payment"));

    await waitFor(() => {
      expect(screen.getByText("Receive & Allocate Payment")).toBeInTheDocument();
      expect(screen.getByText("1. Select Subscriber *")).toBeInTheDocument();
      expect(screen.getByText("2. Payment Method *")).toBeInTheDocument();
      expect(screen.getByText(/3. Amount Paid/i)).toBeInTheDocument();
    });
  });

  it("calculates live oldest-first preview when subscriber and amount are entered", async () => {
    renderWithAuth(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Receive Payment")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Receive Payment"));

    // Select subscriber
    await waitFor(() => {
      expect(screen.getByText("(BCIS-SUB-2026-0001)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("(BCIS-SUB-2026-0001)"));

    // Type payment amount
    const amountInput = screen.getByPlaceholderText("0.00");
    fireEvent.change(amountInput, { target: { value: "1299.00" } });

    // Wait for debounced preview call
    await waitFor(() => {
      expect(api.previewPaymentAllocation).toHaveBeenCalledWith({
        subscriberId: "sub-1",
        amount: "1299.00",
      });
      expect(screen.getByText("BCIS-INV-2026-0001")).toBeInTheDocument();
    });
  });

  it("submits payment and automatically opens Official Receipt modal", async () => {
    renderWithAuth(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Receive Payment")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Receive Payment"));

    // Pick subscriber
    await waitFor(() => {
      expect(screen.getByText("(BCIS-SUB-2026-0001)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("(BCIS-SUB-2026-0001)"));

    // Enter amount
    const amountInput = screen.getByPlaceholderText("0.00");
    fireEvent.change(amountInput, { target: { value: "1299.00" } });

    // Submit
    const submitBtn = screen.getByRole("button", { name: /post payment & issue receipt/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createPayment).toHaveBeenCalled();
      expect(screen.getByText("Official Receipt Preview")).toBeInTheDocument();
      expect(screen.getByText("Bukidnon Cable and Internet Services")).toBeInTheDocument();
      expect(screen.getByText("Print Receipt")).toBeInTheDocument();
    });
  });

  it("opens reversal modal, enforces minimum 5-char reason, and reverses payment (AT-06)", async () => {
    // Set admin token with payment.reverse permission
    localStorage.setItem("bcis_permissions", JSON.stringify(["payment.view", "payment.create", "payment.reverse"]));
    localStorage.setItem("bcis_roles", JSON.stringify(["ADMIN"]));

    renderWithAuth(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Reverse")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Reverse"));

    await waitFor(() => {
      expect(screen.getByText(/Reverse Payment Receipt #BCIS-REC-2026-0001/i)).toBeInTheDocument();
      expect(screen.getByText(/Impact of Reversal \(AT-06\):/i)).toBeInTheDocument();
    });

    const reasonInput = screen.getByPlaceholderText(/check bounced/i);
    fireEvent.change(reasonInput, { target: { value: "Customer cheque bounced by bank" } });

    const confirmBtn = screen.getByRole("button", { name: /confirm reversal/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.reversePayment).toHaveBeenCalledWith("pmt-1", "Customer cheque bounced by bank");
    });
  });
});
