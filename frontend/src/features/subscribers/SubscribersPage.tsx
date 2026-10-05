import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  RefreshCw,
  Eye,
  UserCheck,
  X,
  MapPin,
  Layers,
  ShieldAlert,
  CheckCircle2,
  Wifi,
  Tv,
  Boxes,
  Lock,
  FileText,
  ExternalLink,
} from "lucide-react";
import {
  api,
  type Subscriber,
  type ServiceAccount,
  type ServicePlan,
  type CollectionArea,
  type Collector,
  type CreateSubscriberPayload,
} from "../../api/client";
import { useAuth } from "../auth/AuthContext";
import { cn, formatMoney } from "../../lib/utils";
import { SubscriberLedgerModal } from "./SubscriberLedgerModal";
import { SubscriberSoaModal } from "./SubscriberSoaModal";

export function SubscribersPage() {
  const { hasPermission } = useAuth();
  const canCreateSubscriber = hasPermission("subscriber.create");
  const canControlService = hasPermission("service.control");

  // State: Directory
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // State: Profile Drawer
  const [selectedSubscriberId, setSelectedSubscriberId] = useState<string | null>(null);
  const [subscriberProfile, setSubscriberProfile] = useState<Subscriber | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // State: Catalog Data for Modals
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);
  const [collectionAreas, setCollectionAreas] = useState<CollectionArea[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);

  // State: Modals
  const [ledgerSubscriberId, setLedgerSubscriberId] = useState<string | null>(null);
  const [soaSubscriberId, setSoaSubscriberId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [targetServiceAccount, setTargetServiceAccount] = useState<ServiceAccount | null>(null);
  const [newStatusAction, setNewStatusAction] = useState<"SUSPENDED" | "ACTIVE">("SUSPENDED");
  const [statusReason, setStatusReason] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const [statusActionSubmitting, setStatusActionSubmitting] = useState(false);

  // Fetch Directory
  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listSubscribers({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        page,
        limit: 10,
      });
      setSubscribers(result.data);
      setTotalPages(result.pagination.totalPages);
      setTotalCount(result.pagination.total);
    } catch (err) {
      console.error("Failed to load subscribers", err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  // Fetch Full Profile for Drawer
  const fetchProfile = async (id: string) => {
    setProfileLoading(true);
    try {
      const data = await api.getSubscriberById(id);
      setSubscriberProfile(data);
    } catch (err) {
      console.error("Failed to load subscriber profile", err);
    } finally {
      setProfileLoading(false);
    }
  };

  const openSubscriberDrawer = (id: string) => {
    setSelectedSubscriberId(id);
    fetchProfile(id);
  };

  const closeSubscriberDrawer = () => {
    setSelectedSubscriberId(null);
    setSubscriberProfile(null);
  };

  // Load catalogs on demand
  useEffect(() => {
    async function loadCatalogs() {
      try {
        const [plans, areas, cols] = await Promise.all([
          api.listServicePlans(),
          api.listCollectionAreas(),
          api.listCollectors(),
        ]);
        setServicePlans(plans);
        setCollectionAreas(areas);
        setCollectors(cols);
      } catch (err) {
        console.error("Failed to load catalog options", err);
      }
    }
    loadCatalogs();
  }, []);

  // Handle Status Change
  const promptStatusChange = (sa: ServiceAccount, toStatus: "SUSPENDED" | "ACTIVE") => {
    setTargetServiceAccount(sa);
    setNewStatusAction(toStatus);
    setStatusReason(
      toStatus === "SUSPENDED"
        ? "Non-payment of past due invoices"
        : "Past due invoices settled, reconnecting service"
    );
    setStatusNotes("");
    setShowStatusModal(true);
  };

  const executeStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetServiceAccount || !statusReason.trim()) return;

    setStatusActionSubmitting(true);
    try {
      await api.updateServiceAccountStatus(targetServiceAccount.id, {
        toStatus: newStatusAction,
        reason: statusReason.trim(),
        notes: statusNotes.trim() || undefined,
      });

      setShowStatusModal(false);
      setTargetServiceAccount(null);
      // Refresh profile and table
      if (selectedSubscriberId) {
        await fetchProfile(selectedSubscriberId);
      }
      await fetchSubscribers();
    } catch (err) {
      console.error("Status update failed", err);
      alert(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setStatusActionSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Subscriber Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Authoritative registry of subscribers, billable service accounts, and service controls
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchSubscribers()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shadow-2xs transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>

          {canCreateSubscriber && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Register Subscriber
            </button>
          )}
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-3.5 border border-slate-200 rounded-lg shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by account #, name, phone, or business..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-600 focus:border-blue-600 text-slate-900 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
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
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Account Number</th>
                <th className="py-3 px-4">Subscriber Name</th>
                <th className="py-3 px-4">Contact Number</th>
                <th className="py-3 px-4">Primary Address</th>
                <th className="py-3 px-4 text-center">Services</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-xs">
              {loading && subscribers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                      <span>Loading subscribers from database...</span>
                    </div>
                  </td>
                </tr>
              ) : subscribers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <Boxes className="w-8 h-8 text-slate-300" />
                      <span className="font-medium text-slate-900">No subscribers found</span>
                      <p className="text-xs text-slate-400">
                        {search ? "No matching records found. Try adjusting your search query." : "No subscribers have been created yet."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                subscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-blue-600">
                      <button
                        onClick={() => openSubscriberDrawer(sub.id)}
                        className="hover:underline flex items-center gap-1 text-left cursor-pointer"
                      >
                        {sub.accountNumber}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">
                        {sub.lastName}, {sub.firstName} {sub.middleName ? `${sub.middleName[0]}.` : ""}
                      </div>
                      {sub.businessName && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <span className="italic">{sub.businessName}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-mono">
                      {sub.primaryContactNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {sub.primaryAddress ? (
                        <span>
                          {sub.primaryAddress.barangay}, {sub.primaryAddress.cityMunicipality}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No address recorded</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-600 border border-blue-100">
                        {sub.serviceAccountsCount || 0} active
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                          sub.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        )}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLedgerSubscriberId(sub.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 transition-colors cursor-pointer"
                          title="View Subscriber Financial Ledger"
                        >
                          <FileText className="w-3 h-3 text-slate-500" />
                          <span>Ledger</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSoaSubscriberId(sub.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors cursor-pointer"
                          title="View Statement of Account (SOA)"
                        >
                          <span>SOA</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openSubscriberDrawer(sub.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-200 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Profile</span>
                        </button>
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
            Showing <span className="font-semibold text-slate-900">{subscribers.length}</span> of{" "}
            <span className="font-semibold text-slate-900">{totalCount}</span> subscribers
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
      {/* DRAWER: Subscriber Profile & Billable Service Accounts    */}
      {/* ========================================================= */}
      {selectedSubscriberId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {subscriberProfile
                        ? `${subscriberProfile.lastName}, ${subscriberProfile.firstName} ${subscriberProfile.middleName || ""}`
                        : "Loading profile..."}
                    </h3>
                    {subscriberProfile && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                        {subscriberProfile.status}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-slate-500">
                    {subscriberProfile?.accountNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={closeSubscriberDrawer}
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {profileLoading || !subscriberProfile ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-xs">Fetching subscriber profile...</span>
                </div>
              ) : (
                <>
                  {/* Quick Financial Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
                    <div>
                      <span className="text-[11px] font-bold text-slate-900 block">Financial Statements & Audit Records</span>
                      <span className="text-[10px] text-slate-500">Access running balances or export official statements</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setLedgerSubscriberId(subscriberProfile.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        <span>Financial Ledger</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSoaSubscriberId(subscriberProfile.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 shadow-2xs transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Statement of Account (SOA)</span>
                      </button>
                    </div>
                  </div>

                  {/* Subscriber Metadata Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Contact & Account Information
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500 block">Primary Phone:</span>
                        <span className="font-mono font-medium text-slate-900">
                          {subscriberProfile.primaryContactNumber}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Secondary Phone:</span>
                        <span className="font-mono text-slate-900">
                          {subscriberProfile.secondaryContactNumber || "None"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Email Address:</span>
                        <span className="text-slate-900">
                          {subscriberProfile.email || "None"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Registered On:</span>
                        <span className="font-mono text-slate-900">
                          {new Date(subscriberProfile.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {subscriberProfile.businessName && (
                        <div className="col-span-2">
                          <span className="text-slate-500 block">Business Name:</span>
                          <span className="font-medium text-slate-900">
                            {subscriberProfile.businessName}
                          </span>
                        </div>
                      )}
                      {subscriberProfile.notes && (
                        <div className="col-span-2 pt-1 border-t border-slate-200">
                          <span className="text-slate-500 block">Notes:</span>
                          <p className="text-slate-600 italic">{subscriberProfile.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Registered Addresses Card */}
                  <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>Registered Addresses</span>
                    </div>

                    {subscriberProfile.addresses && subscriberProfile.addresses.length > 0 ? (
                      <div className="space-y-2 pt-1">
                        {subscriberProfile.addresses.map((addr, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-900">{addr.label}</span>
                              {addr.isPrimary && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded font-medium">
                                  Primary
                                </span>
                              )}
                            </div>
                            <p className="text-slate-700">
                              {addr.line1}
                              {addr.line2 ? `, ${addr.line2}` : ""}
                            </p>
                            <p className="text-slate-500">
                              Barangay {addr.barangay}, {addr.cityMunicipality}, {addr.province} {addr.postalCode}
                            </p>
                            {addr.landmark && (
                              <p className="text-[11px] text-slate-600 italic">
                                Landmark: {addr.landmark}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No addresses on file.</p>
                    )}
                  </div>

                  {/* Billable Service Accounts Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-blue-600" />
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Billable Service Subscriptions ({subscriberProfile.serviceAccounts?.length || 0})
                        </h4>
                      </div>

                      {canCreateSubscriber && (
                        <button
                          onClick={() => setShowAddServiceModal(true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Service Account
                        </button>
                      )}
                    </div>

                    {subscriberProfile.serviceAccounts && subscriberProfile.serviceAccounts.length > 0 ? (
                      <div className="space-y-3">
                        {subscriberProfile.serviceAccounts.map((sa) => {
                          const isInternet = sa.serviceType?.code === "INTERNET";
                          const isCable = sa.serviceType?.code === "CABLE";
                          const isCombo = sa.serviceType?.code === "COMBO";

                          return (
                            <div
                              key={sa.id}
                              className={cn(
                                "border rounded-lg p-4 space-y-3 transition-shadow",
                                sa.status === "ACTIVE"
                                  ? "bg-white border-slate-200 shadow-xs"
                                  : "bg-rose-50/30 border-rose-200"
                              )}
                            >
                              {/* Service Header */}
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold",
                                        isInternet && "bg-blue-50 text-blue-600 border border-blue-200",
                                        isCable && "bg-purple-50 text-purple-700 border border-purple-200",
                                        isCombo && "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      )}
                                    >
                                      {isInternet && <Wifi className="w-3 h-3" />}
                                      {isCable && <Tv className="w-3 h-3" />}
                                      {isCombo && <Boxes className="w-3 h-3" />}
                                      {sa.serviceType?.name || sa.serviceType?.code}
                                    </span>

                                    <span className="font-mono text-xs font-semibold text-slate-900">
                                      {sa.serviceAccountNumber}
                                    </span>
                                  </div>

                                  <div className="text-sm font-bold text-slate-900">
                                    {sa.servicePlan?.name}
                                  </div>
                                </div>

                                <div className="text-right">
                                  <span
                                    className={cn(
                                      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border",
                                      sa.status === "ACTIVE"
                                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                        : "bg-rose-50 text-red-600 border-rose-200"
                                    )}
                                  >
                                    {sa.status}
                                  </span>
                                  <div className="mt-1 font-mono font-bold text-sm text-slate-900">
                                    {formatMoney(sa.currentRate)}
                                    <span className="text-[10px] text-slate-500 font-normal">/mo</span>
                                  </div>
                                </div>
                              </div>

                              {/* Subscription Details Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-2 border-t border-slate-100">
                                <div>
                                  <span className="text-slate-500 block">Activated:</span>
                                  <span className="font-mono text-slate-900">{sa.activationDate}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block">Billing / Due:</span>
                                  <span className="font-mono text-slate-900">Day {sa.billingDay} / Day {sa.dueDay}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block">Area:</span>
                                  <span className="text-slate-900 truncate block">
                                    {sa.collectionArea?.name || "General"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block">Collector:</span>
                                  <span className="text-slate-900 truncate block">
                                    {sa.collector?.name || "Unassigned"}
                                  </span>
                                </div>
                              </div>

                              {/* Service Control Action Bar */}
                              {canControlService && (
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                  <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                                    <Lock className="w-3 h-3 text-slate-400" />
                                    Authorized Service Control:
                                  </span>

                                  {sa.status === "ACTIVE" ? (
                                    <button
                                      onClick={() => promptStatusChange(sa, "SUSPENDED")}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors cursor-pointer"
                                    >
                                      <ShieldAlert className="w-3.5 h-3.5" />
                                      Suspend Service
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => promptStatusChange(sa, "ACTIVE")}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors cursor-pointer"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Reconnect Service
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Immutable Status History Timeline */}
                              {sa.statusHistory && sa.statusHistory.length > 0 && (
                                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                                    Status Transition Audit Trail
                                  </span>
                                  <div className="space-y-1.5">
                                    {sa.statusHistory.map((h, i) => (
                                      <div
                                        key={h.id || i}
                                        className="text-[11px] bg-slate-50 p-2 rounded border border-slate-200 space-y-0.5"
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5 font-medium text-slate-900">
                                            <span className="px-1 py-0.2 bg-slate-100 rounded text-[9px] font-bold">
                                              {h.fromStatus}
                                            </span>
                                            &rarr;
                                            <span className="px-1 py-0.2 bg-blue-50 text-blue-600 rounded text-[9px] font-bold">
                                              {h.toStatus}
                                            </span>
                                          </div>
                                          <span className="font-mono text-[10px] text-slate-400">
                                            {new Date(h.effectiveAt).toLocaleString()}
                                          </span>
                                        </div>
                                        <p className="text-slate-600">
                                          <span className="font-semibold text-slate-900">Reason:</span> {h.reason}
                                        </p>
                                        {h.actor && (
                                          <p className="text-[10px] text-slate-500">
                                            Authorized by: {h.actor.displayName || h.actor.username}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center text-xs text-slate-500">
                        No active service subscriptions under this subscriber. Click "Add Service Account" above to bind a catalog plan.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: Register New Subscriber                            */}
      {/* ========================================================= */}
      {showCreateModal && (
        <CreateSubscriberModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={async (newSub) => {
            setShowCreateModal(false);
            await fetchSubscribers();
            openSubscriberDrawer(newSub.id);
          }}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL: Add Billable Service Account                       */}
      {/* ========================================================= */}
      {showAddServiceModal && subscriberProfile && (
        <AddServiceAccountModal
          subscriber={subscriberProfile}
          plans={servicePlans}
          areas={collectionAreas}
          collectors={collectors}
          onClose={() => setShowAddServiceModal(false)}
          onSuccess={async () => {
            setShowAddServiceModal(false);
            if (selectedSubscriberId) {
              await fetchProfile(selectedSubscriberId);
            }
            await fetchSubscribers();
          }}
        />
      )}

      {/* ========================================================= */}
      {/* MODAL: Service Status Transition (Mandatory Reason)       */}
      {/* ========================================================= */}
      {showStatusModal && targetServiceAccount && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full border border-slate-300 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldAlert
                  className={cn(
                    "w-5 h-5",
                    newStatusAction === "SUSPENDED" ? "text-red-600" : "text-emerald-600"
                  )}
                />
                <h3 className="text-sm font-bold text-slate-900">
                  Confirm Service {newStatusAction === "SUSPENDED" ? "Suspension" : "Reconnection"}
                </h3>
              </div>
              <button
                onClick={() => setShowStatusModal(false)}
                className="text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={executeStatusChange} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Service Account:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {targetServiceAccount.serviceAccountNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Plan / Rate:</span>
                  <span className="font-medium text-slate-900">
                    {targetServiceAccount.servicePlan?.name} ({formatMoney(targetServiceAccount.currentRate)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Action:</span>
                  <span
                    className={cn(
                      "font-bold",
                      newStatusAction === "SUSPENDED" ? "text-red-600" : "text-emerald-600"
                    )}
                  >
                    {targetServiceAccount.status} &rarr; {newStatusAction}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1">
                  Reason for Status Change <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Non-payment of past due invoices"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:outline-hidden focus:ring-1 focus:ring-blue-600"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Mandatory for financial and operational audit trail compliance.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-900 mb-1">
                  Operational Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional technician or dispatch remarks..."
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:outline-hidden focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusActionSubmitting || !statusReason.trim()}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold text-white rounded transition-colors disabled:opacity-50",
                    newStatusAction === "SUSPENDED"
                      ? "bg-red-600 hover:bg-rose-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  )}
                >
                  {statusActionSubmitting ? "Processing..." : `Execute ${newStatusAction}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reusable Subscriber Financial Ledger Modal */}
      <SubscriberLedgerModal
        subscriberId={ledgerSubscriberId}
        onClose={() => setLedgerSubscriberId(null)}
        onOpenSoa={(id) => {
          setLedgerSubscriberId(null);
          setSoaSubscriberId(id);
        }}
      />

      {/* Reusable Subscriber Statement of Account (SOA) Modal */}
      <SubscriberSoaModal
        subscriberId={soaSubscriberId}
        onClose={() => setSoaSubscriberId(null)}
        onOpenLedger={(id) => {
          setSoaSubscriberId(null);
          setLedgerSubscriberId(id);
        }}
      />
    </div>
  );
}

// =========================================================
// SUB-COMPONENT: Create Subscriber Modal
// =========================================================
function CreateSubscriberModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (subscriber: Subscriber) => void;
}) {
  const [formData, setFormData] = useState<CreateSubscriberPayload>({
    firstName: "",
    middleName: "",
    lastName: "",
    businessName: "",
    primaryContactNumber: "",
    secondaryContactNumber: "",
    email: "",
    notes: "",
    address: {
      label: "Home",
      line1: "",
      line2: "",
      barangay: "Casisang",
      cityMunicipality: "Malaybalay City",
      province: "Bukidnon",
      postalCode: "8700",
      landmark: "",
    },
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const created = await api.createSubscriber(formData);
      onSuccess(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register subscriber");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-xl w-full border border-slate-300 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Register New Subscriber</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-red-600 font-medium">
              {error}
            </div>
          )}

          {/* Section: Identity */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-600 uppercase tracking-wider text-[11px]">
              Customer Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-slate-900 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-900 mb-1">Middle Name</label>
                <input
                  type="text"
                  value={formData.middleName || ""}
                  onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-900 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-900 mb-1">Business Name (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Bukidnon Enterprise Trading"
                value={formData.businessName || ""}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Section: Contact */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <h4 className="font-bold text-slate-600 uppercase tracking-wider text-[11px]">
              Contact Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-900 mb-1">
                  Primary Contact Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="0917-123-4567"
                  value={formData.primaryContactNumber}
                  onChange={(e) => setFormData({ ...formData, primaryContactNumber: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-900 mb-1">Secondary Contact Number</label>
                <input
                  type="text"
                  placeholder="088-813-1234"
                  value={formData.secondaryContactNumber || ""}
                  onChange={(e) => setFormData({ ...formData, secondaryContactNumber: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden font-mono"
                />
              </div>

              <div className="col-span-2">
                <label className="block font-medium text-slate-900 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="customer@example.com"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section: Primary Installation Address */}
          <div className="space-y-3 pt-3 border-t border-slate-200">
            <h4 className="font-bold text-slate-600 uppercase tracking-wider text-[11px]">
              Primary Address (Bukidnon)
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block font-medium text-slate-900 mb-1">
                  Street / House Number / Purok <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Purok 4, Sayre Highway"
                  value={formData.address.line1}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: { ...formData.address, line1: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-900 mb-1">
                    Barangay <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.address.barangay}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, barangay: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                  >
                    <option value="Casisang">Casisang</option>
                    <option value="Poblacion">Poblacion</option>
                    <option value="Sumpong">Sumpong</option>
                    <option value="San Jose">San Jose</option>
                    <option value="Kalasungay">Kalasungay</option>
                    <option value="Aglayan">Aglayan</option>
                    <option value="Laguitas">Laguitas</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-900 mb-1">City / Municipality</label>
                  <input
                    type="text"
                    disabled
                    value={formData.address.cityMunicipality}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded bg-slate-100 text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-900 mb-1">Landmark / Directions</label>
                <input
                  type="text"
                  placeholder="e.g. Near Barangay Hall, yellow gate"
                  value={formData.address.landmark || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: { ...formData.address, landmark: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {submitting ? "Saving..." : "Create Subscriber"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================
// SUB-COMPONENT: Add Service Account Modal
// =========================================================
function AddServiceAccountModal({
  subscriber,
  plans,
  areas,
  collectors,
  onClose,
  onSuccess,
}: {
  subscriber: Subscriber;
  plans: ServicePlan[];
  areas: CollectionArea[];
  collectors: Collector[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[0]?.id || "");
  const [selectedAreaId, setSelectedAreaId] = useState<string>(areas[0]?.id || "");
  const [selectedCollectorId, setSelectedCollectorId] = useState<string>(collectors[0]?.id || "");
  const [billingDay, setBillingDay] = useState(1);
  const [dueDay, setDueDay] = useState(15);
  const [activationReason, setActivationReason] = useState("Initial new subscription request");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId) return;

    setSubmitting(true);
    setError(null);

    try {
      await api.createServiceAccount(subscriber.id, {
        servicePlanId: selectedPlanId,
        collectionAreaId: selectedAreaId || undefined,
        collectorId: selectedCollectorId || undefined,
        billingDay,
        dueDay,
        reason: activationReason.trim(),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add service account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full border border-slate-300 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Add Billable Service Account</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-red-600 font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-900 mb-1">
              Select Service Plan <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.serviceType?.code}] {p.name} &bull; {formatMoney(p.monthlyPrice)}/mo
                </option>
              ))}
            </select>
          </div>

          {/* Rate Snapshot Banner */}
          {selectedPlan && (
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded text-xs space-y-1">
              <div className="flex justify-between font-semibold text-slate-900">
                <span>Locked Monthly Rate:</span>
                <span className="font-mono text-base text-blue-600">
                  {formatMoney(selectedPlan.monthlyPrice)}
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                Invariant: Rate will be snapshotted authoritatively into the service account.
                Future catalog price adjustments will not alter this subscription rate.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-900 mb-1">Collection Area</label>
              <select
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-900 mb-1">Field Collector</label>
              <select
                value={selectedCollectorId}
                onChange={(e) => setSelectedCollectorId(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
              >
                <option value="">Unassigned</option>
                {collectors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.collectorCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-900 mb-1">Billing Day</label>
              <input
                type="number"
                min={1}
                max={28}
                value={billingDay}
                onChange={(e) => setBillingDay(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-900 mb-1">Due Day</label>
              <input
                type="number"
                min={1}
                max={28}
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-900 mb-1">
              Activation Reason <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={activationReason}
              onChange={(e) => setActivationReason(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {submitting ? "Binding Plan..." : "Add Subscription"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
