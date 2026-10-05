import { useState, useEffect, useCallback, useRef } from "react";
import {
  Receipt,
  RefreshCw,
  Search,
  Eye,
  Calendar,
  CheckCircle2,
  Printer,
  FileText,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import {
  api,
  type BillingCycle,
  type Invoice,
  type BillingPreviewResponse,
} from "../../api/client";
import { useAuth } from "../auth/AuthContext";
import { cn, formatMoney } from "../../lib/utils";
import { SubscriberLedgerModal } from "../subscribers/SubscriberLedgerModal";

export function BillingPage() {
  const { hasPermission } = useAuth();
  const canGenerateBilling = hasPermission("billing.generate");
  const canViewLedger = hasPermission("subscriber.view");

  // State: Cycles
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [selectedCycleCode, setSelectedCycleCode] = useState<string>("");
  const hasInitializedCycle = useRef(false);

  // State: Invoices Table
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // State: Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [previewData, setPreviewData] = useState<BillingPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<string | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const [selectedSubscriberId, setSelectedSubscriberId] = useState<string | null>(null);

  // Fetch cycles
  const fetchCycles = useCallback(async () => {
    try {
      const data = await api.listBillingCycles();
      setCycles(data);
      if (!hasInitializedCycle.current && data.length > 0) {
        hasInitializedCycle.current = true;
        // default to first active or open cycle
        const openCycle = data.find((c) => c.status === "OPEN") || data[0];
        if (openCycle) setSelectedCycleCode(openCycle.cycleCode);
      }
    } catch (err) {
      console.error("Failed to load cycles", err);
    }
  }, []);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

  // Fetch Invoices
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listInvoices({
        cycleCode: selectedCycleCode || undefined,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        page,
        limit: 10,
      });
      setInvoices(result.data);
      setTotalPages(result.pagination.totalPages);
      setTotalCount(result.pagination.total);
    } catch (err) {
      console.error("Failed to load invoices", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCycleCode, statusFilter, search, page]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Handle open generation preview
  const handleOpenGenerate = async (cycleCodeToPreview: string) => {
    setShowGenerateModal(true);
    setPreviewLoading(true);
    setGenerationResult(null);
    try {
      const preview = await api.previewBillingGeneration(cycleCodeToPreview);
      setPreviewData(preview);
    } catch (err) {
      console.error("Preview failed", err);
      alert(err instanceof Error ? err.message : "Failed to load generation preview");
      setShowGenerateModal(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Execute Generation
  const executeGeneration = async () => {
    if (!previewData) return;
    setGenerating(true);
    setGenerationResult(null);
    try {
      const res = await api.generateMonthlyBilling(previewData.cycle.cycleCode);
      setGenerationResult(res.message);
      await fetchCycles();
      await fetchInvoices();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Billing generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // View Invoice Detail
  const openInvoiceDetail = async (id: string) => {
    try {
      const inv = await api.getInvoiceById(id);
      setSelectedInvoice(inv);
    } catch (err) {
      console.error("Failed to load invoice details", err);
    }
  };

  // View Subscriber Ledger
  const openLedger = (subscriberId: string) => {
    setSelectedSubscriberId(subscriberId);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Monthly Billing & Invoicing</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Authoritative billing engine, canonical invoice generation (AT-11), and financial ledger
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchInvoices()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>

          {canGenerateBilling && (
            <button
              onClick={() => {
                const targetCycle =
                  selectedCycleCode ||
                  cycles.find((c) => c.status === "OPEN")?.cycleCode ||
                  cycles[0]?.cycleCode ||
                  "2026-09";
                handleOpenGenerate(targetCycle);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Generate Monthly Billing
            </button>
          )}
        </div>
      </div>

      {/* Billing Cycles Horizontal Ribbon */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 shrink-0">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span>Billing Cycles:</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <button
            onClick={() => {
              setSelectedCycleCode("");
              setPage(1);
            }}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap cursor-pointer",
              selectedCycleCode === ""
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            All Cycles
          </button>

          {cycles.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedCycleCode(c.cycleCode);
                setPage(1);
              }}
              className={cn(
                "px-3 py-1 text-xs font-mono font-medium rounded-full transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer",
                selectedCycleCode === c.cycleCode
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              <span>{c.cycleCode}</span>
              <span
                className={cn(
                  "text-[9px] px-1.5 py-0.2 rounded-full font-sans uppercase font-bold",
                  c.status === "OPEN"
                    ? "bg-emerald-500 text-white"
                    : c.status === "GENERATED"
                    ? "bg-blue-200 text-blue-900"
                    : "bg-slate-400 text-white"
                )}
              >
                {c.status}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-3.5 border border-slate-200 rounded-lg shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by invoice #, subscriber, or account #..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 focus:border-blue-600 text-slate-900 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-600"
            >
              <option value="">All Statuses</option>
              <option value="UNPAID">Unpaid</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="PAID">Paid</option>
              <option value="OVERDUE">Overdue</option>
              <option value="VOID">Void</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoices Directory Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Subscriber / Account</th>
                <th className="py-3 px-4">Billing Cycle</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4 text-right">Total Amount</th>
                <th className="py-3 px-4 text-right">Balance Due</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-xs">
              {loading && invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                      <span>Loading invoices from database...</span>
                    </div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="w-8 h-8 text-slate-300" />
                      <span className="font-medium text-slate-900">No invoices found</span>
                      <p className="text-xs text-slate-400">
                        {selectedCycleCode
                          ? `No invoices have been generated yet for cycle ${selectedCycleCode}. Click 'Generate Monthly Billing' to bill active accounts.`
                          : search
                          ? "No invoices match your search criteria."
                          : "No invoices have been generated in the system yet."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-blue-600">
                      <button
                        onClick={() => openInvoiceDetail(inv.id)}
                        className="hover:underline cursor-pointer"
                      >
                        {inv.invoiceNumber}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">
                        {inv.subscriber?.lastName}, {inv.subscriber?.firstName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {inv.serviceAccount?.serviceAccountNumber} &bull;{" "}
                        {inv.servicePlan?.name || inv.serviceAccount?.servicePlan?.name}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {inv.billingCycle?.cycleCode || "—"}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {inv.dueDate}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatMoney(inv.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-red-600">
                      {formatMoney(inv.balanceDueCache)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border",
                          inv.status === "UNPAID" && "bg-amber-50 text-amber-700 border-amber-200",
                          inv.status === "PAID" && "bg-emerald-50 text-emerald-600 border-emerald-200",
                          inv.status === "PARTIALLY_PAID" && "bg-blue-50 text-blue-600 border-blue-200",
                          inv.status === "OVERDUE" && "bg-rose-50 text-red-600 border-rose-200",
                          inv.status === "VOID" && "bg-slate-100 text-slate-600 border-slate-300"
                        )}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openInvoiceDetail(inv.id)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                          title="View Invoice Statement"
                          aria-label="View Invoice Statement"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {canViewLedger && inv.subscriber && (
                          <button
                            onClick={() => openLedger(inv.subscriber!.id)}
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            title="View Subscriber Ledger"
                            aria-label="View Subscriber Ledger"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-900">{invoices.length}</span> of{" "}
            <span className="font-semibold text-slate-900">{totalCount}</span> invoices
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
            >
              Previous
            </button>
            <span className="px-2 font-mono">
              Page {page} of {Math.max(1, totalPages)}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL: Monthly Billing Generation (AT-11 Invariant)       */}
      {/* ========================================================= */}
      <Modal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        title="Monthly Billing Generation Engine"
        description="Idempotent automated billing generation for active accounts"
        icon={<Sparkles className="w-5 h-5 text-blue-600" />}
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs">
          {previewLoading || !previewData ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span>Computing eligible subscriptions for cycle...</span>
            </div>
          ) : (
            <>
              {generationResult ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Generation Completed</span>
                  </div>
                  <p>{generationResult}</p>
                  <button
                    onClick={() => setShowGenerateModal(false)}
                    className="mt-2 btn btn-primary"
                  >
                    Close & Review Invoices
                  </button>
                </div>
              ) : (
                <>
                  {/* Summary Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">
                        Billing Cycle
                      </span>
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {previewData.cycle.cycleCode}
                      </span>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <span className="text-[10px] text-blue-600 uppercase font-bold block">
                        Active Accounts
                      </span>
                      <span className="font-mono text-sm font-bold text-blue-600">
                        {previewData.totalActiveAccounts}
                      </span>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <span className="text-[10px] text-emerald-700 uppercase font-bold block">
                        To Bill Now
                      </span>
                      <span className="font-mono text-sm font-bold text-emerald-700">
                        {previewData.billableCount}
                      </span>
                    </div>
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <span className="text-[10px] text-purple-700 uppercase font-bold block">
                        Projected Sum
                      </span>
                      <span className="font-mono text-sm font-bold text-purple-700">
                        {formatMoney(previewData.estimatedTotalSum)}
                      </span>
                    </div>
                  </div>

                  {/* AT-11 Idempotency Status Banner */}
                  {previewData.alreadyBilledCount > 0 && (
                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-blue-900">
                        <AlertCircle className="w-4 h-4 text-blue-600" />
                        <span>AT-11 Invariant: {previewData.alreadyBilledCount} account(s) already invoiced</span>
                      </div>
                      <p className="text-[11px] text-blue-800">
                        The billing engine guarantees strict idempotency: accounts with existing invoices for this cycle will be safely skipped.
                      </p>
                    </div>
                  )}

                  {/* Billable Accounts List */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Accounts Scheduled for Invoicing ({previewData.billableAccounts.length})
                    </span>

                    {previewData.billableAccounts.length === 0 ? (
                      <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center text-slate-500">
                        All active accounts are already billed for cycle {previewData.cycle.cycleCode}.
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                        {previewData.billableAccounts.map((a) => (
                          <div
                            key={a.serviceAccountId}
                            className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50"
                          >
                            <div>
                              <span className="font-bold text-slate-900">{a.subscriberName}</span>
                              <span className="font-mono text-slate-500 block text-[11px]">
                                {a.serviceAccountNumber} &bull; {a.planName}
                              </span>
                            </div>
                            <div className="text-right font-mono font-bold text-slate-900">
                              {formatMoney(a.monthlyRate)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setShowGenerateModal(false)}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={executeGeneration}
                      disabled={generating || previewData.billableCount === 0}
                      className="btn btn-primary"
                    >
                      {generating
                        ? "Generating Invoices..."
                        : `Execute Billing (${previewData.billableCount} Accounts)`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: Printable Official Invoice Statement                */}
      {/* ========================================================= */}
      <Modal
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        title="Official Billing Statement"
        description="Printable statement of account"
        icon={<Receipt className="w-5 h-5 text-slate-700" />}
        maxWidth="2xl"
        actions={
          <div className="flex w-full items-center justify-between">
            <span className="text-[11px] text-slate-500">
              Official document &bull; BUKIDNON CABLE & INTERNET SERVICES
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="btn btn-secondary flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        {selectedInvoice && (
          <div className="space-y-6 text-xs bg-white">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <h1 className="text-lg font-black text-slate-900 tracking-wider">
                  BUKIDNON CABLE & INTERNET SERVICES
                </h1>
                <p className="text-[11px] text-slate-500">
                  Sayre Highway, Malaybalay City, Bukidnon &bull; Tel: (088) 813-1234
                </p>
                <p className="text-[10px] text-slate-400">
                  TIN: 402-123-456-000 &bull; Non-VAT Registered
                </p>
              </div>
              <div className="text-right">
                <div className="text-base font-black font-mono text-blue-600">
                  {selectedInvoice.invoiceNumber}
                </div>
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border mt-1",
                    selectedInvoice.status === "UNPAID" && "bg-amber-50 text-amber-700 border-amber-200",
                    selectedInvoice.status === "PAID" && "bg-emerald-50 text-emerald-700 border-emerald-200"
                  )}
                >
                  {selectedInvoice.status}
                </span>
              </div>
            </div>

            {/* Bill To & Metadata */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-500">Billed To:</span>
                <div className="font-bold text-sm text-slate-900">
                  {selectedInvoice.subscriber?.lastName}, {selectedInvoice.subscriber?.firstName}
                </div>
                {selectedInvoice.subscriber?.businessName && (
                  <div className="text-slate-600 italic">
                    {selectedInvoice.subscriber.businessName}
                  </div>
                )}
                <div className="text-slate-500">
                  {selectedInvoice.subscriber?.primaryAddress?.line1},{" "}
                  {selectedInvoice.subscriber?.primaryAddress?.barangay},{" "}
                  {selectedInvoice.subscriber?.primaryAddress?.cityMunicipality}
                </div>
                <div className="font-mono text-slate-500">
                  Contact: {selectedInvoice.subscriber?.primaryContactNumber}
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Service Account:</span>
                  <span className="font-bold text-slate-900">
                    {selectedInvoice.serviceAccount?.serviceAccountNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Billing Cycle:</span>
                  <span className="text-slate-900">
                    {selectedInvoice.billingCycle?.cycleCode}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice Date:</span>
                  <span className="text-slate-900">{selectedInvoice.invoiceDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment Due Date:</span>
                  <span className="font-bold text-red-600">{selectedInvoice.dueDate}</span>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {selectedInvoice.items?.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {item.description}
                        <span className="text-[10px] text-slate-500 block">
                          Type: {item.lineType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">{item.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {formatMoney(item.unitPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatMoney(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Totals */}
            <div className="flex justify-end pt-2">
              <div className="w-64 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span>{formatMoney(selectedInvoice.subtotal)}</span>
                </div>
                {parseFloat(selectedInvoice.penaltyTotal) > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Penalties:</span>
                    <span>+{formatMoney(selectedInvoice.penaltyTotal)}</span>
                  </div>
                )}
                {parseFloat(selectedInvoice.discountTotal) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discounts:</span>
                    <span>-{formatMoney(selectedInvoice.discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>Total Amount Due:</span>
                  <span className="text-blue-600">{formatMoney(selectedInvoice.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-xs text-red-600 font-bold">
                  <span>Balance Due:</span>
                  <span>{formatMoney(selectedInvoice.balanceDueCache)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <SubscriberLedgerModal
        subscriberId={selectedSubscriberId}
        onClose={() => setSelectedSubscriberId(null)}
      />
    </div>
  );
}
