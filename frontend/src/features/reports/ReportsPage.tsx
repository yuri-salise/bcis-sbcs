import React, { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  BarChart3,
  Scale,
  Clock,
  FileText,
  Award,
  CreditCard,
  Users,
  RotateCcw,
  ShieldCheck,
  FileSpreadsheet,
  FileDown,
  Printer,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  api,
  type DailyCollectionReport,
  type MonthlyCollectionReport,
  type BillingVsCollectionReport,
  type FullAgingReport,
  type SubscriberSOA,
  type CollectorPerformanceReport,
  type PaymentMethodSummaryReport,
  type SubscriberMasterListReport,
  type PaymentReversalsReport,
  type AuditActivityReport,
} from "../../api/client";
import { SubscriberCombobox } from "../subscribers/SubscriberCombobox";
import { SubscriberLedgerModal } from "../subscribers/SubscriberLedgerModal";

export type ReportCategory =
  | "DAILY_COLLECTION"
  | "MONTHLY_COLLECTION"
  | "BILLING_VS_COLLECTION"
  | "AR_AGING"
  | "SOA"
  | "COLLECTOR_PERFORMANCE"
  | "PAYMENT_METHOD_SUMMARY"
  | "SUBSCRIBER_MASTER_LIST"
  | "PAYMENT_REVERSALS"
  | "AUDIT_ACTIVITY";

