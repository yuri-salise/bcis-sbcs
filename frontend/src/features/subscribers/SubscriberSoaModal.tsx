import { useState, useEffect } from "react";
import {
  FileText,
  Printer,
  Download,
  X,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  FileSpreadsheet,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { api, type SubscriberSOA } from "../../api/client";

interface SubscriberSoaModalProps {
  subscriberId: string | null;
  asOfDate?: string;
  onClose: () => void;
  onOpenLedger?: (subscriberId: string) => void;
}

function formatMoney(amount: string | number | undefined): string {
  if (amount === undefined || amount === null) return "₱0.00";
  const num = typeof amount === "number" ? amount : parseFloat(amount.toString().replace(/,/g, ""));
  if (isNaN(num)) return "₱0.00";
  return `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SubscriberSoaModal({
  subscriberId,
  asOfDate,
  onClose,
  onOpenLedger,
}: SubscriberSoaModalProps) {
  const [data, setData] = useState<SubscriberSOA | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  useEffect(() => {
    if (!subscriberId) {
      setData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .getSubscriberSOA(subscriberId, asOfDate)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Failed to load Statement of Account:", err);
          setError(err instanceof Error ? err.message : "Failed to load Statement of Account");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [subscriberId, asOfDate]);

  if (!subscriberId) return null;

  const handleDownloadPdf = async () => {
    if (!subscriberId) return;
    setExportingPdf(true);
    try {
      await api.downloadReportFile("SOA", "pdf", {
        subscriberId,
        asOfDate,
      });
    } catch (err) {
      console.error("Failed to download SOA PDF:", err);
      alert(err instanceof Error ? err.message : "Failed to download PDF Statement");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDownloadXlsx = async () => {
    if (!subscriberId) return;
    setExportingXlsx(true);
    try {
      await api.downloadReportFile("SOA", "xlsx", {
        subscriberId,
        asOfDate,
      });
    } catch (err) {
      console.error("Failed to download SOA Excel:", err);
      alert(err instanceof Error ? err.message : "Failed to download Excel Statement");
    } finally {
      setExportingXlsx(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Toolbar Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Statement of Account (SOA)</h3>
                {data && (
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {data.statementNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Official billing statement, itemized invoices, payment records, and aging breakdown
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenLedger && data && (
              <button
                type="button"
                onClick={() => onOpenLedger(data.subscriber.id)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                <span>Financial Ledger</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={exportingPdf || loading || !data}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Download PDF Statement"
            >
              {exportingPdf ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadXlsx}
              disabled={exportingXlsx || loading || !data}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Download Excel Spreadsheet"
            >
              {exportingXlsx ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
              title="Print Statement"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Printable Statement Body */}
        <div className="p-8 space-y-6 overflow-y-auto flex-1 text-xs bg-white">
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center text-slate-500 gap-2.5">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-sm font-medium">Generating Statement of Account and aging summary...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <span className="font-semibold block text-sm">Failed to generate Statement of Account</span>
                <span className="text-xs text-rose-600 mt-0.5">{error}</span>
              </div>
            </div>
          ) : data ? (
            <>
              {/* Statement Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 pb-5 gap-4">
                <div>
                  <h1 className="text-lg font-black text-slate-900 tracking-wider">
                    {data.company.name}
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">{data.company.address}</p>
                  <p className="text-xs text-slate-500">
                    Contact: {data.company.contactNumber} &bull; Email: {data.company.email}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                    TIN: {data.company.tin} &bull; Non-VAT Registered
                  </p>
                </div>

                <div className="text-left sm:text-right space-y-1">
                  <span className="inline-block text-[11px] font-bold px-3 py-1 bg-slate-900 text-white rounded">
                    STATEMENT OF ACCOUNT
                  </span>
                  <div className="font-mono text-xs font-bold text-blue-600 mt-1">
                    {data.statementNumber}
                  </div>
                  <div className="text-xs text-slate-500">Statement Date: {data.statementDate}</div>
                  <div className="text-xs font-semibold text-rose-700">
                    Payment Due Date: {data.financialSummary.dueDate}
                  </div>
                </div>
              </div>

              {/* Subscriber & Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Subscriber Info */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Account Information
                  </span>
                  <div className="font-bold text-sm text-slate-900">
                    {data.subscriber.displayName}
                  </div>
                  <div className="font-mono text-xs text-slate-700">
                    Account #: <span className="font-bold">{data.subscriber.accountNumber}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Address: {data.subscriber.address}
                  </div>
                  <div className="text-xs text-slate-600">
                    Contact: {data.subscriber.mobileNumber || "N/A"}
                  </div>
                  <div className="pt-1">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        data.subscriber.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      Status: {data.subscriber.status}
                    </span>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between space-y-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Billing Summary
                    </span>
                    <div className="mt-2 space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Previous Balance:</span>
                        <span className="font-mono font-medium">
                          {data.financialSummary.previousBalance}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Current Charges:</span>
                        <span className="font-mono font-medium">
                          {data.financialSummary.currentCharges}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Total Amount Due</span>
                      <span className="text-[10px] text-slate-500">
                        Pay on or before {data.financialSummary.dueDate}
                      </span>
                    </div>
                    <span className="font-mono font-black text-xl text-rose-700">
                      {data.financialSummary.totalAmountDue}
                    </span>
                  </div>
                </div>
              </div>

              {/* AR Aging Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Delinquency & Accounts Receivable Aging</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-center">
                    <span className="text-[10px] text-slate-500 block font-medium">Current</span>
                    <span className="font-mono font-bold text-xs text-emerald-700">
                      {data.financialSummary.aging.current}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-center">
                    <span className="text-[10px] text-slate-500 block font-medium">1–30 Days</span>
                    <span className="font-mono font-bold text-xs text-blue-700">
                      {data.financialSummary.aging.days1to30}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-center">
                    <span className="text-[10px] text-slate-500 block font-medium">31–60 Days</span>
                    <span className="font-mono font-bold text-xs text-amber-700">
                      {data.financialSummary.aging.days31to60}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-center">
                    <span className="text-[10px] text-slate-500 block font-medium">61–90 Days</span>
                    <span className="font-mono font-bold text-xs text-orange-700">
                      {data.financialSummary.aging.days61to90}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-center col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-slate-500 block font-medium">90+ Days</span>
                    <span className="font-mono font-bold text-xs text-rose-700">
                      {data.financialSummary.aging.days90Plus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Service Accounts */}
              {data.serviceAccounts && data.serviceAccounts.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Active Service Subscriptions ({data.serviceAccounts.length})
                  </span>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                        <tr>
                          <th className="py-2 px-3">Service Account #</th>
                          <th className="py-2 px-3">Plan / Package</th>
                          <th className="py-2 px-3">Territory / Area</th>
                          <th className="py-2 px-3 text-right">Monthly Rate</th>
                          <th className="py-2 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.serviceAccounts.map((sa) => (
                          <tr key={sa.id} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-mono font-medium text-blue-600">
                              {sa.serviceAccountNumber}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900">{sa.planName}</td>
                            <td className="py-2 px-3 text-slate-600">{sa.area}</td>
                            <td className="py-2 px-3 text-right font-mono font-medium text-slate-900">
                              {formatMoney(sa.monthlyRate)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  sa.status === "ACTIVE"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}
                              >
                                {sa.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Itemized Invoices */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Invoices & Statement Balance ({data.invoices?.length || 0})
                </span>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                      <tr>
                        <th className="py-2 px-3">Invoice #</th>
                        <th className="py-2 px-3">Cycle</th>
                        <th className="py-2 px-3">Invoice Date</th>
                        <th className="py-2 px-3">Due Date</th>
                        <th className="py-2 px-3 text-right">Total Amount</th>
                        <th className="py-2 px-3 text-right">Balance Due</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {!data.invoices || data.invoices.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400 font-sans">
                            No open or past invoices on this statement.
                          </td>
                        </tr>
                      ) : (
                        data.invoices.map((inv) => (
                          <tr key={inv.invoiceNumber} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-bold text-slate-900">{inv.invoiceNumber}</td>
                            <td className="py-2 px-3 text-slate-600">{inv.cycleCode}</td>
                            <td className="py-2 px-3 text-slate-600 font-sans">{inv.invoiceDate}</td>
                            <td className="py-2 px-3 text-rose-700 font-sans">{inv.dueDate}</td>
                            <td className="py-2 px-3 text-right text-slate-900">{inv.totalAmount}</td>
                            <td className="py-2 px-3 text-right font-bold text-rose-700">
                              {inv.balanceDue}
                            </td>
                            <td className="py-2 px-3 text-center font-sans">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  inv.status === "PAID"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}
                              >
                                {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Policy Reminders */}
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Important Notice:</strong> Please settle your balance on or before the due date to avoid service interruption or disconnection. For payments via GCash or Bank Transfer, please present or upload proof of payment referencing your Account Number (<strong>{data.subscriber.accountNumber}</strong>).
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Bukidnon Cable & Internet Services &bull; Authorized Subscriber Statement
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
