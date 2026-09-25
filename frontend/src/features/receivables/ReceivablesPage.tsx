import React, { useState, useEffect, useCallback } from "react";
import {
  AlertCircle,
  Clock,
  Calendar,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  UserX,
  Wrench,
  History,
  TrendingDown,
  ShieldAlert,
} from "lucide-react";
import {
  api,
  type AgingReportSummary,
  type SubscriberAgingRow,
  type OverdueReceivableItem,
  type SuspensionCandidate,
  type ReconnectionWorkOrder,
  type ServiceHistoryEvent,
  type TechnicianUser,
  type CollectionArea,
} from "../../api/client";
import { useAuth } from "../auth/AuthContext";

type TabType = "aging" | "overdue" | "suspension" | "reconnections";

function formatMoney(amount: string | number | undefined): string {
  if (amount === undefined || amount === null) return "₱0.00";
  const num = typeof amount === "number" ? amount : parseFloat(amount.toString().replace(/,/g, ""));
  if (isNaN(num)) return "₱0.00";
  return `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReceivablesPage() {
  const { hasPermission } = useAuth();
  const canControl = hasPermission("service.control");

  const [activeTab, setActiveTab] = useState<TabType>("aging");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Common Filters
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [areas, setAreas] = useState<CollectionArea[]>([]);

  // 1. AR Aging State
  const [agingSummary, setAgingSummary] = useState<AgingReportSummary | null>(null);
  const [subscribersAging, setSubscribersAging] = useState<SubscriberAgingRow[]>([]);

  // 2. Overdue State
  const [overdueItems, setOverdueItems] = useState<OverdueReceivableItem[]>([]);
  const [totalOverdue, setTotalOverdue] = useState<string>("0.00");
  const [gracePeriodDays, setGracePeriodDays] = useState<number>(5);

  // 3. Suspension Candidates State
  const [candidates, setCandidates] = useState<SuspensionCandidate[]>([]);
  const [thresholds, setThresholds] = useState<{
    gracePeriodDays: number;
    suspensionThresholdAmount: string;
    suspensionThresholdOverdueDays: number;
  }>({
    gracePeriodDays: 5,
    suspensionThresholdAmount: "1500.00",
    suspensionThresholdOverdueDays: 30,
  });

  // 4. Reconnections State
  const [workOrders, setWorkOrders] = useState<ReconnectionWorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianUser[]>([]);
  const [reconStatusFilter, setReconStatusFilter] = useState<string>("ALL");

  // Modals State
  const [selectedCandidate, setSelectedCandidate] = useState<SuspensionCandidate | null>(null);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState("NON_PAYMENT: Overdue balance exceeds policy threshold.");
  const [suspendNotes, setSuspendNotes] = useState("");
  const [submittingSuspend, setSubmittingSuspend] = useState(false);

  const [reconnectServiceAccountId, setReconnectServiceAccountId] = useState<string | null>(null);
  const [reconnectAccountName, setReconnectAccountName] = useState<string>("");
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const [reconFee, setReconFee] = useState("300.00");
  const [reconImmediate, setReconImmediate] = useState(true);
  const [reconTechId, setReconTechId] = useState("");
  const [reconScheduledAt, setReconScheduledAt] = useState("");
  const [reconNotes, setReconNotes] = useState("");
  const [submittingReconnect, setSubmittingReconnect] = useState(false);

  const [completeOrderId, setCompleteOrderId] = useState<string | null>(null);
  const [completeOrderNumber, setCompleteOrderNumber] = useState<string>("");
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeNotes, setCompleteNotes] = useState("");
  const [submittingComplete, setSubmittingComplete] = useState(false);

  const [historyServiceAccountId, setHistoryServiceAccountId] = useState<string | null>(null);
  const [historyAccountName, setHistoryAccountName] = useState<string>("");
  const [historyEvents, setHistoryEvents] = useState<ServiceHistoryEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Load collection areas
  useEffect(() => {
    api.listCollectionAreas().then(setAreas).catch(() => {});
    if (canControl) {
      api.listTechnicians().then((res) => setTechnicians(res.data)).catch(() => {});
    }
  }, [canControl]);

  // Load data based on active tab
  const loadTabData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "aging") {
        const res = await api.getAgingReport({
          asOfDate,
          collectionAreaId: areaFilter || undefined,
          search: search || undefined,
        });
        setAgingSummary(res.summary);
        setSubscribersAging(res.subscribers);
      } else if (activeTab === "overdue") {
        const res = await api.getOverdueReceivables({
          asOfDate,
          collectionAreaId: areaFilter || undefined,
          search: search || undefined,
        });
        setOverdueItems(res.data);
        setTotalOverdue(res.totalOverdue);
        setGracePeriodDays(res.gracePeriodDays);
      } else if (activeTab === "suspension") {
        const res = await api.getSuspensionCandidates({
          asOfDate,
          collectionAreaId: areaFilter || undefined,
          search: search || undefined,
        });
        setCandidates(res.data);
        setThresholds(res.thresholds);
      } else if (activeTab === "reconnections") {
        const res = await api.listReconnections({
          status: reconStatusFilter === "ALL" ? undefined : reconStatusFilter,
        });
        setWorkOrders(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load receivables data.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [activeTab, asOfDate, areaFilter, search, reconStatusFilter]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  // Handle Suspend Action
  const handleOpenSuspendModal = (c: SuspensionCandidate) => {
    setSelectedCandidate(c);
    setSuspendReason("NON_PAYMENT: Overdue balance exceeds policy threshold.");
    setSuspendNotes("");
    setShowSuspendModal(true);
  };

  const handleConfirmSuspend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;
    setSubmittingSuspend(true);
    try {
      const res = await api.suspendServiceAccount(selectedCandidate.serviceAccountId, {
        reason: suspendReason,
        notes: suspendNotes || undefined,
        effectiveDate: asOfDate,
      });
      showToast(res.message || "Service account suspended successfully.");
      setShowSuspendModal(false);
      setSelectedCandidate(null);
      await loadTabData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to suspend service account.";
      setError(msg);
    } finally {
      setSubmittingSuspend(false);
    }
  };

  // Handle Reconnect Action
  const handleOpenReconnectModal = (serviceAccountId: string, name: string) => {
    setReconnectServiceAccountId(serviceAccountId);
    setReconnectAccountName(name);
    setReconFee("300.00");
    setReconImmediate(true);
    setReconTechId("");
    setReconScheduledAt("");
    setReconNotes("");
    setShowReconnectModal(true);
  };

  const handleConfirmReconnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconnectServiceAccountId) return;
    setSubmittingReconnect(true);
    try {
      const res = await api.requestReconnection(reconnectServiceAccountId, {
        fee: reconFee,
        immediate: reconImmediate,
        technicianUserId: !reconImmediate && reconTechId ? reconTechId : undefined,
        scheduledAt: !reconImmediate && reconScheduledAt ? reconScheduledAt : undefined,
        notes: reconNotes || undefined,
      });
      showToast(res.message || "Reconnection processed successfully.");
      setShowReconnectModal(false);
      await loadTabData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process reconnection.";
      setError(msg);
    } finally {
      setSubmittingReconnect(false);
    }
  };

  // Handle Complete Work Order Action
  const handleOpenCompleteModal = (orderId: string, orderNumber: string) => {
    setCompleteOrderId(orderId);
    setCompleteOrderNumber(orderNumber);
    setCompleteNotes("");
    setShowCompleteModal(true);
  };

  const handleConfirmComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeOrderId) return;
    setSubmittingComplete(true);
    try {
      const res = await api.completeReconnection(completeOrderId, {
        notes: completeNotes || undefined,
      });
      showToast(res.message || "Work order marked completed. Service restored.");
      setShowCompleteModal(false);
      await loadTabData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to complete work order.";
      setError(msg);
    } finally {
      setSubmittingComplete(false);
    }
  };

  // Handle Service Control History Drawer
  const handleViewHistory = async (serviceAccountId: string, name: string) => {
    setHistoryServiceAccountId(serviceAccountId);
    setHistoryAccountName(name);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const res = await api.getServiceControlHistory(serviceAccountId);
      setHistoryEvents(res.events);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load service history.";
      setError(msg);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-lg bg-emerald-800 text-white shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-5 h-5 text-emerald-300" />
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-emerald-300 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0F172A] flex items-center gap-2.5">
            <AlertCircle className="w-6 h-6 text-[#2563EB]" />
            <span>Accounts Receivable & Service Control</span>
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Comprehensive AR aging analysis, overdue delinquency tracking, suspension screening, and reconnection work orders.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadTabData}
            disabled={loading}
            className="px-3 py-1.5 rounded border border-[#E2E8F0] bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="border-b border-[#E2E8F0] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("aging")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "aging"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>AR Aging Buckets</span>
          </button>

          <button
            onClick={() => setActiveTab("overdue")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "overdue"
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>Overdue Receivables</span>
          </button>

          <button
            onClick={() => setActiveTab("suspension")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "suspension"
                ? "border-rose-600 text-rose-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <UserX className="w-4 h-4" />
            <span>Suspension Candidates</span>
            {candidates.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 font-bold text-[10px]">
                {candidates.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("reconnections")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "reconnections"
                ? "border-teal-600 text-teal-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Reconnections & Work Orders</span>
          </button>
        </div>

        {/* As-Of Date Selector */}
        <div className="flex items-center gap-2 pb-1.5">
          <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> As of:
          </span>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="text-xs py-1 px-2.5 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
          />
        </div>
      </div>

      {/* Common Filter Row */}
      <div className="p-3 bg-white border border-[#E2E8F0] rounded-lg shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search subscriber, account #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadTabData()}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#64748B] font-medium">Area:</span>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="py-1 px-2.5 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
            >
              <option value="">All Collection Areas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeTab === "reconnections" && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[#64748B] font-medium">Order Status:</span>
              <select
                value={reconStatusFilter}
                onChange={(e) => setReconStatusFilter(e.target.value)}
                className="py-1 px-2.5 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
              >
                <option value="ALL">All Statuses</option>
                <option value="REQUESTED">Requested</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {canControl && (
              <button
                onClick={() => {
                  const targetSa = candidates[0]?.serviceAccountId || "new-order";
                  const targetName = candidates[0]?.subscriberDisplayName || "Suspended Subscriber";
                  handleOpenReconnectModal(targetSa, targetName);
                }}
                className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>New Reconnection Order</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* --- TAB 1: AR AGING SUMMARY (PRODUCT.md Section 8.9) --- */}
      {activeTab === "aging" && (
        <div className="space-y-6">
          {/* 5-Bucket KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Current */}
            <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-1">
              <div className="text-[11px] font-semibold text-emerald-700">Current (Not Overdue)</div>
              <div className="text-lg font-bold text-emerald-700">
                {agingSummary ? agingSummary.current.amount : "₱0.00"}
              </div>
              <div className="text-[10px] text-slate-400">
                {agingSummary?.current.count || 0} invoices &bull; {agingSummary?.current.percentage || 0}%
              </div>
            </div>

            {/* 1-30 Days */}
            <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-1">
              <div className="text-[11px] font-semibold text-blue-700">1–30 Days Past Due</div>
              <div className="text-lg font-bold text-blue-700">
                {agingSummary ? agingSummary.days1to30.amount : "₱0.00"}
              </div>
              <div className="text-[10px] text-slate-400">
                {agingSummary?.days1to30.count || 0} invoices &bull; {agingSummary?.days1to30.percentage || 0}%
              </div>
            </div>

            {/* 31-60 Days */}
            <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-1">
              <div className="text-[11px] font-semibold text-amber-700">31–60 Days Past Due</div>
              <div className="text-lg font-bold text-amber-700">
                {agingSummary ? agingSummary.days31to60.amount : "₱0.00"}
              </div>
              <div className="text-[10px] text-slate-400">
                {agingSummary?.days31to60.count || 0} invoices &bull; {agingSummary?.days31to60.percentage || 0}%
              </div>
            </div>

            {/* 61-90 Days */}
            <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-1">
              <div className="text-[11px] font-semibold text-orange-700">61–90 Days Past Due</div>
              <div className="text-lg font-bold text-orange-700">
                {agingSummary ? agingSummary.days61to90.amount : "₱0.00"}
              </div>
              <div className="text-[10px] text-slate-400">
                {agingSummary?.days61to90.count || 0} invoices &bull; {agingSummary?.days61to90.percentage || 0}%
              </div>
            </div>

            {/* 90+ Days */}
            <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-1">
              <div className="text-[11px] font-semibold text-rose-700">90+ Days Past Due</div>
              <div className="text-lg font-bold text-rose-700">
                {agingSummary ? agingSummary.days90Plus.amount : "₱0.00"}
              </div>
              <div className="text-[10px] text-slate-400">
                {agingSummary?.days90Plus.count || 0} invoices &bull; {agingSummary?.days90Plus.percentage || 0}%
              </div>
            </div>

            {/* Total Receivable */}
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-lg shadow-xs space-y-1 text-white">
              <div className="text-[11px] font-semibold text-slate-300">Total Receivables</div>
              <div className="text-lg font-bold text-white">
                {agingSummary ? agingSummary.totalReceivable : "₱0.00"}
              </div>
              <div className="text-[10px] text-slate-400">All open invoice balances</div>
            </div>
          </div>

          {/* Subscriber Breakdown Table */}
          <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                Accounts Receivable Breakdown by Subscriber ({subscribersAging.length})
              </span>
              <span className="text-xs text-slate-400">Derived strictly from finalized invoice balances</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[#64748B]">
                    <th className="py-2.5 px-3 font-semibold">Subscriber</th>
                    <th className="py-2.5 px-3 font-semibold text-right text-emerald-700">Current</th>
                    <th className="py-2.5 px-3 font-semibold text-right text-blue-700">1–30 Days</th>
                    <th className="py-2.5 px-3 font-semibold text-right text-amber-700">31–60 Days</th>
                    <th className="py-2.5 px-3 font-semibold text-right text-orange-700">61–90 Days</th>
                    <th className="py-2.5 px-3 font-semibold text-right text-rose-700">90+ Days</th>
                    <th className="py-2.5 px-3 font-semibold text-right text-slate-900">Total Due</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#2563EB] mb-2" />
                        <span>Computing accounts receivable aging relative to {asOfDate}...</span>
                      </td>
                    </tr>
                  ) : subscribersAging.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No outstanding receivables found for the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    subscribersAging.map((row) => (
                      <tr key={row.subscriberId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-[#0F172A]">{row.displayName}</div>
                          <div className="font-mono text-[11px] text-slate-400">{row.subscriberAccountNumber}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700">{row.currentAmount}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700">{row.days1to30Amount}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700">{row.days31to60Amount}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700">{row.days61to90Amount}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-700">{row.days90PlusAmount}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">{row.totalDue}</td>
                        <td className="py-2.5 px-3 text-center">
                          {row.hasSuspendedService ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              Suspended
                            </span>
                          ) : row.maxDaysOverdue > 30 ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              Delinquent
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => {
                              setActiveTab("overdue");
                              setSearch(row.subscriberAccountNumber);
                            }}
                            className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-100 text-[11px] font-medium text-slate-700 transition-colors cursor-pointer"
                          >
                            Inspect Invoices
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 2: OVERDUE RECEIVABLES (PAST GRACE PERIOD) --- */}
      {activeTab === "overdue" && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
              <span>
                Delinquency Grace Period Policy: <strong>{gracePeriodDays} days</strong> grace allowed after invoice due date before account is subject to collection warnings or service suspension.
              </span>
            </div>
            <div className="text-right font-bold text-amber-900 text-sm">
              Total Overdue: {totalOverdue}
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[#64748B]">
                    <th className="py-2.5 px-3 font-semibold">Invoice #</th>
                    <th className="py-2.5 px-3 font-semibold">Subscriber</th>
                    <th className="py-2.5 px-3 font-semibold">Service Account</th>
                    <th className="py-2.5 px-3 font-semibold">Territory</th>
                    <th className="py-2.5 px-3 font-semibold">Due Date</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Balance Due</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Days Overdue</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#2563EB] mb-2" />
                        <span>Loading overdue invoices...</span>
                      </td>
                    </tr>
                  ) : overdueItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No overdue invoices found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    overdueItems.map((inv) => (
                      <tr key={inv.invoiceId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-[#0F172A]">{inv.invoiceNumber}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-800">{inv.subscriberDisplayName}</div>
                          <div className="text-[11px] text-slate-400">{inv.subscriberAccountNumber}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono text-xs">{inv.serviceAccountNumber}</div>
                          <div className="text-[11px] text-slate-400">{inv.servicePlanName}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div>{inv.collectionAreaName || "Unassigned Area"}</div>
                          <div className="text-[11px] text-slate-400">{inv.collectorName || "No Collector"}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono">{inv.dueDate}</td>
                        <td className="py-2.5 px-3 text-right">{formatMoney(inv.totalAmount)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-700">{formatMoney(inv.balanceDue)}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-rose-700">{inv.daysOverdue} days</td>
                        <td className="py-2.5 px-3 text-center">
                          {inv.delinquencySeverity === "SEVERE_DELINQUENT" ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              Severe (60+d)
                            </span>
                          ) : inv.delinquencySeverity === "DELINQUENT_31_60" ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                              31–60d Overdue
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                              1–30d Overdue
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 3: SUSPENSION CANDIDATES SCREEN --- */}
      {activeTab === "suspension" && (
        <div className="space-y-4">
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-800">
                <AlertTriangle className="w-4 h-4 text-rose-700" />
                <span>Service Suspension Candidate Criteria (PRODUCT.md Section 8.10)</span>
              </div>
              <p className="text-[11px] text-rose-800">
                Active service accounts are flagged when: Overdue balance &ge; <strong>₱{thresholds.suspensionThresholdAmount}</strong> OR Delinquency &ge; <strong>{thresholds.suspensionThresholdOverdueDays} days</strong> past grace period OR &ge; <strong>2 consecutive unpaid billing cycles</strong>.
              </p>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-rose-900">{candidates.length} Candidate Accounts</span>
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[#64748B]">
                    <th className="py-2.5 px-3 font-semibold">Service Account</th>
                    <th className="py-2.5 px-3 font-semibold">Subscriber</th>
                    <th className="py-2.5 px-3 font-semibold">Territory</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Overdue Balance</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Unpaid Cycles</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Days Delinquent</th>
                    <th className="py-2.5 px-3 font-semibold">Candidate Reasons</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#2563EB] mb-2" />
                        <span>Evaluating suspension candidates...</span>
                      </td>
                    </tr>
                  ) : candidates.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No active service accounts currently meet the criteria for suspension.
                      </td>
                    </tr>
                  ) : (
                    candidates.map((c) => (
                      <tr key={c.serviceAccountId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-[#0F172A]">
                          <div>{c.serviceAccountNumber}</div>
                          <div className="text-[11px] font-normal text-slate-400">{c.servicePlanName}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-800">{c.subscriberDisplayName}</div>
                          <div className="text-[11px] text-slate-400">{c.subscriberAccountNumber} &bull; {c.subscriberMobile || "No mobile"}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div>{c.collectionAreaName || "—"}</div>
                          <div className="text-[11px] text-slate-400">{c.collectorName || "—"}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-700">
                          {c.overdueBalance}
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                          {c.overdueInvoicesCount}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-rose-700">
                          {c.daysOverdue} days
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="space-y-1">
                            {c.candidateReasons.map((r, i) => (
                              <div key={i} className="text-[10px] font-medium px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
                                {r}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleViewHistory(c.serviceAccountId, c.subscriberDisplayName)}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                              title="View Service Control History"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            {canControl && (
                              <button
                                onClick={() => handleOpenSuspendModal(c)}
                                className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <UserX className="w-3.5 h-3.5" />
                                <span>Suspend</span>
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
          </div>
        </div>
      )}

      {/* --- TAB 4: RECONNECTIONS & WORK ORDERS --- */}
      {activeTab === "reconnections" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[#64748B]">
                    <th className="py-2.5 px-3 font-semibold">Order #</th>
                    <th className="py-2.5 px-3 font-semibold">Subscriber</th>
                    <th className="py-2.5 px-3 font-semibold">Service Account</th>
                    <th className="py-2.5 px-3 font-semibold">Request Date</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Recon Fee</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Assigned Tech</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#2563EB] mb-2" />
                        <span>Loading reconnection work orders...</span>
                      </td>
                    </tr>
                  ) : workOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No reconnection work orders found.
                      </td>
                    </tr>
                  ) : (
                    workOrders.map((wo) => {
                      const tech = technicians.find((t) => t.id === wo.technicianUserId);
                      return (
                        <tr key={wo.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-[#0F172A]">{wo.reconnectionNumber}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-800">{wo.subscriberDisplayName}</div>
                            <div className="text-[11px] text-slate-400">{wo.subscriberAccountNumber}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-mono text-xs">{wo.serviceAccountNumber}</div>
                            <div className="text-[11px] text-slate-400">{wo.servicePlanName}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono">{wo.requestDate}</td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-800">{formatMoney(wo.fee)}</td>
                          <td className="py-2.5 px-3 text-center">
                            {wo.status === "COMPLETED" ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Completed
                              </span>
                            ) : wo.status === "SCHEDULED" ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                Scheduled
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                Requested
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {tech ? tech.displayName : wo.technicianUserId ? "Assigned" : "Unassigned"}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleViewHistory(wo.serviceAccountId, wo.subscriberDisplayName)}
                                className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                                title="View History"
                              >
                                <History className="w-4 h-4" />
                              </button>
                              {wo.status !== "COMPLETED" && canControl && (
                                <button
                                  onClick={() => handleOpenCompleteModal(wo.id, wo.reconnectionNumber)}
                                  className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Complete</span>
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
          </div>
        </div>
      )}

      {/* --- MODAL 1: SUSPEND SERVICE ACCOUNT --- */}
      {showSuspendModal && selectedCandidate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-rose-700 flex items-center gap-2">
                <UserX className="w-4 h-4" />
                <span>Suspend Service Account</span>
              </h3>
              <button onClick={() => setShowSuspendModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1">
              <div><strong>Account:</strong> {selectedCandidate.serviceAccountNumber} &bull; {selectedCandidate.servicePlanName}</div>
              <div><strong>Subscriber:</strong> {selectedCandidate.subscriberDisplayName}</div>
              <div><strong>Overdue Balance:</strong> <span className="font-bold text-rose-700">{selectedCandidate.overdueBalance}</span></div>
            </div>

            <form onSubmit={handleConfirmSuspend} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Suspension Reason * (min 5 characters)</label>
                <select
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white mb-2"
                >
                  <option value="NON_PAYMENT: Overdue balance exceeds policy threshold.">NON_PAYMENT: Overdue balance exceeds policy threshold</option>
                  <option value="DELINQUENT_INVOICES: Multiple unpaid billing cycles past grace period.">DELINQUENT_INVOICES: Multiple unpaid billing cycles</option>
                  <option value="SUBSCRIBER_REQUEST: Temporary suspension requested by customer.">SUBSCRIBER_REQUEST: Customer request</option>
                  <option value="VIOLATION_OF_TERMS: Unauthorized redistribution or abuse.">VIOLATION_OF_TERMS: Unauthorized usage</option>
                  <option value="OTHER">Other Custom Reason</option>
                </select>

                {suspendReason === "OTHER" && (
                  <input
                    type="text"
                    placeholder="Type custom suspension reason..."
                    onChange={(e) => setSuspendReason(e.target.value)}
                    className="w-full p-2 rounded border border-[#E2E8F0] bg-white"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Supervisor Operational Notes</label>
                <textarea
                  rows={2}
                  value={suspendNotes}
                  onChange={(e) => setSuspendNotes(e.target.value)}
                  placeholder="e.g. Disconnect notice dispatched via SMS; field tech informed."
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowSuspendModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSuspend || suspendReason.trim().length < 5}
                  className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submittingSuspend ? "Suspending..." : "Confirm Suspension"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: RECONNECT SERVICE ACCOUNT --- */}
      {showReconnectModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-teal-700 flex items-center gap-2">
                <Wrench className="w-4 h-4" />
                <span>Authorize Service Reconnection</span>
              </h3>
              <button onClick={() => setShowReconnectModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1">
              <div><strong>Subscriber:</strong> {reconnectAccountName}</div>
              <div>Authorizing reconnection will create sequential work order <strong>BCIS-RECON-YYYY-NNNN</strong>.</div>
            </div>

            <form onSubmit={handleConfirmReconnect} className="space-y-3 text-xs">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                  <input
                    type="radio"
                    checked={reconImmediate}
                    onChange={() => setReconImmediate(true)}
                  />
                  <span>Immediate Reconnection (Restore to ACTIVE now)</span>
                </label>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                  <input
                    type="radio"
                    checked={!reconImmediate}
                    onChange={() => setReconImmediate(false)}
                  />
                  <span>Dispatch Technician Work Order</span>
                </label>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Reconnection Fee (₱)</label>
                <input
                  type="text"
                  value={reconFee}
                  onChange={(e) => setReconFee(e.target.value)}
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white"
                  required
                />
              </div>

              {!reconImmediate && (
                <>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Assign Technician</label>
                    <select
                      value={reconTechId}
                      onChange={(e) => setReconTechId(e.target.value)}
                      className="w-full p-2 rounded border border-[#E2E8F0] bg-white"
                    >
                      <option value="">Select Technician...</option>
                      {technicians.map((t) => (
                        <option key={t.id} value={t.id}>{t.displayName}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Scheduled Date & Time</label>
                    <input
                      type="datetime-local"
                      value={reconScheduledAt}
                      onChange={(e) => setReconScheduledAt(e.target.value)}
                      className="w-full p-2 rounded border border-[#E2E8F0] bg-white"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-slate-600 font-medium mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={reconNotes}
                  onChange={(e) => setReconNotes(e.target.value)}
                  placeholder="e.g. Full overdue balance settled via OR # BCIS-REC-2026-0045."
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowReconnectModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReconnect}
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submittingReconnect ? "Processing..." : "Authorize Reconnection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: COMPLETE RECONNECTION WORK ORDER --- */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>Complete Reconnection Work Order</span>
              </h3>
              <button onClick={() => setShowCompleteModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Confirming completion of order <strong>{completeOrderNumber}</strong> will restore the service account to <strong>ACTIVE</strong> status and write to the permanent status history log.
            </p>

            <form onSubmit={handleConfirmComplete} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Technician Field Completion Notes</label>
                <textarea
                  rows={3}
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  placeholder="e.g. Signal level tested: -18.4 dBm. Drop wire inspected. Customer signed field work voucher."
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingComplete}
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submittingComplete ? "Completing..." : "Complete & Restore Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: SERVICE HISTORY TIMELINE DRAWER --- */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 p-6 space-y-4 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <History className="w-4 h-4 text-[#2563EB]" />
                  <span>Service Control & Status History</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {historyAccountName} {historyServiceAccountId && <span className="font-mono text-slate-400">({historyServiceAccountId})</span>}
                </p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {loadingHistory ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#2563EB] mb-2" />
                  <span>Loading audit timeline...</span>
                </div>
              ) : historyEvents.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No service control events recorded for this account.
                </div>
              ) : (
                historyEvents.map((evt) => (
                  <div key={evt.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{evt.title}</span>
                      <span className="text-[10px] text-slate-400">{new Date(evt.occurredAt).toLocaleString()}</span>
                    </div>
                    <p className="text-[11px] text-slate-600">{evt.description}</p>
                    <div className="text-[10px] text-slate-400">
                      Actor: <strong>{evt.actorName || "System / Automated"}</strong>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