export const ReportsPage: React.FC = () => {
  const [activeReport, setActiveReport] = useState<ReportCategory>("DAILY_COLLECTION");
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const today = new Date().toISOString().slice(0, 10);
  const currentYm = new Date().toISOString().slice(0, 7);
  const [filterDate, setFilterDate] = useState<string>(today);
  const [filterYearMonth, setFilterYearMonth] = useState<string>(currentYm);
  const [filterStartDate, setFilterStartDate] = useState<string>(`${currentYm}-01`);
  const [filterEndDate, setFilterEndDate] = useState<string>(today);
  const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [soaSubscriberId, setSoaSubscriberId] = useState<string>("");
  const [ledgerSubscriberId, setLedgerSubscriberId] = useState<string | null>(null);

  // Report Data States
  const [dailyData, setDailyData] = useState<DailyCollectionReport | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyCollectionReport | null>(null);
  const [bvcData, setBvcData] = useState<BillingVsCollectionReport | null>(null);
  const [agingData, setAgingData] = useState<FullAgingReport | null>(null);
  const [soaData, setSoaData] = useState<SubscriberSOA | null>(null);
  const [collectorData, setCollectorData] = useState<CollectorPerformanceReport | null>(null);
  const [methodData, setMethodData] = useState<PaymentMethodSummaryReport | null>(null);
  const [subMasterData, setSubMasterData] = useState<SubscriberMasterListReport | null>(null);
  const [reversalsData, setReversalsData] = useState<PaymentReversalsReport | null>(null);
  const [auditData, setAuditData] = useState<AuditActivityReport | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  // Helper to format metadata/audit values without raw JSON
  const formatAuditValue = (val: any): string => {
    if (val === null || val === undefined) return "—";
    if (typeof val === "boolean") return val ? "True" : "False";
    if (typeof val === "object") {
      if (Array.isArray(val)) {
        return val.map((v) => formatAuditValue(v)).join(", ");
      }
      return Object.entries(val)
        .map(([k, v]) => `${k}: ${formatAuditValue(v)}`)
        .join("; ");
    }
    return String(val);
  };

  // Load report data based on active report type
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      switch (activeReport) {
        case "DAILY_COLLECTION": {
          const res = await api.getDailyCollectionReport({ date: filterDate });
          setDailyData(res);
          break;
        }
        case "MONTHLY_COLLECTION": {
          const res = await api.getMonthlyCollectionReport({ yearMonth: filterYearMonth });
          setMonthlyData(res);
          break;
        }
        case "BILLING_VS_COLLECTION": {
          const res = await api.getBillingVsCollectionReport({ year: filterYear });
          setBvcData(res);
          break;
        }
        case "AR_AGING": {
          const res = await api.getFullAgingReport({ asOfDate: filterDate });
          setAgingData(res);
          break;
        }
        case "SOA": {
          if (soaSubscriberId.trim()) {
            const res = await api.getSubscriberSOA(soaSubscriberId.trim(), filterDate);
            setSoaData(res);
          }
          break;
        }
        case "COLLECTOR_PERFORMANCE": {
          const res = await api.getCollectorPerformanceReport({
            startDate: filterStartDate,
            endDate: filterEndDate,
          });
          setCollectorData(res);
          break;
        }
        case "PAYMENT_METHOD_SUMMARY": {
          const res = await api.getPaymentMethodSummary({
            startDate: filterStartDate,
            endDate: filterEndDate,
          });
          setMethodData(res);
          break;
        }
        case "SUBSCRIBER_MASTER_LIST": {
          const res = await api.getSubscriberMasterList({ search: searchQuery });
          setSubMasterData(res);
          break;
        }
        case "PAYMENT_REVERSALS": {
          const res = await api.getPaymentReversalsReport({
            startDate: filterStartDate,
            endDate: filterEndDate,
          });
          setReversalsData(res);
          break;
        }
        case "AUDIT_ACTIVITY": {
          const res = await api.getAuditActivityReport({
            startDate: filterStartDate,
            endDate: filterEndDate,
          });
          setAuditData(res);
          break;
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch report data.");
    } finally {
      setLoading(false);
    }
  }, [
    activeReport,
    filterDate,
    filterYearMonth,
    filterStartDate,
    filterEndDate,
    filterYear,
    searchQuery,
    soaSubscriberId,
  ]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Export File Handler
  const handleExport = async (format: "xlsx" | "pdf" | "csv") => {
    setExporting(format);
    setError(null);
    try {
      const params: Record<string, any> = {};
      if (activeReport === "DAILY_COLLECTION") params.date = filterDate;
      if (activeReport === "MONTHLY_COLLECTION") params.yearMonth = filterYearMonth;
      if (activeReport === "BILLING_VS_COLLECTION") params.year = filterYear;
      if (activeReport === "AR_AGING") params.asOfDate = filterDate;
      if (activeReport === "SOA") {
        if (!soaSubscriberId) {
          throw new Error("Please specify a Subscriber ID for Statement of Account export.");
        }
        params.subscriberId = soaSubscriberId;
        params.asOfDate = filterDate;
      }
      if (["COLLECTOR_PERFORMANCE", "PAYMENT_METHOD_SUMMARY", "PAYMENT_REVERSALS", "AUDIT_ACTIVITY"].includes(activeReport)) {
        params.startDate = filterStartDate;
        params.endDate = filterEndDate;
      }
      if (activeReport === "SUBSCRIBER_MASTER_LIST") {
        params.search = searchQuery;
      }

      await api.downloadReportFile(activeReport, format, params);
    } catch (err: any) {
      setError(err.message || `Failed to export ${format.toUpperCase()} document.`);
    } finally {
      setExporting(null);
    }
  };

  const reportNavItems: Array<{ id: ReportCategory; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: "DAILY_COLLECTION", label: "Daily Collections", icon: Calendar },
    { id: "MONTHLY_COLLECTION", label: "Monthly Collections", icon: BarChart3 },
    { id: "BILLING_VS_COLLECTION", label: "Billing vs Collection", icon: Scale },
    { id: "AR_AGING", label: "AR Aging Analysis", icon: Clock },
    { id: "SOA", label: "Statement of Account", icon: FileText },
    { id: "COLLECTOR_PERFORMANCE", label: "Collector Performance", icon: Award },
    { id: "PAYMENT_METHOD_SUMMARY", label: "Payment Channels", icon: CreditCard },
    { id: "SUBSCRIBER_MASTER_LIST", label: "Subscriber Directory", icon: Users },
    { id: "PAYMENT_REVERSALS", label: "Payment Reversals", icon: RotateCcw },
    { id: "AUDIT_ACTIVITY", label: "Compliance & Audit", icon: ShieldCheck },
  ];

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)] max-w-7xl mx-auto print:max-w-none print:w-full print:block" data-testid="reports-page">
      {/* Left Sidebar: 10 Report Selectors */}
      <div className="w-full lg:w-64 bg-gray-50 border-r border-gray-200 p-4 space-y-1 no-print">
        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
          Financial & Audit Reports
        </div>
        {reportNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveReport(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-left transition-all active:scale-[0.98] ${
                activeReport === item.id
                  ? "bg-blue-600 text-white font-semibold shadow-xs"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              data-testid={`report-tab-${item.id}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 space-y-6 print:p-0 print:space-y-4 print-full-width">
        {/* Top Control Bar: Contextual Filters & Export Buttons */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
          {/* Filters depending on report */}
          <div className="flex flex-wrap items-center gap-3">
            {activeReport === "DAILY_COLLECTION" && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">Collection Date:</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-primary"
                  data-testid="input-filter-date"
                />
              </div>
            )}

            {activeReport === "MONTHLY_COLLECTION" && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">Year / Month:</label>
                <input
                  type="month"
                  value={filterYearMonth}
                  onChange={(e) => setFilterYearMonth(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-primary"
                  data-testid="input-filter-yearmonth"
                />
              </div>
            )}

            {activeReport === "BILLING_VS_COLLECTION" && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">Fiscal Year:</label>
                <input
                  type="number"
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="w-24 px-2.5 py-1.5 text-xs border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-primary"
                  data-testid="input-filter-year"
                />
              </div>
            )}

            {activeReport === "AR_AGING" && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">As of Date:</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-primary"
                  data-testid="input-filter-aging-date"
                />
              </div>
            )}

            {activeReport === "SOA" && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-64">
                  <SubscriberCombobox
                    value={null}
                    status="ALL"
                    placeholder="Search subscriber by name/account..."
                    onChange={(sub) => {
                      if (sub) {
                        setSoaSubscriberId(sub.id);
                      }
                    }}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-400">or ID:</span>
                  <input
                    type="text"
                    placeholder="Enter Subscriber UUID..."
                    value={soaSubscriberId}
                    onChange={(e) => setSoaSubscriberId(e.target.value)}
                    className="w-48 px-2.5 py-1.5 text-xs border border-gray-300 rounded-md shadow-xs focus:ring-1 focus:ring-primary font-mono"
                    data-testid="input-soa-subscriber-id"
                  />
                </div>
              </div>
            )}

            {["COLLECTOR_PERFORMANCE", "PAYMENT_METHOD_SUMMARY", "PAYMENT_REVERSALS", "AUDIT_ACTIVITY"].includes(activeReport) && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-gray-600">From:</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-md shadow-sm"
                  data-testid="input-filter-startdate"
                />
                <label className="text-xs font-medium text-gray-600">To:</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-md shadow-sm"
                  data-testid="input-filter-enddate"
                />
              </div>
            )}

            {activeReport === "SUBSCRIBER_MASTER_LIST" && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search account, name, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 px-2.5 py-1.5 text-xs border border-gray-300 rounded-md shadow-sm"
                  data-testid="input-filter-search"
                />
              </div>
            )}

            <button
              onClick={fetchReport}
              disabled={loading}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-md border border-gray-300"
              data-testid="apply-filter-btn"
            >
              {loading ? "Loading..." : "Update View"}
            </button>
          </div>

          {/* Export Actions Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-all"
              data-testid="print-report-btn"
              title="Print active report document directly"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              onClick={() => handleExport("xlsx")}
              disabled={!!exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50 transition-all cursor-pointer"
              data-testid="export-xlsx-btn"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{exporting === "xlsx" ? "Exporting..." : "Excel (XLSX)"}</span>
            </button>
            <button
              onClick={() => handleExport("pdf")}
              disabled={!!exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50 transition-all cursor-pointer"
              data-testid="export-pdf-btn"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{exporting === "pdf" ? "Exporting..." : "PDF Doc"}</span>
            </button>
            <button
              onClick={() => handleExport("csv")}
              disabled={!!exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 active:scale-95 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50 transition-all cursor-pointer"
              data-testid="export-csv-btn"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{exporting === "csv" ? "Exporting..." : "CSV (BOM)"}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-xs font-medium no-print">
            {error}
          </div>
        )}

        {/* Printable Official Header (Only rendered when printing) */}
        <div className="print-only mb-6 border-b-2 border-slate-950 pb-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-950">BUKIDNON CABLE & INTERNET SERVICES</h1>
              <p className="text-xs text-gray-700 font-semibold mt-0.5">
                Official Report: {reportNavItems.find((i) => i.id === activeReport)?.label || activeReport}
              </p>
              <p className="text-[11px] text-gray-500">Fortich Street, Poblacion, Malaybalay City, Bukidnon, Philippines</p>
            </div>
            <div className="text-right text-xs text-gray-600">
              <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-900 rounded font-bold text-[10px] uppercase">
                OFFICIAL REPORT
              </span>
              <p className="mt-1">Date Printed: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              <p className="text-[10px] text-gray-400">BCIS-SBCS Core Billing Engine</p>
            </div>
          </div>
        </div>

        {/* 1. Daily Collection Report Grid */}
        {activeReport === "DAILY_COLLECTION" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Date</span>
                <p className="text-lg font-bold text-gray-900">{dailyData?.date || filterDate}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Total Collections</span>
                <p className="text-lg font-bold text-emerald-600" data-testid="daily-total-collected">
                  {dailyData?.totalCollected || "₱0.00"}
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Transactions</span>
                <p className="text-lg font-bold text-gray-900">{dailyData?.totalTransactions || 0}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Receipt #</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Subscriber</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Method</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Reference #</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Cashier / Collector</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(dailyData?.items || []).map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono font-medium text-gray-900">{item.receiptNumber}</td>
                      <td className="px-4 py-2.5 text-gray-900 font-medium">{item.subscriberDisplayName}</td>
                      <td className="px-4 py-2.5 font-medium">{item.paymentMethod}</td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono">{item.referenceNumber}</td>
                      <td className="px-4 py-2.5 text-gray-600">{item.cashierName}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{item.amount}</td>
                    </tr>
                  ))}
                  {(dailyData?.items?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        No collections recorded for this date.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. Monthly Collection Report Grid */}
        {activeReport === "MONTHLY_COLLECTION" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Month Period</span>
                <p className="text-lg font-bold text-gray-900">{monthlyData?.yearMonth || filterYearMonth}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Total Month Collections</span>
                <p className="text-lg font-bold text-emerald-600">{monthlyData?.totalCollected || "₱0.00"}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Daily Average</span>
                <p className="text-lg font-bold text-gray-900">{monthlyData?.dailyAverage || "₱0.00"}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Peak Collection Day</span>
                <p className="text-sm font-bold text-gray-900">{monthlyData?.highestDay?.date || "—"}</p>
                <p className="text-xs text-emerald-600 font-semibold">{monthlyData?.highestDay?.amount || "₱0.00"}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Date</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Transactions</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Daily Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(monthlyData?.days || []).map((day) => (
                    <tr key={day.date} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{day.date}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{day.transactionsCount}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{day.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. Billing vs Collection Report */}
        {activeReport === "BILLING_VS_COLLECTION" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Total Billed</span>
                <p className="text-lg font-bold text-gray-900">{bvcData?.overall.totalBilled || "₱0.00"}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Total Collected</span>
                <p className="text-lg font-bold text-emerald-600">{bvcData?.overall.totalCollected || "₱0.00"}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Outstanding Balance</span>
                <p className="text-lg font-bold text-amber-600">{bvcData?.overall.outstandingBalance || "₱0.00"}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Overall Efficiency</span>
                <p className="text-lg font-bold text-indigo-600">{bvcData?.overall.collectionEfficiency || 0}%</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Cycle Code</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Period</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Invoices</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Total Billed</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Total Collected</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Outstanding</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Efficiency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(bvcData?.cycles || []).map((c) => (
                    <tr key={c.cycleId} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-bold text-gray-900">{c.cycleCode}</td>
                      <td className="px-4 py-2.5 text-gray-600">{c.startDate} to {c.endDate}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{c.invoicesCount} ({c.paidInvoicesCount} paid)</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{c.totalBilled}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{c.totalCollected}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-amber-600">{c.outstandingBalance}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-indigo-600">{c.collectionEfficiency}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. AR Aging Report */}
        {activeReport === "AR_AGING" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-[11px] text-gray-500 font-medium">Total Receivable</span>
                <p className="text-base font-bold text-gray-900">{agingData?.summary.totalReceivable || "₱0.00"}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-[11px] text-emerald-600 font-medium">Current</span>
                <p className="text-base font-bold text-emerald-700">{agingData?.summary.current.amount || "₱0.00"}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-[11px] text-blue-600 font-medium">1 - 30 Days</span>
                <p className="text-base font-bold text-blue-700">{agingData?.summary.days1to30.amount || "₱0.00"}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-[11px] text-amber-600 font-medium">31 - 60 Days</span>
                <p className="text-base font-bold text-amber-700">{agingData?.summary.days31to60.amount || "₱0.00"}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-[11px] text-orange-600 font-medium">61 - 90 Days</span>
                <p className="text-base font-bold text-orange-700">{agingData?.summary.days61to90.amount || "₱0.00"}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                <span className="text-[11px] text-rose-600 font-medium">&gt; 90 Days</span>
                <p className="text-base font-bold text-rose-700">{agingData?.summary.days90Plus.amount || "₱0.00"}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Account #</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Subscriber</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Area</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Current</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">1-30 D</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">31-60 D</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">61-90 D</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">&gt;90 D</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Total Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(agingData?.subscribers || []).map((s) => (
                    <tr key={s.subscriberId} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono font-bold text-gray-900">{s.subscriberAccountNumber}</td>
                      <td className="px-4 py-2.5 text-gray-900 font-medium">{s.displayName}</td>
                      <td className="px-4 py-2.5 text-gray-500">{s.areaName}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{s.current}</td>
                      <td className="px-4 py-2.5 text-right text-blue-600">{s.days1to30}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600">{s.days31to60}</td>
                      <td className="px-4 py-2.5 text-right text-orange-600">{s.days61to90}</td>
                      <td className="px-4 py-2.5 text-right text-rose-600 font-semibold">{s.days90Plus}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">{s.totalDue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. Statement of Account Viewer */}
        {activeReport === "SOA" && (
          <div className="space-y-4">
            {!soaData ? (
              <div className="bg-white p-8 rounded-xl border border-gray-200 text-center">
                <p className="text-gray-500 text-sm">
                  Please enter a Subscriber UUID in the toolbar above and click "Update View" to inspect their official Statement of Account.
                </p>
              </div>
            ) : (
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                <div className="flex justify-between items-start border-b border-gray-200 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{soaData.company.name}</h2>
                    <p className="text-xs text-gray-500">{soaData.company.address}</p>
                    <p className="text-xs text-gray-500">{soaData.company.contactNumber} • TIN: {soaData.company.tin}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold px-2 py-1 bg-primary text-white rounded">STATEMENT OF ACCOUNT</span>
                    <p className="text-xs text-gray-500 mt-1 font-mono font-medium">{soaData.statementNumber}</p>
                    <p className="text-xs text-gray-500">Date: {soaData.statementDate}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <p className="font-bold text-gray-800 uppercase tracking-wider mb-1">Subscriber Details</p>
                    <p className="font-semibold text-gray-900">{soaData.subscriber.displayName}</p>
                    <p className="text-gray-600">Account #: {soaData.subscriber.accountNumber}</p>
                    <p className="text-gray-600">Address: {soaData.subscriber.address}</p>
                    <p className="text-gray-600">Contact: {soaData.subscriber.mobileNumber}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex flex-col justify-between">
                    <div>
                      <p className="font-bold text-gray-800 uppercase tracking-wider mb-1">Billing Summary</p>
                      <div className="flex justify-between">
                        <span>Previous Balance:</span>
                        <span>{soaData.financialSummary.previousBalance}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Current Charges:</span>
                        <span>{soaData.financialSummary.currentCharges}</span>
                      </div>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-sm text-gray-900">
                      <span>Total Amount Due:</span>
                      <span className="text-rose-600">{soaData.financialSummary.totalAmountDue}</span>
                    </div>
                  </div>
                </div>

                {/* Ledger entries */}
                <div>
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Statement Ledger Activity</h3>
                  <table className="min-w-full divide-y divide-gray-200 text-xs border border-gray-100 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Description</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Debit</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Credit</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {soaData.ledger.map((e) => (
                        <tr key={e.entryNo}>
                          <td className="px-3 py-2 text-gray-500">{e.entryNo}</td>
                          <td className="px-3 py-2 text-gray-600">{e.postedAt}</td>
                          <td className="px-3 py-2 font-medium">{e.referenceType}</td>
                          <td className="px-3 py-2 text-gray-800">{e.description}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{e.debitAmount}</td>
                          <td className="px-3 py-2 text-right text-emerald-600">{e.creditAmount}</td>
                          <td className="px-3 py-2 text-right font-bold text-gray-900">{e.runningBalance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end items-center gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setLedgerSubscriberId(soaData.subscriber.id)}
                    className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-md text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>View Financial Ledger</span>
                  </button>
                  <button
                    onClick={() => handleExport("pdf")}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-semibold shadow-sm cursor-pointer"
                  >
                    Print / Download PDF Statement
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 6. Collector Performance */}
        {activeReport === "COLLECTOR_PERFORMANCE" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Batches Handled</span>
                <p className="text-lg font-bold text-gray-900">{collectorData?.overall.totalBatches || 0}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Expected Cash</span>
                <p className="text-lg font-bold text-gray-900">{collectorData?.overall.totalExpected || "₱0.00"}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Collected Cash</span>
                <p className="text-lg font-bold text-emerald-600">{collectorData?.overall.totalCollected || "₱0.00"}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Remitted Cash</span>
                <p className="text-lg font-bold text-indigo-600">{collectorData?.overall.totalRemitted || "₱0.00"}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Collector</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Area</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Batches</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Collected</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Remitted</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Shortage</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Accuracy %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(collectorData?.collectors || []).map((col) => (
                    <tr key={col.collectorId} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-bold text-gray-900">{col.name} ({col.collectorCode})</td>
                      <td className="px-4 py-2.5 text-gray-600">{col.assignedArea}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{col.batchesCount}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{col.collectedCash}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{col.remittedCash}</td>
                      <td className="px-4 py-2.5 text-right text-rose-600 font-medium">{col.shortageAmount}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-indigo-600">{col.remittanceAccuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7. Payment Channels */}
        {activeReport === "PAYMENT_METHOD_SUMMARY" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Total Channel Collections</span>
                <p className="text-lg font-bold text-emerald-600">{methodData?.totalAmount || "₱0.00"}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Total Transactions</span>
                <p className="text-lg font-bold text-gray-900">{methodData?.totalTransactions || 0}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Channel / Method</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Transactions</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Share %</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Average Ticket</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Total Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(methodData?.methods || []).map((m) => (
                    <tr key={m.method} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-bold text-gray-900">{m.method}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{m.count}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-indigo-600">{m.percentage}%</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{m.averageAmount}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{m.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 8. Subscriber Directory Master List */}
        {activeReport === "SUBSCRIBER_MASTER_LIST" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Account #</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Subscriber Name</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Contact</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Primary Area</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(subMasterData?.items || []).map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono font-bold text-gray-900">{sub.accountNumber}</td>
                      <td className="px-4 py-2.5 text-gray-900 font-medium">{sub.displayName}</td>
                      <td className="px-4 py-2.5 text-gray-600">{sub.contactNumber}</td>
                      <td className="px-4 py-2.5 text-gray-600">{sub.primaryArea}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-900">{sub.balanceDue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 9. Payment Reversals */}
        {activeReport === "PAYMENT_REVERSALS" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Total Reversed Amount</span>
                <p className="text-lg font-bold text-rose-600">{reversalsData?.totalReversedAmount || "₱0.00"}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Reversals Recorded</span>
                <p className="text-lg font-bold text-gray-900">{reversalsData?.totalCount || 0}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Receipt #</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Subscriber</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Reversed At</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Supervisor</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Reason</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(reversalsData?.items || []).map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono font-medium text-gray-900">{r.receiptNumber}</td>
                      <td className="px-4 py-2.5 text-gray-900 font-medium">{r.subscriberDisplayName}</td>
                      <td className="px-4 py-2.5 text-gray-500">{r.reversedAt}</td>
                      <td className="px-4 py-2.5 text-gray-700 font-medium">{r.reversedByName}</td>
                      <td className="px-4 py-2.5 text-rose-600">{r.reversalReason}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-rose-600">{r.amount}</td>
                    </tr>
                  ))}
                  {(reversalsData?.items?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        No reversed payments found in this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 10. Audit Activity Trail */}
        {activeReport === "AUDIT_ACTIVITY" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Occurred At</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Actor</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Action</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Entity Type</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Reason / Notes</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-600">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {(auditData?.items || []).map((a) => (
                    <React.Fragment key={a.id}>
                      <tr
                        onClick={() => setExpandedAuditId(expandedAuditId === a.id ? null : a.id)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        title="Click to view change details & metadata"
                      >
                        <td className="px-4 py-2.5 text-gray-500 font-mono whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="no-print text-gray-400">
                              {expandedAuditId === a.id ? (
                                <ChevronUp className="w-3.5 h-3.5 text-blue-600" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </span>
                            <span>{a.occurredAt ? a.occurredAt.replace("T", " ").slice(0, 19) : "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-gray-900">{a.actorName}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-800 font-mono">
                            {a.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{a.entityType}</td>
                        <td className="px-4 py-2.5 text-gray-600">{a.reason}</td>
                        <td className="px-4 py-2.5 text-gray-500 font-mono">{a.ipAddress}</td>
                      </tr>
                      {expandedAuditId === a.id && (
                        <tr className="bg-slate-50/70 border-b border-gray-200 no-print">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="space-y-3 text-xs">
                              <div className="flex flex-wrap items-center gap-4 text-gray-500">
                                <span>Entity ID: <strong className="font-mono text-gray-800">{a.entityId || "N/A"}</strong></span>
                                {a.requestId && (
                                  <span>Request ID: <strong className="font-mono text-gray-800">{a.requestId}</strong></span>
                                )}
                                <span>Username: <strong className="text-gray-800">{a.actorUsername}</strong></span>
                              </div>

                              {/* Formatted Changes: oldValues vs newValues */}
                              {(a.oldValues || a.newValues) && (
                                <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3 shadow-2xs">
                                  <p className="font-semibold text-gray-700 mb-2 text-[11px] uppercase tracking-wider">
                                    Audited Changes & Field Diffs
                                  </p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {a.oldValues && (
                                      <div className="bg-red-50/50 border border-red-100 rounded-md p-2.5">
                                        <span className="text-[10px] font-bold text-red-700 uppercase tracking-wide">Previous State</span>
                                        <div className="mt-1 space-y-1">
                                          {typeof a.oldValues === "object" && !Array.isArray(a.oldValues) ? (
                                            Object.entries(a.oldValues).map(([k, v]) => (
                                              <div key={k} className="flex items-start justify-between text-[11px] py-0.5 border-b border-red-100/50 last:border-0">
                                                <span className="text-gray-600 font-medium">{k}:</span>
                                                <span className="font-mono text-red-700">{formatAuditValue(v)}</span>
                                              </div>
                                            ))
                                          ) : (
                                            <p className="font-mono text-red-700 text-[11px]">{formatAuditValue(a.oldValues)}</p>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    {a.newValues && (
                                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-md p-2.5">
                                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Updated State</span>
                                        <div className="mt-1 space-y-1">
                                          {typeof a.newValues === "object" && !Array.isArray(a.newValues) ? (
                                            Object.entries(a.newValues).map(([k, v]) => (
                                              <div key={k} className="flex items-start justify-between text-[11px] py-0.5 border-b border-emerald-100/50 last:border-0">
                                                <span className="text-gray-600 font-medium">{k}:</span>
                                                <span className="font-mono text-emerald-700 font-semibold">{formatAuditValue(v)}</span>
                                              </div>
                                            ))
                                          ) : (
                                            <p className="font-mono text-emerald-700 text-[11px] font-semibold">{formatAuditValue(a.newValues)}</p>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Formatted Operational Metadata */}
                              {a.metadata && typeof a.metadata === "object" && Object.keys(a.metadata).length > 0 && (
                                <div className="bg-white rounded-lg border border-gray-200 p-2.5 shadow-2xs">
                                  <p className="font-semibold text-gray-700 mb-1.5 text-[11px] uppercase tracking-wider">
                                    Operational Metadata
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(a.metadata).map(([k, v]) => (
                                      <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-gray-800 text-[11px]">
                                        <span className="text-gray-500 font-medium">{k}:</span>
                                        <span className="font-semibold">{formatAuditValue(v)}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {(auditData?.items?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        No audit trail records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Printable Official Sign-Off Block (Only rendered when printing) */}
        <div className="print-only mt-10 pt-6 border-t border-gray-300">
          <div className="grid grid-cols-3 gap-8 text-xs text-gray-700">
            <div>
              <p className="font-semibold text-gray-900">Prepared & Extracted By:</p>
              <div className="mt-8 border-b border-gray-400 w-44"></div>
              <p className="text-[10px] text-gray-500 mt-1">Authorized Staff / Cashier</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Audited & Verified By:</p>
              <div className="mt-8 border-b border-gray-400 w-44"></div>
              <p className="text-[10px] text-gray-500 mt-1">Finance Officer / Supervisor</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Approved for Official Filing:</p>
              <div className="mt-8 border-b border-gray-400 w-44"></div>
              <p className="text-[10px] text-gray-500 mt-1">Station General Manager</p>
            </div>
          </div>
        </div>
      </div>

      {/* Subscriber Financial Ledger Modal */}
      <SubscriberLedgerModal
        subscriberId={ledgerSubscriberId}
        onClose={() => setLedgerSubscriberId(null)}
      />
    </div>
  );
};
