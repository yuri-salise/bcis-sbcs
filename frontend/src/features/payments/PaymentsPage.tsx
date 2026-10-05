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
  Receipt,
  FileCheck,
  UploadCloud,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Layers,
} from "lucide-react";
import {
  api,
  type Payment,
  type PaymentMethod,
  type Subscriber,
  type PaymentAllocationPreviewResult,
  type SubscriberSOA,
} from "../../api/client";
import { SubscriberCombobox } from "../subscribers/SubscriberCombobox";
import { useAuth } from "../auth/AuthContext";
import { cn, formatMoney } from "../../lib/utils";
import { Modal } from "../../components/ui/Modal";

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
  const [selectedSub, setSelectedSub] = useState<Subscriber | null>(null);
  const [amountPaid, setAmountPaid] = useState("");
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // State: GCash Intake & Verification Security Protocol (AT-05)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>("");
  const [submitSenderName, setSubmitSenderName] = useState("");
  const [submitSenderMobile, setSubmitSenderMobile] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().split("T")[0] as string);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [submittingToQueue, setSubmittingToQueue] = useState(false);
  const [pendingGcashCount, setPendingGcashCount] = useState(0);
  const [queueSuccessNotice, setQueueSuccessNotice] = useState<string | null>(null);

  // State: Allocation Preview
  const [previewResult, setPreviewResult] = useState<PaymentAllocationPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [soaData, setSoaData] = useState<SubscriberSOA | null>(null);

  useEffect(() => {
    if (selectedSub) {
      if (typeof api.getSubscriberSOA === "function") {
        api
          .getSubscriberSOA(selectedSub.id)
          .then((res) => {
            if (res && res.financialSummary) {
              setSoaData(res);
            }
          })
          .catch((err) => {
            console.error(err);
            setSoaData(null);
          });
      }
    } else {
      setSoaData(null);
    }
  }, [selectedSub]);

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

  // Fetch Pending GCash Proofs Count
  const fetchPendingGcashCount = useCallback(async () => {
    try {
      const res = await api.listGcashQueue({ status: "PENDING", limit: 1 });
      setPendingGcashCount(res.pagination.total);
    } catch {
      // Ignore background error
    }
  }, []);

  useEffect(() => {
    fetchPayments();
    fetchPendingGcashCount();
  }, [fetchPayments, fetchPendingGcashCount]);

  const resetForm = () => {
    setSelectedSub(null);
    setAmountPaid("");
    setTenderedAmount("");
    setReferenceNumber("");
    setPaymentNotes("");
    setPreviewResult(null);
    setSelectedFile(null);
    setFileBase64("");
    setSubmitSenderName("");
    setSubmitSenderMobile("");
    setTransactionDate(new Date().toISOString().split("T")[0] as string);
    setPaymentError(null);
  };

  const handleFileChange = (file: File) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/pjpeg", "image/jpg", "application/pdf"];
    const hasValidExt = /\.(png|jpe?g|webp|pdf)$/i.test(file.name);
    if (!allowed.includes(file.type) && !hasValidExt) {
      setPaymentError("Invalid file type. Allowed formats: PNG, JPG, WebP, PDF (max 10MB).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPaymentError("File exceeds 10MB limit.");
      return;
    }
    setSelectedFile(file);
    setPaymentError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result as string;
      const base64String = resultStr.includes(",") ? resultStr.split(",")[1] : resultStr;
      if (base64String) setFileBase64(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (paymentMethod !== "GCASH") return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          handleFileChange(file);
          break;
        }
      }
    }
  };

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

  // Submit GCash Proof and immediately verify over-the-counter (AT-05 Compliant)
  const handleGcashSubmitAndVerify = async () => {
    if (!selectedSub) {
      setPaymentError("Please select a subscriber to receive payment from.");
      return;
    }
    const cleanRef = referenceNumber.trim();
    if (!cleanRef) {
      setPaymentError("GCash reference number is required (AT-05).");
      return;
    }
    const parsedAmount = parseFloat(amountPaid);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setPaymentError("Please enter a valid payment amount greater than zero.");
      return;
    }

    setSubmittingPayment(true);
    setPaymentError(null);

    try {
      if (selectedFile && fileBase64) {
        // 1. Submit proof to secure storage & create proof record with SHA-256
        const mime = selectedFile.type || (selectedFile.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png");
        const submitRes = await api.submitGcashProof({
          subscriberId: selectedSub.id,
          referenceNumber: cleanRef,
          amount: parsedAmount.toFixed(2),
          transactionDate: transactionDate || (new Date().toISOString().split("T")[0] as string),
          senderName: submitSenderName.trim() || undefined,
          senderMobile: submitSenderMobile.trim() || undefined,
          notes: paymentNotes.trim() || undefined,
          originalFilename: selectedFile.name || "gcash-receipt.png",
          mimeType: mime,
          fileBase64,
        });

        if (submitRes.isFlagged || submitRes.proof.verificationStatus === "FLAGGED") {
          throw new Error(
            submitRes.duplicateWarning ||
            `Duplicate GCash reference '${cleanRef}'. This reference has already been posted or verified (AT-05).`
          );
        }

        // 2. Immediately verify and post the payment (AT-05 Verified Counter Settlement)
        const verifyRes = await api.verifyGcashProof(submitRes.proof.id, {
          notes: paymentNotes.trim() ? `In-counter verified: ${paymentNotes.trim()}` : "In-counter verified at cashier desk",
        });

        // 3. Reset form and close modal
        setShowReceiveModal(false);
        resetForm();

        // 4. Refresh payments and pending count
        await fetchPayments();
        await fetchPendingGcashCount();

        // 5. Open Official Receipt Modal
        const fullPayment = await api.getPaymentById(verifyRes.payment.id);
        setSelectedReceipt(fullPayment);
      } else {
        // Direct Over-The-Counter GCash settlement without file attachment (AT-05 duplicate protected)
        const result = await api.createPayment({
          subscriberId: selectedSub.id,
          paymentMethod: "GCASH",
          referenceNumber: cleanRef,
          amountPaid: parsedAmount.toFixed(2),
          paymentDate: transactionDate || undefined,
          notes: paymentNotes.trim() || undefined,
        });

        setShowReceiveModal(false);
        resetForm();

        await fetchPayments();
        await fetchPendingGcashCount();

        const fullPayment = await api.getPaymentById(result.payment.id);
        setSelectedReceipt(fullPayment);
      }
    } catch (err: any) {
      setPaymentError(err.message || "Failed to process GCash payment.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Submit GCash Proof to Verification Queue (Asynchronous review)
  const handleGcashSubmitToQueue = async () => {
    if (!selectedSub) {
      setPaymentError("Please select a subscriber.");
      return;
    }
    const cleanRef = referenceNumber.trim();
    if (!cleanRef) {
      setPaymentError("GCash reference number is required (AT-05).");
      return;
    }
    const parsedAmount = parseFloat(amountPaid);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setPaymentError("Please enter a valid payment amount greater than zero.");
      return;
    }
    if (!selectedFile || !fileBase64) {
      setPaymentError("Receipt screenshot proof is strictly required for GCash payments (AT-05 Compliance).");
      return;
    }

    setSubmittingToQueue(true);
    setPaymentError(null);

    try {
      const res = await api.submitGcashProof({
        subscriberId: selectedSub.id,
        referenceNumber: cleanRef,
        amount: parsedAmount.toFixed(2),
        transactionDate: transactionDate || (new Date().toISOString().split("T")[0] as string),
        senderName: submitSenderName.trim() || undefined,
        senderMobile: submitSenderMobile.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
        originalFilename: selectedFile.name || "gcash-receipt.png",
        mimeType: selectedFile.type || (selectedFile.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png"),
        fileBase64,
      });

      setShowReceiveModal(false);
      resetForm();
      await fetchPendingGcashCount();

      setQueueSuccessNotice(
        `GCash proof submitted successfully (Ref #${res.proof.referenceNumber}). Added to the Verification Queue for review.`
      );
      setTimeout(() => setQueueSuccessNotice(null), 6000);
    } catch (err: any) {
      setPaymentError(err.message || "Failed to submit GCash proof.");
    } finally {
      setSubmittingToQueue(false);
    }
  };

  // Handle Receive Payment Submission
  const handlePostPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === "GCASH") {
      await handleGcashSubmitAndVerify();
      return;
    }

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
      (paymentMethod === "BANK_TRANSFER" || paymentMethod === "CHECK") &&
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
      resetForm();

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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-blue-600" />
            Payments & Collections
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Process payments, issue official receipts, preview oldest-first allocations, and manage reversals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchPayments();
              fetchPendingGcashCount();
            }}
            disabled={loading}
            className="btn btn-secondary text-sm"
            title="Refresh payments list"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>

          {canCreatePayment && (
            <button
              onClick={() => {
                resetForm();
                setPaymentMethod("GCASH");
                setShowReceiveModal(true);
              }}
              className="btn bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 hover:border-sky-300 font-medium text-sm shadow-sm"
              title="File and verify GCash payment proof with screenshot attachment"
            >
              <FileCheck className="w-4 h-4 text-sky-600" />
              File GCash Proof
            </button>
          )}

          {canCreatePayment && (
            <button
              onClick={() => {
                resetForm();
                setPaymentMethod("CASH");
                setShowReceiveModal(true);
              }}
              className="btn btn-primary text-sm"
            >
              <CreditCard className="w-4 h-4" />
              Receive Payment
            </button>
          )}
        </div>
      </div>

      {/* Toast Notice for Queue Submission */}
      {queueSuccessNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{queueSuccessNotice}</span>
          </div>
          <button
            onClick={() => setQueueSuccessNotice(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Notice Banner: Pending GCash Proofs in Queue */}
      {pendingGcashCount > 0 && (
        <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-between gap-3 text-xs text-sky-900 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <span className="font-semibold">{pendingGcashCount} pending GCash digital payment proof{pendingGcashCount > 1 ? "s" : ""}</span> awaiting verification in the GCash Verification tab.
            </div>
          </div>
          <span className="text-sky-700 font-semibold flex items-center gap-1 shrink-0">
            Check GCash tab
          </span>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4 hover:border-slate-300 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-semibold text-base shrink-0">
            ₱
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total In Current View
            </p>
            <p className="text-xl font-bold text-slate-900 tracking-tight tabular-nums">
              {formatMoney(metrics.totalCollected)}
            </p>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4 hover:border-slate-300 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Records
            </p>
            <p className="text-xl font-bold text-slate-900 tracking-tight tabular-nums">
              {metrics.totalCount}
            </p>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4 hover:border-slate-300 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Advance Credits (Overpayment)
            </p>
            <p className="text-xl font-bold text-slate-900 tracking-tight tabular-nums">
              {formatMoney(metrics.totalAdvance)}
            </p>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4 hover:border-slate-300 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Reversals Recorded
            </p>
            <p className="text-xl font-bold text-slate-900 tracking-tight tabular-nums">
              {metrics.totalReversed}
            </p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card p-4 bg-white border border-slate-200 shadow-xs space-y-4">
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
              className="input pl-9 w-full text-sm bg-white border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => {
              setMethodFilter(e.target.value);
              setPage(1);
            }}
            className="input text-sm w-full sm:w-44 bg-white border-slate-200 text-slate-700 focus:border-blue-500"
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
            className="input text-sm w-full sm:w-40 bg-white border-slate-200 text-slate-700 focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="POSTED">Posted</option>
            <option value="REVERSED">Reversed</option>
          </select>
        </div>
      </div>

      {/* Payments Table */}
      <div className="card bg-white border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
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
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
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
                        "hover:bg-slate-50/80 transition-colors",
                        pmt.isReversed && "bg-rose-50/30 opacity-75"
                      )}
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-blue-600">
                        {pmt.receiptNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {pmt.paymentDate}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
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
                            pmt.paymentMethod === "CASH" && "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
                            pmt.paymentMethod === "GCASH" && "bg-blue-50 text-blue-700 border border-blue-200/60",
                            pmt.paymentMethod === "BANK_TRANSFER" && "bg-purple-50 text-purple-700 border border-purple-200/60",
                            pmt.paymentMethod === "CHECK" && "bg-amber-50 text-amber-700 border border-amber-200/60",
                            pmt.paymentMethod === "OTHER" && "bg-slate-100 text-slate-700 border border-slate-200"
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
                      <td className="py-3 px-4 text-right font-semibold text-slate-900">
                        {formatMoney(pmt.amountPaid)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600 font-mono">
                        {formatMoney(pmt.allocatedAmount)}
                      </td>
                      <td className="py-3 px-4 text-right text-amber-600 font-mono">
                        {parseFloat(pmt.advanceAmount || "0") > 0
                          ? `+${formatMoney(pmt.advanceAmount)}`
                          : "₱0.00"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {pmt.isReversed ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            REVERSED
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            POSTED
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const hydrated = await api.getPaymentById(pmt.id);
                                setSelectedReceipt(hydrated);
                              } catch (err) {
                                console.error("Failed to load receipt details", err);
                              }
                            }}
                            className="btn btn-secondary !py-1 !px-2.5 text-xs"
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
                              className="btn !py-1 !px-2.5 text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                              title="Reverse Payment (Restores Invoices)"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Reverse
                            </button>
                          )}
                        </div>
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
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm">
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
      <Modal
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
        title="Receive & Allocate Payment"
        description="Process subscriber payments with automatic oldest-first arrears allocation."
        icon={<CreditCard className="w-6 h-6" />}
        maxWidth="2xl"
        actions={
          paymentMethod === "GCASH" ? (
            <div className="flex w-full items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowReceiveModal(false)}
                className="btn btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  submittingToQueue ||
                  !selectedSub ||
                  !selectedFile ||
                  !fileBase64 ||
                  !referenceNumber.trim() ||
                  parseFloat(amountPaid || "0") <= 0
                }
                onClick={handleGcashSubmitToQueue}
                className="btn btn-secondary text-sm"
                title="Submit proof to queue for later supervisor verification"
              >
                {submittingToQueue ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4" />
                    Submit to Queue
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={
                  submittingPayment ||
                  submittingToQueue ||
                  !selectedSub ||
                  !referenceNumber.trim() ||
                  parseFloat(amountPaid || "0") <= 0 ||
                  (selectedFile !== null && !fileBase64)
                }
                onClick={handleGcashSubmitAndVerify}
                className="btn btn-primary text-sm flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium active:scale-95 transition-all shadow-xs cursor-pointer"
                title="Verify GCash reference against AT-05 deduplication, allocate oldest-first, and issue Official Receipt"
              >
                {submittingPayment ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Verifying & Posting...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Submit & Verify (Issue Receipt)
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex w-full items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowReceiveModal(false)}
                className="btn btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="receive-payment-form"
                disabled={submittingPayment || !selectedSub || parseFloat(amountPaid || "0") <= 0}
                className="btn btn-primary text-sm"
              >
                {submittingPayment ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Post Payment & Issue Receipt
                  </>
                )}
              </button>
            </div>
          )
        }
      >
        <div className="space-y-6">
          {paymentError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{paymentError}</span>
            </div>
          )}

          <form id="receive-payment-form" onSubmit={handlePostPayment} onPaste={handlePaste} className="space-y-5">
            <SubscriberCombobox
              value={selectedSub}
              onChange={(sub) => {
                setSelectedSub(sub);
                if (!sub) setPreviewResult(null);
              }}
              label="1. Select Subscriber"
              required
              autoFocus
            />

            {soaData?.financialSummary && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5"><Layers className="w-4 h-4 text-blue-600" />Subscriber Account Snapshot</span>
                  <span className={cn("px-2 py-0.5 rounded-full font-bold", parseFloat(soaData.financialSummary.rawTotalAmountDue || "0") > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>
                    Total Due: {soaData.financialSummary.totalAmountDue || "₱0.00"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 mb-1 block">Subscribed Services:</span>
                    <ul className="space-y-1.5">
                      {(soaData.serviceAccounts || []).filter(sa => sa.status !== "TERMINATED" && sa.status !== "DISCONNECTED").map(sa => (
                         <li key={sa.id} className={cn("flex justify-between items-center p-2 border rounded shadow-xs", sa.status === "SUSPENDED" ? "bg-slate-50 border-slate-200" : "bg-white border-slate-200")}>
                           <div>
                             <p className={cn("font-semibold leading-tight flex items-center gap-1.5", sa.status === "SUSPENDED" ? "text-slate-500" : "text-slate-700")}>
                               {sa.planName}
                               {sa.status === "SUSPENDED" && (
                                 <span className="px-1.5 py-0.5 rounded-[4px] bg-amber-100 text-amber-700 text-[9px] uppercase tracking-wider font-bold">Suspended</span>
                               )}
                             </p>
                             <p className="text-[10px] text-slate-400 font-mono mt-0.5">{sa.serviceAccountNumber}</p>
                           </div>
                           <span className={cn("font-mono font-bold", sa.status === "SUSPENDED" ? "text-slate-400" : "text-blue-600")}>{sa.monthlyRate}</span>
                         </li>
                      ))}
                      {(soaData.serviceAccounts || []).filter(sa => sa.status !== "TERMINATED" && sa.status !== "DISCONNECTED").length === 0 && (
                        <li className="text-slate-500 italic p-2 border border-slate-100 rounded bg-white">No current services.</li>
                      )}
                    </ul>
                  </div>
                  <div>
                     <span className="text-slate-500 mb-1 block">Arrears / Aging:</span>
                     <div className="bg-white p-2.5 border border-slate-200 rounded shadow-xs space-y-1.5 font-medium">
                       <div className="flex justify-between items-center"><span className="text-slate-600">Current:</span> <span className="font-mono text-emerald-600">{soaData.financialSummary.aging?.current || "₱0.00"}</span></div>
                       <div className="flex justify-between items-center"><span className="text-slate-600">1-30 Days Overdue:</span> <span className="font-mono text-amber-600">{soaData.financialSummary.aging?.days1to30 || "₱0.00"}</span></div>
                       <div className="flex justify-between items-center"><span className="text-slate-600">31-60 Days Overdue:</span> <span className="font-mono text-orange-600">{soaData.financialSummary.aging?.days31to60 || "₱0.00"}</span></div>
                       <div className="flex justify-between items-center"><span className="text-slate-600">60+ Days Overdue:</span> <span className="font-mono text-rose-600">{soaData.financialSummary.aging?.days90Plus || "₱0.00"}</span></div>
                     </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="payment-method-select" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    2. Payment Method *
                  </label>
                  <select
                    id="payment-method-select"
                    value={paymentMethod}
                    onChange={(e) => {
                      setPaymentMethod(e.target.value as PaymentMethod);
                      setPaymentError(null);
                    }}
                    className="input text-sm w-full bg-white border-slate-200 text-slate-700 focus:border-blue-500"
                  >
                    <option value="CASH">Cash (Drawer)</option>
                    <option value="GCASH">GCash (Requires Screenshot Proof)</option>
                    <option value="BANK_TRANSFER">Bank Transfer (Deposit Slip)</option>
                    <option value="CHECK">Cheque</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    3. Amount Paid (₱) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder="0.00"
                      className="input pl-8 text-sm w-full font-mono font-semibold bg-white border-slate-200 text-slate-900 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>
              </div>

              {paymentMethod === "GCASH" ? (
                <div className="space-y-4 pt-1">
                  <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-900 space-y-0.5">
                      <p className="font-semibold text-blue-950">GCash Digital Settlement Protocol (AT-05 Compliance)</p>
                      <p className="text-blue-800/90 leading-relaxed">
                        To enforce strict separation of duties, GCash payments must be submitted to the verification queue and approved by an authorized verifier in the GCash tab. Direct OTC verification is disabled.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">GCash Reference Number *</label>
                      <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="e.g. 1029384756123" className="input text-sm w-full font-mono bg-white border-slate-200 text-slate-900 focus:border-blue-500" required />
                      <p className="text-[11px] text-slate-500 mt-1">13-digit reference from GCash receipt.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Transaction Date *</label>
                      <input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} className="input text-sm w-full bg-white border-slate-200 text-slate-900 focus:border-blue-500" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Sender Name (Optional)</label>
                      <input type="text" value={submitSenderName} onChange={(e) => setSubmitSenderName(e.target.value)} placeholder="e.g. Juan Dela Cruz" className="input text-sm w-full bg-white border-slate-200 text-slate-900 focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Sender Mobile (Optional)</label>
                      <input type="text" value={submitSenderMobile} onChange={(e) => setSubmitSenderMobile(e.target.value)} placeholder="e.g. 0917-123-4567" className="input text-sm w-full bg-white border-slate-200 text-slate-900 focus:border-blue-500" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Payment Notes / Memo (Optional)</label>
                      <input type="text" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="e.g. Customer present at counter" className="input text-sm w-full bg-white border-slate-200 text-slate-900 focus:border-blue-500" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <span>Receipt Screenshot / Proof File *</span>
                      <span className="text-[11px] text-blue-600 font-normal">Tip: Ctrl+V</span>
                    </label>
                    {!selectedFile ? (
                      <div onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }} onDragLeave={() => setIsDraggingFile(false)} onDrop={(e) => { e.preventDefault(); setIsDraggingFile(false); if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]); }} className={cn("border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer", isDraggingFile ? "border-blue-500 bg-blue-50/50" : "border-slate-300 hover:border-blue-400 bg-slate-50/60 hover:bg-slate-50")} onClick={() => document.getElementById("gcash-file-input-payments")?.click()}>
                        <input id="gcash-file-input-payments" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])} />
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-0.5"><UploadCloud className="w-5 h-5" /></div>
                          <p className="text-sm font-medium text-slate-800">Click to upload or drag & drop proof screenshot</p>
                          <p className="text-xs text-slate-500">PNG, JPG, WebP, or PDF up to 10MB • Or <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono shadow-2xs font-semibold">Ctrl+V</kbd> to paste</p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-blue-100/60 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0"><FileCheck className="w-5 h-5" /></div>
                          <div className="min-w-0"><p className="text-xs font-semibold text-slate-900 truncate">{selectedFile.name}</p><p className="text-[11px] text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</p></div>
                        </div>
                        <button type="button" onClick={() => { setSelectedFile(null); setFileBase64(""); }} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Reference Number {paymentMethod !== "CASH" ? "*" : "(Optional)"}</label>
                    <input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder={paymentMethod === "CHECK" ? "e.g. Check Number" : "Bank reference / deposit slip #"} className="input text-sm w-full font-mono bg-white border-slate-200 text-slate-900 focus:border-blue-500" />
                  </div>
                  {paymentMethod === "CASH" ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Tendered Cash (₱)</label>
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">₱</span><input type="number" step="0.01" min="0" value={tenderedAmount} onChange={(e) => setTenderedAmount(e.target.value)} placeholder="e.g. 1000.00" className="input pl-8 text-sm w-full font-mono bg-white border-slate-200 text-slate-900 focus:border-blue-500" /></div>
                      {changeDue !== null && <p className="text-xs text-emerald-600 font-semibold mt-1">Change Due: {formatMoney(changeDue)}</p>}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Notes</label>
                      <input type="text" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="Optional memo or transaction note..." className="input text-sm w-full bg-white border-slate-200 text-slate-900 focus:border-blue-500" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 uppercase tracking-wider">
                <span className="flex items-center gap-1.5"><Receipt className="w-4 h-4 text-blue-600" />Oldest-First Allocation Projection</span>
                {previewLoading && <span className="text-slate-400 flex items-center gap-1 text-[11px] lowercase"><RefreshCw className="w-3 h-3 animate-spin" /> calculating...</span>}
              </div>
              {!selectedSub ? (
                <p className="text-xs text-slate-500 italic">Select a subscriber above to preview how this payment will allocate.</p>
              ) : !previewResult || previewResult.invoiceAllocations.length === 0 ? (
                <div className="text-xs text-slate-500">{parseFloat(amountPaid || "0") > 0 ? <p className="text-amber-700 font-medium">Full amount will be credited as an advance surplus for future invoices.</p> : <p className="text-slate-500">Enter a payment amount to calculate invoice allocations.</p>}</div>
              ) : (
                <div className="space-y-2">
                  <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                        <tr><th className="py-2 px-3">Invoice</th><th className="py-2 px-3">Due Date</th><th className="py-2 px-3 text-right">Bal</th><th className="py-2 px-3 text-right text-blue-600">Applied</th><th className="py-2 px-3 text-right">New Bal</th><th className="py-2 px-3 text-center">Status</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewResult.invoiceAllocations.map((alloc) => (
                          <tr key={alloc.invoiceId}>
                            <td className="py-2 px-3 font-mono font-medium">{alloc.invoiceNumber}</td><td className="py-2 px-3 text-slate-500">{alloc.dueDate}</td><td className="py-2 px-3 text-right font-mono">{formatMoney(alloc.currentBalance)}</td><td className="py-2 px-3 text-right font-mono font-semibold text-blue-600">{formatMoney(alloc.allocatedAmount)}</td><td className="py-2 px-3 text-right font-mono">{formatMoney(alloc.remainingBalance)}</td>
                            <td className="py-2 px-3 text-center"><span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", alloc.resultingStatus === "PAID" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200")}>{alloc.resultingStatus}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parseFloat(previewResult.advanceCredit) > 0 && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center justify-between"><span>Surplus advance credit:</span><span className="font-bold font-mono">+{formatMoney(previewResult.advanceCredit)}</span></div>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: PRINTABLE OFFICIAL RECEIPT                                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        title="Official Receipt Preview"
        icon={<Receipt className="w-5 h-5 text-emerald-600" />}
        maxWidth="xl"
        actions={
          <div className="flex w-full items-center justify-end gap-2 print:hidden">
            <button
              onClick={() => setSelectedReceipt(null)}
              className="btn btn-secondary text-sm"
            >
              Close
            </button>
            <button
              onClick={() => window.print()}
              className="btn btn-primary text-sm flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Print Receipt
            </button>
          </div>
        }
      >
        {selectedReceipt && (
          <div id="printable-receipt" className="space-y-6 text-slate-900 print:text-black">
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
                <span className="font-semibold text-slate-900 inline-flex items-center justify-end gap-1">
                  {selectedReceipt.paymentMethod === "GCASH" && (
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600 inline" />
                  )}
                  {selectedReceipt.paymentMethod === "GCASH"
                    ? "GCash (Verified Digital Settlement)"
                    : selectedReceipt.paymentMethod}
                </span>
                {selectedReceipt.referenceNumber && (
                  <span className="font-mono text-slate-500 block">
                    Ref #: {selectedReceipt.referenceNumber}
                  </span>
                )}
              </div>
            </div>

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
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: REVERSE PAYMENT (AT-06 Supervisor / Admin Protected)             */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!reversalPayment}
        onClose={() => setReversalPayment(null)}
        title={reversalPayment ? `Reverse Payment Receipt #${reversalPayment.receiptNumber}` : "Reverse Payment"}
        description="Permanent operational reversal with immutable audit trail."
        icon={<AlertTriangle className="w-6 h-6 text-rose-600" />}
        maxWidth="lg"
        actions={
          <div className="flex w-full items-center justify-end gap-3">
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
              className="btn btn-danger text-sm"
            >
              {reversing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Reversing...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  Confirm Reversal
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5 text-rose-900">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              Impact of Reversal (AT-06):
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-600 pl-1">
              <li>All invoices allocated by this payment will be re-opened to UNPAID/PARTIALLY_PAID.</li>
              <li>Invoice cached balance due and service account balance due will be restored.</li>
              <li>An offsetting compensatory DEBIT of {reversalPayment && formatMoney(reversalPayment.amountPaid)} will be posted to the subscriber ledger.</li>
            </ul>
          </div>

          {reversalError && (
            <div className="p-3 bg-rose-100 text-rose-800 rounded-lg text-xs font-medium">
              {reversalError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Mandatory Reversal Reason * (min 5 chars)
            </label>
            <textarea
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="e.g. Check bounced, erroneous cashier entry, customer bank chargeback..."
              className="input text-sm w-full h-24 resize-none bg-white border-slate-200 text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              required
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
