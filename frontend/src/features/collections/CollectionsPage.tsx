import { useState, useEffect, useCallback, useMemo } from "react";
import {
  FolderSync,
  RefreshCw,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
  FileCheck,
  ShieldAlert,
  Wallet,
  Coins,
  Receipt,
  User,
  MapPin,
  Calendar,
  Lock,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  api,
  type CollectionBatch,
  type CollectionBatchAccount,
  type CollectionBatchDetail,
  type Collector,
  type CollectionArea,
  type PaymentMethod,
} from "../../api/client";
import { useAuth } from "../auth/AuthContext";
import { cn, formatMoney } from "../../lib/utils";

export function CollectionsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("collection.manage");
  const canReconcile = hasPermission("collection.reconcile");
  const canCreatePayment = hasPermission("payment.create");

  // State: Batches & Lookups
  const [batches, setBatches] = useState<CollectionBatch[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [areas, setAreas] = useState<CollectionArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [activeBatchDetail, setActiveBatchDetail] = useState<CollectionBatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [collectorFilter, setCollectorFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [collectAccount, setCollectAccount] = useState<CollectionBatchAccount | null>(null);
  const [showRemitModal, setShowRemitModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  // Form States: Create Batch
  const [newCollectorId, setNewCollectorId] = useState("");
  const [newAreaId, setNewAreaId] = useState("");
  const [newCollectionDate, setNewCollectionDate] = useState(new Date().toISOString().split("T")[0]);
  const [newBatchNotes, setNewBatchNotes] = useState("");
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form States: Record Collection
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>("CASH");
  const [collectRef, setCollectRef] = useState("");
  const [collectNotes, setCollectNotes] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);

  // Form States: Remit Cash
  const [remitCash, setRemitCash] = useState("");
  const [remitGcash, setRemitGcash] = useState("0.00");
  const [remitBankTransfer, setRemitBankTransfer] = useState("0.00");
  const [remitNotes, setRemitNotes] = useState("");
  const [remitting, setRemitting] = useState(false);
  const [remitError, setRemitError] = useState<string | null>(null);

  // Form States: Reconcile
  const [reconcileNotes, setReconcileNotes] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  // Form States: Close Batch (AT-08)
  const [closeReason, setCloseReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  // Toast / Feedback
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Load initial lookups
  const loadLookups = useCallback(async () => {
    try {
      const [colData, areaData] = await Promise.all([
        api.listCollectors(),
        api.listCollectionAreas(),
      ]);
      setCollectors(colData || []);
      setAreas(areaData || []);
      if (colData && colData.length > 0 && colData[0] && !newCollectorId) {
        setNewCollectorId(colData[0].id);
      }
      if (areaData && areaData.length > 0 && areaData[0] && !newAreaId) {
        setNewAreaId(areaData[0].id);
      }
    } catch (err) {
      console.error("Failed to load collectors/areas:", err);
    }
  }, [newCollectorId, newAreaId]);

  // Load batches list
  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listBatches({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        collectorId: collectorFilter || undefined,
        collectionAreaId: areaFilter || undefined,
        search: search.trim() || undefined,
      });
      const list = res.data || [];
      setBatches(list);
      // Auto-select first batch if none selected or if selected is not in list
      if (list.length > 0 && list[0]) {
        setSelectedBatchId((prev) => (prev && list.some((b) => b.id === prev) ? prev : list[0]!.id));
      } else {
        setSelectedBatchId(null);
        setActiveBatchDetail(null);
      }
    } catch (err: unknown) {
      console.error("Failed to load batches:", err);
      showToast("Failed to load collection batches.", "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, collectorFilter, areaFilter, search]);

  // Load active batch details
  const loadBatchDetail = useCallback(async (batchId: string) => {
    setDetailLoading(true);
    try {
      const detail = await api.getBatchById(batchId);
      setActiveBatchDetail(detail);
    } catch (err) {
      console.error("Failed to load batch detail:", err);
      showToast("Failed to load batch route details.", "error");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    loadBatches();
  }, [statusFilter, collectorFilter, areaFilter]);

  useEffect(() => {
    if (selectedBatchId) {
      loadBatchDetail(selectedBatchId);
    }
  }, [selectedBatchId, loadBatchDetail]);

  // Calculate Metrics
  const metrics = useMemo(() => {
    const total = batches.length;
    const inProgress = batches.filter((b) => b.status === "OPEN" || b.status === "IN_PROGRESS").length;
    const remitted = batches.filter((b) => b.status === "REMITTED" || b.status === "SUBMITTED").length;
    const totalCollected = batches.reduce((sum, b) => sum + parseFloat(b.collectedCash || "0"), 0);
    return { total, inProgress, remitted, totalCollected };
  }, [batches]);

  // Handle Create Batch
  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectorId || !newAreaId || !newCollectionDate) {
      setCreateError("Please select a collector, area, and collection date.");
      return;
    }
    setCreatingBatch(true);
    setCreateError(null);
    try {
      const res = await api.createBatch({
        collectorId: newCollectorId,
        collectionAreaId: newAreaId,
        collectionDate: newCollectionDate,
        notes: newBatchNotes.trim() || undefined,
      });
      showToast(res.message || "Collection batch created successfully.");
      setShowCreateModal(false);
      setNewBatchNotes("");
      await loadBatches();
      if (res.data?.id) {
        setSelectedBatchId(res.data.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create batch.";
      setCreateError(msg);
    } finally {
      setCreatingBatch(false);
    }
  };

  // Handle Record Collection
  const handleOpenCollectModal = (account: CollectionBatchAccount) => {
    setCollectAccount(account);
    const remaining = Math.max(
      0,
      parseFloat(account.expectedAmount) - parseFloat(account.collectedAmount || "0")
    ).toFixed(2);
    setCollectAmount(remaining);
    setCollectMethod("CASH");
    setCollectRef("");
    setCollectNotes("");
    setCollectError(null);
  };

  const handleSubmitCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId || !collectAccount) return;
    const amt = parseFloat(collectAmount);
    if (isNaN(amt) || amt <= 0) {
      setCollectError("Please enter a valid payment amount greater than zero.");
      return;
    }
    setCollecting(true);
    setCollectError(null);
    try {
      const res = await api.recordFieldCollection(selectedBatchId, {
        batchAccountId: collectAccount.id,
        amount: amt.toFixed(2),
        paymentMethod: collectMethod,
        referenceNumber: collectRef.trim() || undefined,
        notes: collectNotes.trim() || undefined,
      });
      showToast(res.message || "Field collection recorded.");
      setCollectAccount(null);
      await loadBatchDetail(selectedBatchId);
      await loadBatches();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record collection.";
      setCollectError(msg);
    } finally {
      setCollecting(false);
    }
  };

  // Handle Submit Batch
  const handleSubmitBatch = async () => {
    if (!selectedBatchId) return;
    try {
      const res = await api.submitBatch(selectedBatchId);
      showToast(res.message || "Batch submitted for remittance.");
      await loadBatchDetail(selectedBatchId);
      await loadBatches();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit batch.";
      showToast(msg, "error");
    }
  };

  // Handle Open Remittance Modal
  const handleOpenRemitModal = () => {
    if (!activeBatchDetail) return;
    setRemitCash(activeBatchDetail.collectedCash || "0.00");
    setRemitGcash("0.00");
    setRemitBankTransfer("0.00");
    setRemitNotes("");
    setRemitError(null);
    setShowRemitModal(true);
  };

  // Live Remittance Variance Calculation
  const remitVariance = useMemo(() => {
    if (!activeBatchDetail) return { diff: 0, status: "BALANCED" };
    const collected = parseFloat(activeBatchDetail.collectedCash || "0");
    const remitted = parseFloat(remitCash || "0");
    const diff = Math.round((remitted - collected) * 100) / 100;
    if (diff === 0) return { diff, status: "BALANCED" };
    if (diff < 0) return { diff, status: "SHORTAGE", shortage: Math.abs(diff) };
    return { diff, status: "OVERAGE", overage: diff };
  }, [activeBatchDetail, remitCash]);

  const handleSubmitRemittance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId) return;
    const cashVal = parseFloat(remitCash);
    if (isNaN(cashVal) || cashVal < 0) {
      setRemitError("Please enter a valid cash remittance amount.");
      return;
    }
    setRemitting(true);
    setRemitError(null);
    try {
      const res = await api.recordRemittance(selectedBatchId, {
        remittedCash: cashVal.toFixed(2),
        remittedGcash: parseFloat(remitGcash || "0").toFixed(2),
        remittedBankTransfer: parseFloat(remitBankTransfer || "0").toFixed(2),
        notes: remitNotes.trim() || undefined,
      });
      showToast(res.message || "Remittance recorded successfully.");
      setShowRemitModal(false);
      await loadBatchDetail(selectedBatchId);
      await loadBatches();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record remittance.";
      setRemitError(msg);
    } finally {
      setRemitting(false);
    }
  };

  // Handle Reconcile Batch
  const handleSubmitReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId) return;
    setReconciling(true);
    setReconcileError(null);
    try {
      const res = await api.reconcileBatch(selectedBatchId, {
        notes: reconcileNotes.trim() || undefined,
      });
      showToast(res.message || "Batch reconciled successfully.");
      setShowReconcileModal(false);
      setReconcileNotes("");
      await loadBatchDetail(selectedBatchId);
      await loadBatches();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reconcile batch.";
      setReconcileError(msg);
    } finally {
      setReconciling(false);
    }
  };

  // Handle Close Batch (AT-08 Invariant)
  const isUnbalanced = useMemo(() => {
    if (!activeBatchDetail) return false;
    const diff = parseFloat(activeBatchDetail.difference || "0");
    return Math.abs(diff) > 0.001;
  }, [activeBatchDetail]);

  const handleOpenCloseModal = () => {
    setCloseReason("");
    setCloseError(null);
    setShowCloseModal(true);
  };

  const handleSubmitClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId) return;
    if (isUnbalanced && (!closeReason || closeReason.trim().length < 5)) {
      setCloseError("Per AT-08 invariant, a supervisor operational reason (minimum 5 characters) is strictly required to close an unbalanced batch.");
      return;
    }
    setClosing(true);
    setCloseError(null);
    try {
      const res = await api.closeBatch(selectedBatchId, {
        reason: closeReason.trim() || undefined,
      });
      showToast(res.message || "Collection batch closed successfully.");
      setShowCloseModal(false);
      await loadBatchDetail(selectedBatchId);
      await loadBatches();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to close batch.";
      setCloseError(msg);
    } finally {
      setClosing(false);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">OPEN</span>;
      case "IN_PROGRESS":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">IN PROGRESS</span>;
      case "SUBMITTED":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">SUBMITTED</span>;
      case "REMITTED":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">REMITTED</span>;
      case "RECONCILED":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">RECONCILED</span>;
      case "CLOSED":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">CLOSED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg border text-sm flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2",
            notification.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          )}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0F172A] flex items-center gap-2.5">
            <FolderSync className="w-6 h-6 text-[#2563EB]" />
            <span>Collections & Route Reconciliation</span>
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Field collector route sheets, cash collections, and authoritative remittance balancing (AT-07 & AT-08).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadBatches()}
            disabled={loading}
            className="px-3 py-1.5 rounded border border-[#E2E8F0] bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </button>

          {canManage && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-1.5 rounded bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Batch</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-1">
          <div className="text-xs font-medium text-[#64748B]">Total Route Batches</div>
          <div className="text-2xl font-bold text-[#0F172A]">{metrics.total}</div>
          <div className="text-[11px] text-slate-400">All registered collection runs</div>
        </div>

        <div className="p-4 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-1">
          <div className="text-xs font-medium text-[#64748B]">In Progress</div>
          <div className="text-2xl font-bold text-[#2563EB]">{metrics.inProgress}</div>
          <div className="text-[11px] text-blue-500">Active in the field</div>
        </div>

        <div className="p-4 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-1">
          <div className="text-xs font-medium text-[#64748B]">Pending Reconciliation</div>
          <div className="text-2xl font-bold text-amber-600">{metrics.remitted}</div>
          <div className="text-[11px] text-amber-600">Turned in & awaiting supervisor review</div>
        </div>

        <div className="p-4 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-1">
          <div className="text-xs font-medium text-[#64748B]">Total Collected Today</div>
          <div className="text-2xl font-bold text-emerald-600">{formatMoney(metrics.totalCollected)}</div>
          <div className="text-[11px] text-emerald-600">Recorded field collections</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-md text-xs">
            {["ALL", "OPEN", "IN_PROGRESS", "SUBMITTED", "REMITTED", "RECONCILED", "CLOSED"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1 rounded font-medium transition-colors cursor-pointer",
                  statusFilter === s
                    ? "bg-white text-[#2563EB] shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search batch #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadBatches()}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>

        {/* Collector & Area Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#64748B] font-medium">Collector:</span>
            <select
              value={collectorFilter}
              onChange={(e) => setCollectorFilter(e.target.value)}
              className="text-xs py-1 px-2.5 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
            >
              <option value="">All Collectors</option>
              {collectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.collectorCode})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#64748B] font-medium">Area:</span>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="text-xs py-1 px-2.5 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
            >
              <option value="">All Areas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Two-Pane Layout (PRODUCT.md Section 14.5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Pane: Batches List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
              Batches ({batches.length})
            </span>
            <span className="text-xs text-slate-400">Click to inspect</span>
          </div>

          {loading ? (
            <div className="p-8 bg-white border border-[#E2E8F0] rounded-lg text-center space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#2563EB]" />
              <div className="text-xs text-slate-500">Loading collection batches...</div>
            </div>
          ) : batches.length === 0 ? (
            <div className="p-8 bg-white border border-[#E2E8F0] rounded-lg text-center space-y-2">
              <FolderSync className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-xs font-semibold text-slate-700">No collection batches found</div>
              <div className="text-[11px] text-slate-400 max-w-xs mx-auto">
                No batches match the selected filters. Click &quot;New Batch&quot; to assign route accounts.
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[780px] overflow-y-auto pr-1">
              {batches.map((b) => {
                const isSelected = selectedBatchId === b.id;
                const diff = parseFloat(b.difference || "0");
                const remitted = parseFloat(b.remittedCash || "0");

                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBatchId(b.id)}
                    className={cn(
                      "p-4 rounded-lg border transition-all cursor-pointer space-y-2.5",
                      isSelected
                        ? "bg-blue-50/50 border-[#2563EB] shadow-xs ring-1 ring-[#2563EB]"
                        : "bg-white border-[#E2E8F0] hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-mono text-xs font-bold text-[#0F172A]">
                          {b.batchNumber}
                        </div>
                        <div className="text-xs text-[#64748B] flex items-center gap-1.5 mt-0.5">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{b.collectorName || "Assigned Collector"}</span>
                        </div>
                      </div>
                      {getStatusBadge(b.status)}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">Area & Date</div>
                        <div className="font-medium text-slate-700 truncate">
                          {b.collectionAreaName || "Barangay Area"}
                        </div>
                        <div className="text-[10px] text-slate-400">{b.collectionDate}</div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] text-slate-400 uppercase">Collected / Expected</div>
                        <div className="font-semibold text-slate-800">
                          {formatMoney(b.collectedCash)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          exp. {formatMoney(b.expectedCash)}
                        </div>
                      </div>
                    </div>

                    {/* Variance Badge */}
                    {remitted > 0 && (
                      <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-400">Cash Variance:</span>
                        {diff === 0 ? (
                          <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Balanced (₱0.00)
                          </span>
                        ) : diff < 0 ? (
                          <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                            <TrendingDown className="w-3 h-3" />
                            Shortage ({formatMoney(Math.abs(diff))})
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Overage ({formatMoney(diff)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Pane: Active Batch Route Sheet Details (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {!activeBatchDetail ? (
            <div className="p-12 bg-white border border-[#E2E8F0] rounded-lg text-center space-y-3">
              <FolderSync className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">No Batch Selected</div>
              <div className="text-xs text-slate-400 max-w-sm mx-auto">
                Select a collection batch from the list on the left to inspect route sheet accounts, record payments, and process remittances.
              </div>
            </div>
          ) : detailLoading ? (
            <div className="p-12 bg-white border border-[#E2E8F0] rounded-lg text-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#2563EB]" />
              <div className="text-xs text-slate-500">Loading batch details...</div>
            </div>
          ) : (
            <>
              {/* Batch Detail Header Card */}
              <div className="p-5 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-base font-bold text-[#0F172A]">
                        {activeBatchDetail.batchNumber}
                      </span>
                      {getStatusBadge(activeBatchDetail.status)}
                    </div>
                    <div className="text-xs text-[#64748B] flex flex-wrap items-center gap-4 mt-1">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <strong>{activeBatchDetail.collectorName}</strong> ({activeBatchDetail.collectorCode})
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {activeBatchDetail.collectionAreaName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {activeBatchDetail.collectionDate}
                      </span>
                    </div>
                  </div>

                  {/* Lifecycle Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Submit Button */}
                    {(activeBatchDetail.status === "OPEN" || activeBatchDetail.status === "IN_PROGRESS") && canManage && (
                      <button
                        onClick={handleSubmitBatch}
                        className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>Submit Batch</span>
                      </button>
                    )}

                    {/* Remit Cash Button */}
                    {(activeBatchDetail.status === "IN_PROGRESS" || activeBatchDetail.status === "SUBMITTED") && canManage && (
                      <button
                        onClick={handleOpenRemitModal}
                        className="px-3 py-1.5 rounded bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        <span>Remit Cash</span>
                      </button>
                    )}

                    {/* Reconcile Button */}
                    {activeBatchDetail.status === "REMITTED" && canReconcile && (
                      <button
                        onClick={() => setShowReconcileModal(true)}
                        className="px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Reconcile Batch</span>
                      </button>
                    )}

                    {/* Close Batch Button (AT-08) */}
                    {(activeBatchDetail.status === "RECONCILED" || activeBatchDetail.status === "REMITTED") && (canReconcile || canManage) && (
                      <button
                        onClick={handleOpenCloseModal}
                        className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Close Batch</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 4-Card Financial Summary Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Expected Cash</div>
                    <div className="text-sm font-bold text-slate-800">
                      {formatMoney(activeBatchDetail.expectedCash)}
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50/60 rounded border border-blue-200">
                    <div className="text-[10px] text-blue-600 uppercase font-semibold">Collected Cash</div>
                    <div className="text-sm font-bold text-[#2563EB]">
                      {formatMoney(activeBatchDetail.collectedCash)}
                    </div>
                  </div>

                  <div className="p-3 bg-purple-50/60 rounded border border-purple-200">
                    <div className="text-[10px] text-purple-600 uppercase font-semibold">Remitted Cash</div>
                    <div className="text-sm font-bold text-purple-700">
                      {formatMoney(activeBatchDetail.remittedCash)}
                    </div>
                  </div>

                  {(() => {
                    const diff = parseFloat(activeBatchDetail.difference || "0");
                    const remitted = parseFloat(activeBatchDetail.remittedCash || "0");

                    let bg = "bg-slate-50 border-slate-200 text-slate-700";
                    let label = "Variance";
                    if (remitted > 0) {
                      if (diff === 0) {
                        bg = "bg-emerald-50 border-emerald-200 text-emerald-800";
                        label = "BALANCED";
                      } else if (diff < 0) {
                        bg = "bg-rose-50 border-rose-200 text-rose-800";
                        label = "SHORTAGE (AT-08)";
                      } else {
                        bg = "bg-blue-50 border-blue-200 text-blue-800";
                        label = "OVERAGE";
                      }
                    }

                    return (
                      <div className={cn("p-3 rounded border", bg)}>
                        <div className="text-[10px] uppercase font-semibold flex items-center justify-between">
                          <span>{label}</span>
                        </div>
                        <div className="text-sm font-bold">
                          {remitted > 0 ? (diff < 0 ? `-${formatMoney(Math.abs(diff))}` : formatMoney(diff)) : "₱0.00"}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Route Sheet Accounts Table */}
              <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-xs overflow-hidden space-y-3">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-[#2563EB]" />
                    <span>Route Accounts ({activeBatchDetail.accounts?.length || 0})</span>
                  </h3>
                  <span className="text-xs text-slate-400">Scheduled for field collection</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Service Account</th>
                        <th className="px-4 py-2.5">Subscriber</th>
                        <th className="px-4 py-2.5 text-right">Expected</th>
                        <th className="px-4 py-2.5 text-right">Collected</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                        <th className="px-4 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!activeBatchDetail.accounts || activeBatchDetail.accounts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                            No service accounts assigned to this route batch.
                          </td>
                        </tr>
                      ) : (
                        activeBatchDetail.accounts.map((acc) => (
                          <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-mono font-semibold text-slate-800">
                                {acc.serviceAccountNumber || "N/A"}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Inv: {acc.invoiceNumber || "N/A"}
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-800">
                                {acc.subscriberDisplayName || "Subscriber"}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate max-w-xs">
                                {acc.addressLine || " Malaybalay City"}
                              </div>
                            </td>

                            <td className="px-4 py-3 text-right font-medium text-slate-700">
                              {formatMoney(acc.expectedAmount)}
                            </td>

                            <td className="px-4 py-3 text-right font-bold text-emerald-700">
                              {formatMoney(acc.collectedAmount)}
                            </td>

                            <td className="px-4 py-3 text-center">
                              {acc.status === "COLLECTED" ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  COLLECTED
                                </span>
                              ) : acc.status === "PARTIAL" ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                  PARTIAL
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                  UNPAID
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right">
                              {acc.status !== "COLLECTED" &&
                              activeBatchDetail.status !== "CLOSED" &&
                              canCreatePayment ? (
                                <button
                                  onClick={() => handleOpenCollectModal(acc)}
                                  className="px-2.5 py-1 rounded bg-[#2563EB] hover:bg-blue-700 text-white text-[11px] font-medium transition-colors cursor-pointer"
                                >
                                  Collect
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">Done</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Remittance History Table */}
              {activeBatchDetail.remittances && activeBatchDetail.remittances.length > 0 && (
                <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-xs overflow-hidden space-y-3">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-purple-600" />
                      <span>Remittance Log ({activeBatchDetail.remittances.length})</span>
                    </h3>
                    <span className="text-xs text-slate-400">Authoritative cashier handovers</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2.5">Remittance #</th>
                          <th className="px-4 py-2.5 text-right">Cash</th>
                          <th className="px-4 py-2.5 text-right">Non-Cash</th>
                          <th className="px-4 py-2.5 text-right">Total Remitted</th>
                          <th className="px-4 py-2.5 text-center">Variance</th>
                          <th className="px-4 py-2.5">Received By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeBatchDetail.remittances.map((rem) => {
                          const shortage = parseFloat(rem.shortageAmount || "0");
                          const overage = parseFloat(rem.overageAmount || "0");

                          return (
                            <tr key={rem.id} className="hover:bg-slate-50/70">
                              <td className="px-4 py-3 font-mono font-semibold text-slate-800">
                                {rem.remittanceNumber}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-700">
                                {formatMoney(rem.remittedCash)}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-500">
                                {formatMoney(
                                  parseFloat(rem.remittedGcash || "0") +
                                    parseFloat(rem.remittedBankTransfer || "0") +
                                    parseFloat(rem.otherNonCash || "0")
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-purple-700">
                                {formatMoney(rem.totalRemitted)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {shortage > 0 ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                    Shortage: {formatMoney(shortage)}
                                  </span>
                                ) : overage > 0 ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                    Overage: {formatMoney(overage)}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Balanced
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                <div>{rem.receivedByDisplayName || "Cashier"}</div>
                                <div className="text-[10px] text-slate-400">
                                  {new Date(rem.receivedAt).toLocaleString()}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* --- MODAL 1: Create Batch Modal --- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#2563EB]" />
                <span>Create Collection Batch</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateBatch} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Assigned Collector *</label>
                <select
                  value={newCollectorId}
                  onChange={(e) => setNewCollectorId(e.target.value)}
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
                  required
                >
                  <option value="">Select Collector</option>
                  {collectors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.collectorCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Collection Area / Route *</label>
                <select
                  value={newAreaId}
                  onChange={(e) => setNewAreaId(e.target.value)}
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
                  required
                >
                  <option value="">Select Area</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Collection Date *</label>
                <input
                  type="date"
                  value={newCollectionDate}
                  onChange={(e) => setNewCollectionDate(e.target.value)}
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
                  required
                >
                </input>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Operational Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={newBatchNotes}
                  onChange={(e) => setNewBatchNotes(e.target.value)}
                  placeholder="e.g. Purok 3 to 7 morning run"
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingBatch}
                  className="px-4 py-1.5 rounded bg-[#2563EB] hover:bg-blue-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {creatingBatch ? "Creating Batch..." : "Create Route Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: Record Field Collection Modal --- */}
      {collectAccount && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#2563EB]" />
                <span>Record Field Collection</span>
              </h3>
              <button
                onClick={() => setCollectAccount(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {collectError && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{collectError}</span>
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Service Account:</span>
                <span className="font-mono font-bold text-slate-800">{collectAccount.serviceAccountNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Subscriber:</span>
                <span className="font-semibold text-slate-800">{collectAccount.subscriberDisplayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Expected Invoice Total:</span>
                <span className="font-bold text-blue-700">{formatMoney(collectAccount.expectedAmount)}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitCollection} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Collection Amount (₱) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white font-mono font-bold text-slate-800 focus:outline-none focus:border-[#2563EB]"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Payment Method</label>
                <select
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value as PaymentMethod)}
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="CASH">Cash Payment</option>
                  <option value="GCASH">GCash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHECK">Check</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Reference / Note # (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Field receipt booklet # or GCash Ref"
                  value={collectRef}
                  onChange={(e) => setCollectRef(e.target.value)}
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Collection Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Paid in full to collector"
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCollectAccount(null)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collecting}
                  className="px-4 py-1.5 rounded bg-[#2563EB] hover:bg-blue-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {collecting ? "Issuing Receipt..." : "Issue Official Receipt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: Remit Cash Modal (AT-07 & AT-08) --- */}
      {showRemitModal && activeBatchDetail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#2563EB]" />
                <span>Cash Remittance Handover</span>
              </h3>
              <button
                onClick={() => setShowRemitModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {remitError && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{remitError}</span>
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Collector:</span>
                <span className="font-semibold text-slate-800">{activeBatchDetail.collectorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Cash Collected:</span>
                <span className="font-bold text-[#2563EB]">{formatMoney(activeBatchDetail.collectedCash)}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitRemittance} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Physical Cash Turned In (₱) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={remitCash}
                  onChange={(e) => setRemitCash(e.target.value)}
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white font-mono font-bold text-base text-slate-800 focus:outline-none focus:border-[#2563EB]"
                  required
                />
              </div>

              {/* Real-time Variance Preview */}
              <div
                className={cn(
                  "p-3 rounded-lg border text-xs flex items-start gap-2.5",
                  remitVariance.status === "BALANCED"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : remitVariance.status === "SHORTAGE"
                    ? "bg-rose-50 border-rose-200 text-rose-800"
                    : "bg-blue-50 border-blue-200 text-blue-800"
                )}
              >
                {remitVariance.status === "BALANCED" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : remitVariance.status === "SHORTAGE" ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold">
                    {remitVariance.status === "BALANCED" && "AT-07: Balanced Remittance (₱0.00 Difference)"}
                    {remitVariance.status === "SHORTAGE" && `AT-08: Collector Shortage of ${formatMoney(remitVariance.shortage || 0)}`}
                    {remitVariance.status === "OVERAGE" && `Collector Overage of ${formatMoney(remitVariance.overage || 0)}`}
                  </div>
                  <div className="text-[11px] mt-0.5 opacity-90">
                    {remitVariance.status === "BALANCED" && "Physical cash turned in exactly matches field collection receipts."}
                    {remitVariance.status === "SHORTAGE" && "Turned-in cash is less than collected. This shortage will be recorded authoritatively."}
                    {remitVariance.status === "OVERAGE" && "Turned-in cash exceeds recorded receipts."}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Handover Notes</label>
                <textarea
                  rows={2}
                  value={remitNotes}
                  onChange={(e) => setRemitNotes(e.target.value)}
                  placeholder="e.g. Counted in presence of Cashier and Collector"
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowRemitModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={remitting}
                  className="px-4 py-1.5 rounded bg-[#2563EB] hover:bg-blue-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {remitting ? "Recording Remittance..." : "Confirm Cash Remittance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: Reconcile Batch Modal --- */}
      {showReconcileModal && activeBatchDetail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>Supervisor Reconciliation</span>
              </h3>
              <button
                onClick={() => setShowReconcileModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reconcileError && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{reconcileError}</span>
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Collected Cash:</span>
                <span className="font-bold text-slate-800">{formatMoney(activeBatchDetail.collectedCash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Remitted Cash:</span>
                <span className="font-bold text-purple-700">{formatMoney(activeBatchDetail.remittedCash)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500 font-semibold">Variance:</span>
                <span className="font-bold text-slate-900">{formatMoney(activeBatchDetail.difference)}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitReconcile} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Supervisor Reconciliation Notes</label>
                <textarea
                  rows={3}
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  placeholder="e.g. Verified official receipts against register drawer count."
                  className="w-full p-2 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowReconcileModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reconciling}
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {reconciling ? "Reconciling..." : "Approve Reconciliation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 5: Close Batch Modal (AT-08 Invariant) --- */}
      {showCloseModal && activeBatchDetail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span>Close Collection Batch</span>
              </h3>
              <button
                onClick={() => setShowCloseModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {closeError && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{closeError}</span>
              </div>
            )}

            {/* AT-08 Warning / Invariant Notice */}
            {isUnbalanced ? (
              <div className="p-3.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Acceptance Test AT-08: Unbalanced Batch Guardrail</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  This batch is unbalanced with a recorded variance of{" "}
                  <strong>{formatMoney(activeBatchDetail.difference)}</strong>. Under BCIS audit invariants, an operational supervisor reason (minimum 5 characters) is <strong>strictly required</strong> to close this batch.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>AT-07: Batch is fully balanced. Closing will lock this batch permanently.</span>
              </div>
            )}

            <form onSubmit={handleSubmitClose} className="space-y-3 text-xs">
              {isUnbalanced && (
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Supervisor Reason for Unbalanced Closing *
                  </label>
                  <textarea
                    rows={3}
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    placeholder="e.g. Shortage of ₱500 acknowledged by Collector Juan; promissory note filed with HR."
                    className="w-full p-2 rounded border border-[#E2E8F0] bg-white focus:outline-none focus:border-[#2563EB]"
                    required
                  />
                  <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                    <span>Minimum 5 characters required</span>
                    <span>{closeReason.length} characters</span>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={closing || (isUnbalanced && closeReason.trim().length < 5)}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {closing ? "Closing Batch..." : "Confirm Close Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
