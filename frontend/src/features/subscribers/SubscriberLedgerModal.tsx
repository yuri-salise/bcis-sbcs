import { useState, useEffect } from "react";
import {
  FileText,
  Printer,
  RefreshCw,
  Search,
  ExternalLink,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { api, type SubscriberLedgerResponse } from "../../api/client";
import { Modal } from "../../components/ui/Modal";

interface SubscriberLedgerModalProps {
  subscriberId: string | null;
  onClose: () => void;
  onOpenSoa?: (subscriberId: string) => void;
}

function formatMoney(amount: string | number | undefined): string {
  if (amount === undefined || amount === null) return "₱0.00";
  const num = typeof amount === "number" ? amount : parseFloat(amount.toString().replace(/,/g, ""));
  if (isNaN(num)) return "₱0.00";
  return `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SubscriberLedgerModal({
  subscriberId,
  onClose,
  onOpenSoa,
}: SubscriberLedgerModalProps) {
  const [data, setData] = useState<SubscriberLedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    if (!subscriberId) {
      setData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .getSubscriberLedger(subscriberId)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Failed to load subscriber ledger:", err);
          setError(err instanceof Error ? err.message : "Failed to load subscriber financial ledger");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [subscriberId]);

  if (!subscriberId) return null;

  const entries = data?.entries || [];
  const filteredEntries = entries.filter((e) => {
    const matchesType = filterType === "ALL" || e.referenceType === filterType;
    const matchesSearch =
      !searchTerm.trim() ||
      e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.referenceId && e.referenceId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      e.entryDate.includes(searchTerm);
    return matchesType && matchesSearch;
  });

  const currentBalance = data ? parseFloat(data.currentTotalBalance || "0") : 0;

  return (
    <Modal
      isOpen={!!subscriberId}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>Subscriber Financial Ledger</span>
          {data && (
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
              Account #{data.subscriber.accountNumber}
            </span>
          )}
        </div>
      }
      description="Authoritative double-entry transaction journal with verified mathematical running balance"
      icon={<FileText className="w-5 h-5" />}
      maxWidth="4xl"
      actions={
        <div className="flex w-full items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Official immutable financial record &bull; BCIS Financial Accounting Standard
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary text-sm"
            >
              Close
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-xs">
        <div className="flex items-center justify-end gap-2 border-b border-slate-100 pb-4 print:hidden">
            {onOpenSoa && data && (
              <button
                type="button"
                onClick={() => onOpenSoa(data.subscriber.id)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Statement of Account (SOA)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
              title="Print Ledger"
            >
              <Printer className="w-4 h-4" />
            </button>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2.5">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-sm font-medium">Calculating ledger balances and journals...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <span className="font-semibold block text-sm">Failed to retrieve financial ledger</span>
              <span className="text-xs text-rose-600 mt-0.5">{error}</span>
            </div>
          </div>
        ) : data ? (
          <>
            {/* Financial Metrics Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Account Holder
                </span>
                <div className="font-bold text-sm text-slate-900 mt-1">
                  {data.subscriber.lastName}, {data.subscriber.firstName}
                  {data.subscriber.middleName ? ` ${data.subscriber.middleName[0]}.` : ""}
                </div>
                {data.subscriber.businessName && (
                  <div className="text-[11px] text-slate-500 italic mt-0.5">
                    {data.subscriber.businessName}
                  </div>
                )}
                <div className="text-[11px] font-mono text-slate-400 mt-1">
                  {data.serviceAccounts.length} Service Account(s)
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Total Transactions
                </span>
                <div className="font-bold text-lg text-slate-900 mt-1">
                  {entries.length} Entries
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Immutable audited journal records
                </div>
              </div>

              <div
                className={`p-4 border rounded-lg ${
                  currentBalance > 0
                    ? "bg-rose-50 border-rose-200 text-rose-900"
                    : currentBalance < 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider">
                    Current Running Balance
                  </span>
                  <Wallet className="w-4 h-4 opacity-70" />
                </div>
                <div
                  className={`font-mono font-black text-xl mt-1 ${
                    currentBalance > 0
                      ? "text-rose-700"
                      : currentBalance < 0
                      ? "text-emerald-700"
                      : "text-slate-900"
                  }`}
                >
                  {formatMoney(currentBalance)}
                </div>
                <div className="text-[11px] opacity-75 mt-0.5">
                  {currentBalance > 0
                    ? "Outstanding amount due"
                    : currentBalance < 0
                    ? "Advance payment credit balance"
                    : "Account fully settled"}
                </div>
              </div>
            </div>

            {/* Filters & Search Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 print:hidden">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by description, reference, date..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-slate-500 font-medium">Type:</span>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="py-1 px-2.5 rounded-md border border-slate-200 bg-white text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="ALL">All Reference Types</option>
                  <option value="INVOICE">Invoices (Debits)</option>
                  <option value="PAYMENT">Payments (Credits)</option>
                  <option value="ADJUSTMENT">Adjustments</option>
                  <option value="REVERSAL">Reversals</option>
                </select>
              </div>
            </div>

            {/* Ledger Transactions Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Transaction Description</th>
                    <th className="py-2.5 px-3 text-right">Debit (+)</th>
                    <th className="py-2.5 px-3 text-right">Credit (-)</th>
                    <th className="py-2.5 px-3 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400 font-sans">
                        No ledger transactions found matching the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((e, idx) => {
                      const isDebit = parseFloat(e.debitAmount) > 0;
                      const isCredit = parseFloat(e.creditAmount) > 0;
                      const runBal = parseFloat(e.runningBalance);

                      return (
                        <tr key={e.id || idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            <span className="flex items-center gap-1.5 font-sans">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {e.entryDate}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                e.referenceType === "INVOICE"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                                  : e.referenceType === "PAYMENT"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : e.referenceType === "REVERSAL"
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {e.referenceType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-900 font-sans">
                            <div className="font-medium">{e.description}</div>
                            {e.serviceAccountNumber && (
                              <div className="text-[10px] font-mono text-slate-400">
                                Account: {e.serviceAccountNumber}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-900 whitespace-nowrap">
                            {isDebit ? (
                              <span className="inline-flex items-center gap-1 text-slate-900">
                                <ArrowUpRight className="w-3 h-3 text-slate-400" />
                                {formatMoney(e.debitAmount)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-emerald-700 whitespace-nowrap">
                            {isCredit ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <ArrowDownLeft className="w-3 h-3 text-emerald-500" />
                                {formatMoney(e.creditAmount)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                              runBal > 0
                                ? "text-rose-700"
                                : runBal < 0
                                ? "text-emerald-700"
                                : "text-slate-900"
                            }`}
                          >
                            {formatMoney(e.runningBalance)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
