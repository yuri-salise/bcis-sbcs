import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CreditCard,
  RefreshCw,
  Search,
  Eye,
  RotateCcw,
  Printer,
  X,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Receipt,
  FileCheck,
} from "lucide-react";
import {
  api,
  type Payment,
  type PaymentMethod,
  type Subscriber,
  type PaymentAllocationPreviewResult,
} from "../../api/client";
import { useAuth } from "../auth/AuthContext";
import { cn, formatMoney } from "../../lib/utils";

export function PaymentsPage() {
  const { hasPermission } = useAuth();
  const canCreatePayment = hasPermission("payment.create");
  const canReversePayment = hasPermission("payment.reverse");

  // State: Payments List
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [methodFilter, setMethodFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // State: Modals
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Payment | null>(null);
  const [reversalPayment, setReversalPayment] = useState<Payment | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversing, setReversing] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  // State: Receive Payment Form
  const [subscribersList, setSubscribersList] = useState<Subscriber[]>([]);
  const [subSearch, setSubSearch] = useState("");
  const [selectedSub, setSelectedSub] = useState<Subscriber | null>(null);
  const [amountPaid, setAmountPaid] = useState("");
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // State: Allocation Preview
  const [previewResult, setPreviewResult] = useState<PaymentAllocationPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch Payments List
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listPayments({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        paymentMethod: methodFilter || undefined,
        page,
        limit: 10,
      });
      setPayments(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err) {
      console.error("Failed to load payments", err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, methodFilter, page]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Load Subscribers for Payment Picker
  const searchSubscribers = useCallback(async (query: string) => {
    try {
      const res = await api.listSubscribers({
        search: query.trim() || undefined,
        status: "ACTIVE",
        limit: 8,
      });
      setSubscribersList(res.data);
    } catch (err) {
      console.error("Failed to fetch subscribers", err);
    }
  }, []);

  useEffect(() => {
    if (showReceiveModal) {
      searchSubscribers(subSearch);
    }
  }, [showReceiveModal, subSearch, searchSubscribers]);

  // Calculate live change for CASH
  const changeDue = useMemo(() => {
    if (paymentMethod !== "CASH") return null;
    const tendered = parseFloat(tenderedAmount || "0");
    const amount = parseFloat(amountPaid || "0");
    if (isNaN(tendered) || isNaN(amount) || tendered < amount) return null;
    return (tendered - amount).toFixed(2);
  }, [paymentMethod, tenderedAmount, amountPaid]);

  // Compute live oldest-first preview when selectedSub or amountPaid changes
  useEffect(() => {
    if (!selectedSub || !amountPaid || parseFloat(amountPaid) <= 0) {
      setPreviewResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const preview = await api.previewPaymentAllocation({
          subscriberId: selectedSub.id,
          amount: parseFloat(amountPaid).toFixed(2),
        });
        setPreviewResult(preview);
      } catch (err) {
        console.error("Preview allocation error", err);
        setPreviewResult(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [selectedSub, amountPaid]);

  // Handle Receive Payment Submission
  const handlePostPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub) {
      setPaymentError("Please select a subscriber to receive payment from.");
      return;
    }
    const parsedAmount = parseFloat(amountPaid);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setPaymentError("Please enter a valid payment amount greater than zero.");
      return;
    }

    if (paymentMethod === "CASH" && tenderedAmount) {
      const tendered = parseFloat(tenderedAmount);
      if (tendered < parsedAmount) {
        setPaymentError("Tendered cash cannot be less than the payment amount.");
        return;
      }
    }

    if (
      (paymentMethod === "GCASH" || paymentMethod === "BANK_TRANSFER" || paymentMethod === "CHECK") &&
      !referenceNumber.trim()
    ) {
      setPaymentError(`Reference number is required for ${paymentMethod} payments.`);
      return;
    }

    setSubmittingPayment(true);
    setPaymentError(null);

    try {
      const result = await api.createPayment({
        subscriberId: selectedSub.id,
        paymentMethod,
        referenceNumber: referenceNumber.trim() || undefined,
        amountPaid: parsedAmount.toFixed(2),
        tenderedAmount:
          paymentMethod === "CASH" && tenderedAmount ? parseFloat(tenderedAmount).toFixed(2) : undefined,
        notes: paymentNotes.trim() || undefined,
      });

      // Close receive modal and reset form
      setShowReceiveModal(false);
      setSelectedSub(null);
      setAmountPaid("");
      setTenderedAmount("");
      setReferenceNumber("");
      setPaymentNotes("");
      setPreviewResult(null);

      // Refresh list
      await fetchPayments();

      // Open newly minted receipt modal immediately
      const fullPayment = await api.getPaymentById(result.payment.id);
      setSelectedReceipt(fullPayment);
    } catch (err: any) {
      setPaymentError(err.message || "Failed to process payment");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Handle Payment Reversal (AT-06)
  const handleConfirmReversal = async () => {
    if (!reversalPayment) return;
    if (!reversalReason.trim() || reversalReason.trim().length < 5) {
      setReversalError("A valid operational reason (at least 5 characters) is required.");
      return;
    }

    setReversing(true);
    setReversalError(null);

    try {
      await api.reversePayment(reversalPayment.id, reversalReason.trim());
      setReversalPayment(null);
      setReversalReason("");
      await fetchPayments();
    } catch (err: any) {
      setReversalError(err.message || "Failed to reverse payment");
    } finally {
      setReversing(false);
    }
  };

  // Metrics summary
  const metrics = useMemo(() => {
    const totalCollected = payments
      .filter((p) => !p.isReversed)
      .reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);
    const totalAdvance = payments
      .filter((p) => !p.isReversed)
      .reduce((sum, p) => sum + parseFloat(p.advanceAmount || "0"), 0);
    const totalReversed = payments.filter((p) => p.isReversed).length;

    return {
      totalCollected: totalCollected.toFixed(2),
      totalAdvance: totalAdvance.toFixed(2),
      totalReversed,
      totalCount,
    };
  }, [payments, totalCount]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-indigo-600" />
            Payments & Collections
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Process payments, issue official receipts, preview oldest-first allocations, and manage reversals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchPayments()}
            disabled={loading}
            className="btn btn-secondary flex items-center gap-2"
            title="Refresh payments list"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>

          {canCreatePayment && (
            <button
              onClick={() => {
                setShowReceiveModal(true);
                setPaymentError(null);
              }}
              className="btn btn-primary flex items-center gap-2 shadow-sm"
            >
              <CreditCard className="w-4 h-4" />
              Receive Payment
            </button>
          )}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-semibold text-lg">
            ₱
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total In Current View
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatMoney(metrics.totalCollected)}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Records
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {metrics.totalCount}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <FileCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Advance Credits (Overpayment)
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatMoney(metrics.totalAdvance)}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Reversals Recorded
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {metrics.totalReversed}
            </p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search receipt #, subscriber name, account #, or reference #..."
              className="input pl-9 w-full text-sm"
            />
          </div>

          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => {
              setMethodFilter(e.target.value);
              setPage(1);
            }}
            className="input text-sm w-full sm:w-44"
          >
            <option value="">All Methods</option>
            <option value="CASH">Cash</option>
            <option value="GCASH">GCash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="CHECK">Cheque</option>
            <option value="OTHER">Other</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="input text-sm w-full sm:w-40"
          >
            <option value="">All Statuses</option>
            <option value="POSTED">Posted</option>
            <option value="REVERSED">Reversed</option>
          </select>
        </div>
      </div>

      {/* Payments Table */}
      <div className="card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Receipt #</th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Subscriber</th>
                <th className="py-3.5 px-4">Method & Ref</th>
                <th className="py-3.5 px-4 text-right">Amount Paid</th>
                <th className="py-3.5 px-4 text-right">Allocated</th>
                <th className="py-3.5 px-4 text-right">Advance Credit</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Loading payments...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No payment transactions found matching your criteria.
                  </td>
                </tr>
              ) : (
                payments.map((pmt) => {
                  const subName = pmt.subscriber
                    ? `${pmt.subscriber.firstName} ${pmt.subscriber.lastName}${
                        pmt.subscriber.businessName ? ` (${pmt.subscriber.businessName})` : ""
                      }`
                    : "Unknown Subscriber";

                  return (
                    <tr
                      key={pmt.id}
                      className={cn(
                        "hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors",
                        pmt.isReversed && "bg-rose-50/20 dark:bg-rose-950/10 opacity-75"
                      )}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                        {pmt.receiptNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {pmt.paymentDate}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {subName}
                        </div>
                        <div className="text-xs font-mono text-slate-500">
                          {pmt.subscriber?.accountNumber}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                            pmt.paymentMethod === "CASH" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                            pmt.paymentMethod === "GCASH" && "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
                            pmt.paymentMethod === "BANK_TRANSFER" && "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
                            pmt.paymentMethod === "CHECK" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                            pmt.paymentMethod === "OTHER" && "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                          )}
                        >
                          {pmt.paymentMethod}
                        </span>
                        {pmt.referenceNumber && (
                          <div className="text-xs font-mono text-slate-500 mt-0.5">
                            Ref: {pmt.referenceNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoney(pmt.amountPaid)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300 font-mono">
                        {formatMoney(pmt.allocatedAmount)}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-600 dark:text-amber-400 font-mono">
                        {parseFloat(pmt.advanceAmount || "0") > 0
                          ? `+${formatMoney(pmt.advanceAmount)}`
                          : "₱0.00"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {pmt.isReversed ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            REVERSED
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            POSTED
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={async () => {
                            try {
                              const hydrated = await api.getPaymentById(pmt.id);
                              setSelectedReceipt(hydrated);
                            } catch (err) {
                              console.error("Failed to load receipt details", err);
                            }
                          }}
                          className="btn btn-secondary py-1 px-2.5 text-xs inline-flex items-center gap-1.5"
                          title="View Official Receipt"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Receipt
                        </button>

                        {canReversePayment && !pmt.isReversed && (
                          <button
                            onClick={() => {
                              setReversalPayment(pmt);
                              setReversalReason("");
                              setReversalError(null);
                            }}
                            className="btn py-1 px-2.5 text-xs inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/80 border border-rose-200 dark:border-rose-900"
                            title="Reverse Payment (Restores Invoices)"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reverse
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm">
            <span className="text-slate-500">
              Showing page {page} of {totalPages} ({totalCount} total payments)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn btn-secondary py-1 px-3 text-xs"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn btn-secondary py-1 px-3 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: RECEIVE PAYMENT (Oldest-First Live Preview & Change Calculator)   */}
      {/* ========================================================================= */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 my-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                  Receive & Allocate Payment
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Process subscriber payments with automatic oldest-first arrears allocation.
                </p>
              </div>
              <button
                onClick={() => setShowReceiveModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {paymentError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            <form onSubmit={handlePostPayment} className="space-y-5">
              {/* Subscriber Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  1. Select Subscriber *
                </label>
                {selectedSub ? (
                  <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {selectedSub.firstName} {selectedSub.lastName}
                        {selectedSub.businessName ? ` (${selectedSub.businessName})` : ""}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {selectedSub.accountNumber} • {selectedSub.primaryContactNumber}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSub(null);
                        setPreviewResult(null);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-medium underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={subSearch}
                      onChange={(e) => setSubSearch(e.target.value)}
                      placeholder="Type subscriber name or account number to search..."
                      className="input text-sm w-full"
                    />
                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                      {subscribersList.length === 0 ? (
                        <div className="p-3 text-xs text-slate-400 text-center">
                          No active subscribers found
                        </div>
                      ) : (
                        subscribersList.map((s) => (
                          <div
                            key={s.id}
                            onClick={() => setSelectedSub(s)}
                            className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {s.firstName} {s.lastName}
                              </span>
                              <span className="text-slate-400 ml-2 font-mono">
                                ({s.accountNumber})
                              </span>
                            </div>
                            <UserCheck className="w-4 h-4 text-slate-400" />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Method, Reference & Amounts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    2. Payment Method *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="input text-sm w-full"
                  >
                    <option value="CASH">Cash</option>
                    <option value="GCASH">GCash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHECK">Cheque</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Reference Number {paymentMethod !== "CASH" ? "*" : "(Optional)"}
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder={
                      paymentMethod === "GCASH"
                        ? "e.g. GCash Ref # (unique)"
                        : paymentMethod === "CHECK"
                        ? "e.g. Check Number"
                        : "Bank reference / slip #"
                    }
                    className="input text-sm w-full font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    3. Amount Paid (₱) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">
                      ₱
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder="0.00"
                      className="input pl-8 text-sm w-full font-mono font-semibold"
                      required
                    />
                  </div>
                </div>

                {paymentMethod === "CASH" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Tendered Cash (₱)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">
                        ₱
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={tenderedAmount}
                        onChange={(e) => setTenderedAmount(e.target.value)}
                        placeholder="e.g. 1000.00"
                        className="input pl-8 text-sm w-full font-mono"
                      />
                    </div>
                    {changeDue !== null && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                        Change Due: {formatMoney(changeDue)}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      placeholder="Optional memo or transaction note..."
                      className="input text-sm w-full"
                    />
                  </div>
                )}
              </div>

              {/* Oldest-First Allocation Live Preview */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-indigo-500" />
                    Oldest-First Allocation Projection
                  </span>
                  {previewLoading && (
                    <span className="text-slate-400 flex items-center gap-1 text-[11px] lowercase">
                      <RefreshCw className="w-3 h-3 animate-spin" /> calculating...
                    </span>
                  )}
                </div>

                {!selectedSub ? (
                  <p className="text-xs text-slate-400 italic">
                    Select a subscriber above to preview how this payment will allocate across open invoices.
                  </p>
                ) : !previewResult || previewResult.invoiceAllocations.length === 0 ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {parseFloat(amountPaid || "0") > 0 ? (
                      <p className="text-amber-600 dark:text-amber-400 font-medium">
                        No outstanding unpaid invoices. Full amount ({formatMoney(amountPaid || "0")}) will be credited as an advance surplus for future invoices.
                      </p>
                    ) : (
                      <p className="text-slate-400">Enter a payment amount to calculate invoice allocations.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="max-h-44 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          <tr>
                            <th className="py-2 px-3">Invoice</th>
                            <th className="py-2 px-3">Due Date</th>
                            <th className="py-2 px-3 text-right">Current Bal</th>
                            <th className="py-2 px-3 text-right text-indigo-600 dark:text-indigo-400">Applied</th>
                            <th className="py-2 px-3 text-right">New Bal</th>
                            <th className="py-2 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {previewResult.invoiceAllocations.map((alloc) => (
                            <tr key={alloc.invoiceId}>
                              <td className="py-2 px-3 font-mono font-medium">{alloc.invoiceNumber}</td>
                              <td className="py-2 px-3 text-slate-500">{alloc.dueDate}</td>
                              <td className="py-2 px-3 text-right font-mono">{formatMoney(alloc.currentBalance)}</td>
                              <td className="py-2 px-3 text-right font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                                {formatMoney(alloc.allocatedAmount)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono">{formatMoney(alloc.remainingBalance)}</td>
                              <td className="py-2 px-3 text-center">
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-semibold",
                                    alloc.resultingStatus === "PAID"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  )}
                                >
                                  {alloc.resultingStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Advance surplus notice if payment exceeds open invoices */}
                    {parseFloat(previewResult.advanceCredit) > 0 && (
                      <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
                        <span>Surplus advance credit (carried forward):</span>
                        <span className="font-bold font-mono">
                          +{formatMoney(previewResult.advanceCredit)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReceiveModal(false)}
                  className="btn btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayment || !selectedSub || parseFloat(amountPaid || "0") <= 0}
                  className="btn btn-primary text-sm flex items-center gap-2"
                >
                  {submittingPayment ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Posting Payment...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Post Payment & Issue Receipt
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PRINTABLE OFFICIAL RECEIPT                                       */}
      {/* ========================================================================= */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-xl w-full p-8 my-8 space-y-6 print:m-0 print:p-4 print:shadow-none print:max-w-none print:w-full">
            {/* Header / Actions in screen mode */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 print:hidden">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Official Receipt Preview
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="btn btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt
                </button>
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="btn btn-secondary py-1.5 px-3 text-xs"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Printable Receipt Area */}
            <div id="printable-receipt" className="space-y-6">
              {/* Receipt Header */}
              <div className="text-center space-y-1">
                <h2 className="text-xl font-black tracking-wide text-slate-900 uppercase">
                  Bukidnon Cable and Internet Services
                </h2>
                <p className="text-xs text-slate-500">
                  Fortich Street, Poblacion, Malaybalay City, Bukidnon 8700
                </p>
                <div className="pt-2">
                  <span className="inline-block px-3 py-1 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest rounded">
                    Official Receipt
                  </span>
                </div>
              </div>

              {/* Receipt Metadata */}
              <div className="grid grid-cols-2 gap-4 text-xs border-y border-slate-200 py-3">
                <div>
                  <span className="text-slate-500 block">Receipt Number:</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {selectedReceipt.receiptNumber}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">Payment Date:</span>
                  <span className="font-semibold text-slate-900">
                    {selectedReceipt.paymentDate}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Received From:</span>
                  <span className="font-bold text-slate-900">
                    {selectedReceipt.subscriber?.firstName} {selectedReceipt.subscriber?.lastName}
                    {selectedReceipt.subscriber?.businessName ? ` (${selectedReceipt.subscriber.businessName})` : ""}
                  </span>
                  <span className="font-mono text-slate-500 block">
                    Acct #: {selectedReceipt.subscriber?.accountNumber}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">Payment Method:</span>
                  <span className="font-semibold text-slate-900">
                    {selectedReceipt.paymentMethod}
                  </span>
                  {selectedReceipt.referenceNumber && (
                    <span className="font-mono text-slate-500 block">
                      Ref: {selectedReceipt.referenceNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* Invoice Allocations Breakdown */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Allocation Breakdown
                </p>
                <table className="w-full text-xs text-left">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-1">Description / Invoice</th>
                      <th className="py-1 text-right">Prev Balance</th>
                      <th className="py-1 text-right">Applied</th>
                      <th className="py-1 text-right">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedReceipt.allocations && selectedReceipt.allocations.length > 0 ? (
                      selectedReceipt.allocations.map((a) => (
                        <tr key={a.id}>
                          <td className="py-1.5 font-mono font-medium">
                            {a.invoice?.invoiceNumber || a.invoiceId}
                          </td>
                          <td className="py-1.5 text-right font-mono">
                            {formatMoney(a.previousInvoiceBalance)}
                          </td>
                          <td className="py-1.5 text-right font-mono font-bold text-slate-900">
                            {formatMoney(a.allocatedAmount)}
                          </td>
                          <td className="py-1.5 text-right font-mono">
                            {formatMoney(a.remainingInvoiceBalance)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-2 text-slate-400 italic">
                          Direct advance payment credit without immediate invoice allocation.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Total & Summary */}
              <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-500">Total Invoices Satisfied:</span>
                  <span className="font-mono font-semibold">
                    {formatMoney(selectedReceipt.allocatedAmount)}
                  </span>
                </div>
                {parseFloat(selectedReceipt.advanceAmount || "0") > 0 && (
                  <div className="flex justify-between font-medium text-amber-700">
                    <span>Advance Credit (Overpayment):</span>
                    <span className="font-mono font-semibold">
                      +{formatMoney(selectedReceipt.advanceAmount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black border-t border-slate-900 pt-2 text-slate-900">
                  <span>TOTAL AMOUNT PAID:</span>
                  <span className="font-mono font-bold">
                    {formatMoney(selectedReceipt.amountPaid)}
                  </span>
                </div>
                {selectedReceipt.tenderedAmount && (
                  <div className="flex justify-between text-slate-500 pt-1">
                    <span>Cash Tendered: {formatMoney(selectedReceipt.tenderedAmount)}</span>
                    <span>Change Given: {formatMoney(selectedReceipt.changeAmount || "0.00")}</span>
                  </div>
                )}
              </div>

              {/* Signatures Footer */}
              <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs">
                <div>
                  <div className="border-b border-slate-300 pb-8"></div>
                  <span className="text-slate-500 mt-1 block">Subscriber Signature</span>
                </div>
                <div>
                  <div className="border-b border-slate-300 pb-8">
                    <span className="font-semibold text-slate-900">
                      {selectedReceipt.cashier?.displayName || selectedReceipt.cashier?.username || "Cashier"}
                    </span>
                  </div>
                  <span className="text-slate-500 mt-1 block">Authorized Cashier</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: REVERSE PAYMENT (AT-06 Supervisor / Admin Protected)             */}
      {/* ========================================================================= */}
      {reversalPayment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/60 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Reverse Payment Receipt #{reversalPayment.receiptNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Permanent operational reversal with immutable audit trail.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-300 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Impact of Reversal (AT-06):
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-400 pl-1">
                <li>All invoices allocated by this payment will be re-opened to UNPAID/PARTIALLY_PAID.</li>
                <li>Invoice cached balance due and service account balance due will be restored.</li>
                <li>An offsetting compensatory DEBIT of {formatMoney(reversalPayment.amountPaid)} will be posted to the subscriber ledger.</li>
              </ul>
            </div>

            {reversalError && (
              <div className="p-3 bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 rounded-lg text-xs">
                {reversalError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Mandatory Reversal Reason * (min 5 chars)
              </label>
              <textarea
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="e.g. Check bounced, erroneous cashier entry, customer bank chargeback..."
                className="input text-sm w-full h-24 resize-none"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReversalPayment(null)}
                className="btn btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReversal}
                disabled={reversing || reversalReason.trim().length < 5}
                className="btn text-sm bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2"
              >
                {reversing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Reversing Payment...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    Confirm Reversal
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
