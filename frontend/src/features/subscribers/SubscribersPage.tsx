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
          <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">Subscriber Directory</h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Authoritative registry of subscribers, billable service accounts, and service controls
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchSubscribers()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-md hover:bg-[#F8FAFC] shadow-2xs transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>

          {canCreateSubscriber && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Register Subscriber
            </button>
          )}
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-3.5 border border-[#E2E8F0] rounded-lg shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by account #, name, phone, or business..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] text-[#0F172A] placeholder:text-[#94A3B8]"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-[#64748B] font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2.5 py-1.5 text-[#0F172A] focus:outline-hidden focus:ring-1 focus:ring-[#2563EB]"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold text-[#475569] uppercase tracking-wider">
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
                  <td colSpan={7} className="py-12 text-center text-[#64748B]">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-[#2563EB]" />
                      <span>Loading subscribers from database...</span>
                    </div>
                  </td>
                </tr>
              ) : subscribers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#64748B]">
                    <div className="flex flex-col items-center gap-2">
                      <Boxes className="w-8 h-8 text-[#CBD5E1]" />
                      <span className="font-medium text-[#0F172A]">No subscribers found</span>
                      <p className="text-xs text-[#94A3B8]">
                        {search ? "No matching records found. Try adjusting your search query." : "No subscribers have been created yet."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                subscribers.map((sub) => (
                  <tr key={sub.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-[#2563EB]">
                      <button
                        onClick={() => openSubscriberDrawer(sub.id)}
                        className="hover:underline flex items-center gap-1 text-left cursor-pointer"
                      >
                        {sub.accountNumber}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#0F172A]">
                        {sub.lastName}, {sub.firstName} {sub.middleName ? `${sub.middleName[0]}.` : ""}
                      </div>
                      {sub.businessName && (
                        <div className="text-[11px] text-[#64748B] flex items-center gap-1">
                          <span className="italic">{sub.businessName}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#334155] font-mono">
                      {sub.primaryContactNumber}
                    </td>
                    <td className="py-3 px-4 text-[#475569]">
                      {sub.primaryAddress ? (
                        <span>
                          {sub.primaryAddress.barangay}, {sub.primaryAddress.cityMunicipality}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8] italic">No address recorded</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-[#2563EB] border border-blue-100">
                        {sub.serviceAccountsCount || 0} active
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                          sub.status === "ACTIVE"
                            ? "bg-emerald-50 text-[#059669] border-emerald-200"
                            : "bg-slate-100 text-[#475569] border-slate-200"
                        )}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => openSubscriberDrawer(sub.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#2563EB] hover:bg-blue-50 rounded border border-transparent hover:border-blue-200 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
          <div>
            Showing <span className="font-semibold text-[#0F172A]">{subscribers.length}</span> of{" "}
            <span className="font-semibold text-[#0F172A]">{totalCount}</span> subscribers
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-2.5 py-1 bg-white border border-[#CBD5E1] rounded text-[#334155] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F1F5F9] transition-colors"
            >
              Previous
            </button>
            <span className="px-2 font-mono">
              Page {page} of {Math.max(1, totalPages)}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-2.5 py-1 bg-white border border-[#CBD5E1] rounded text-[#334155] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F1F5F9] transition-colors"
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
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-50 text-[#2563EB]">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[#0F172A]">
                      {subscriberProfile
                        ? `${subscriberProfile.lastName}, ${subscriberProfile.firstName} ${subscriberProfile.middleName || ""}`
                        : "Loading profile..."}
                    </h3>
                    {subscriberProfile && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-[#059669] border border-emerald-200">
                        {subscriberProfile.status}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-[#64748B]">
                    {subscriberProfile?.accountNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={closeSubscriberDrawer}
                className="p-1.5 text-[#64748B] hover:text-[#0F172A] hover:bg-[#E2E8F0] rounded-md transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {profileLoading || !subscriberProfile ? (
                <div className="py-20 flex flex-col items-center justify-center text-[#64748B] gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
                  <span className="text-xs">Fetching subscriber profile...</span>
                </div>
              ) : (
                <>
                  {/* Subscriber Metadata Card */}
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-[#475569] uppercase tracking-wider">
                      Contact & Account Information
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#64748B] block">Primary Phone:</span>
                        <span className="font-mono font-medium text-[#0F172A]">
                          {subscriberProfile.primaryContactNumber}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block">Secondary Phone:</span>
                        <span className="font-mono text-[#0F172A]">
                          {subscriberProfile.secondaryContactNumber || "None"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block">Email Address:</span>
                        <span className="text-[#0F172A]">
                          {subscriberProfile.email || "None"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block">Registered On:</span>
                        <span className="font-mono text-[#0F172A]">
                          {new Date(subscriberProfile.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {subscriberProfile.businessName && (
                        <div className="col-span-2">
                          <span className="text-[#64748B] block">Business Name:</span>
                          <span className="font-medium text-[#0F172A]">
                            {subscriberProfile.businessName}
                          </span>
                        </div>
                      )}
                      {subscriberProfile.notes && (
                        <div className="col-span-2 pt-1 border-t border-[#E2E8F0]">
                          <span className="text-[#64748B] block">Notes:</span>
                          <p className="text-[#475569] italic">{subscriberProfile.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Registered Addresses Card */}
                  <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#475569] uppercase tracking-wider">
                      <MapPin className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>Registered Addresses</span>
                    </div>

                    {subscriberProfile.addresses && subscriberProfile.addresses.length > 0 ? (
                      <div className="space-y-2 pt-1">
                        {subscriberProfile.addresses.map((addr, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-[#0F172A]">{addr.label}</span>
                              {addr.isPrimary && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-blue-50 text-[#2563EB] border border-blue-200 rounded font-medium">
                                  Primary
                                </span>
                              )}
                            </div>
                            <p className="text-[#334155]">
                              {addr.line1}
                              {addr.line2 ? `, ${addr.line2}` : ""}
                            </p>
                            <p className="text-[#64748B]">
                              Barangay {addr.barangay}, {addr.cityMunicipality}, {addr.province} {addr.postalCode}
                            </p>
                            {addr.landmark && (
                              <p className="text-[11px] text-[#475569] italic">
                                Landmark: {addr.landmark}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#94A3B8] italic">No addresses on file.</p>
                    )}
                  </div>

                  {/* Billable Service Accounts Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-[#2563EB]" />
                        <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                          Billable Service Subscriptions ({subscriberProfile.serviceAccounts?.length || 0})
                        </h4>
                      </div>

                      {canCreateSubscriber && (
                        <button
                          onClick={() => setShowAddServiceModal(true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#2563EB] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors cursor-pointer"
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
                                  ? "bg-white border-[#E2E8F0] shadow-xs"
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
                                        isInternet && "bg-blue-50 text-[#2563EB] border border-blue-200",
                                        isCable && "bg-purple-50 text-purple-700 border border-purple-200",
                                        isCombo && "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      )}
                                    >
                                      {isInternet && <Wifi className="w-3 h-3" />}
                                      {isCable && <Tv className="w-3 h-3" />}
                                      {isCombo && <Boxes className="w-3 h-3" />}
                                      {sa.serviceType?.name || sa.serviceType?.code}
                                    </span>

                                    <span className="font-mono text-xs font-semibold text-[#0F172A]">
                                      {sa.serviceAccountNumber}
                                    </span>
                                  </div>

                                  <div className="text-sm font-bold text-[#0F172A]">
                                    {sa.servicePlan?.name}
                                  </div>
                                </div>

                                <div className="text-right">
                                  <span
                                    className={cn(
                                      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border",
                                      sa.status === "ACTIVE"
                                        ? "bg-emerald-50 text-[#059669] border-emerald-200"
                                        : "bg-rose-50 text-[#DC2626] border-rose-200"
                                    )}
                                  >
                                    {sa.status}
                                  </span>
                                  <div className="mt-1 font-mono font-bold text-sm text-[#0F172A]">
                                    {formatMoney(sa.currentRate)}
                                    <span className="text-[10px] text-[#64748B] font-normal">/mo</span>
                                  </div>
                                </div>
                              </div>

                              {/* Subscription Details Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-2 border-t border-[#F1F5F9]">
                                <div>
                                  <span className="text-[#64748B] block">Activated:</span>
                                  <span className="font-mono text-[#0F172A]">{sa.activationDate}</span>
                                </div>
                                <div>
                                  <span className="text-[#64748B] block">Billing / Due:</span>
                                  <span className="font-mono text-[#0F172A]">Day {sa.billingDay} / Day {sa.dueDay}</span>
                                </div>
                                <div>
                                  <span className="text-[#64748B] block">Area:</span>
                                  <span className="text-[#0F172A] truncate block">
                                    {sa.collectionArea?.name || "General"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#64748B] block">Collector:</span>
                                  <span className="text-[#0F172A] truncate block">
                                    {sa.collector?.name || "Unassigned"}
                                  </span>
                                </div>
                              </div>

                              {/* Service Control Action Bar */}
                              {canControlService && (
                                <div className="flex items-center justify-between pt-2 border-t border-[#F1F5F9]">
                                  <span className="text-[11px] text-[#64748B] font-medium flex items-center gap-1">
                                    <Lock className="w-3 h-3 text-[#94A3B8]" />
                                    Authorized Service Control:
                                  </span>

                                  {sa.status === "ACTIVE" ? (
                                    <button
                                      onClick={() => promptStatusChange(sa, "SUSPENDED")}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#DC2626] bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors cursor-pointer"
                                    >
                                      <ShieldAlert className="w-3.5 h-3.5" />
                                      Suspend Service
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => promptStatusChange(sa, "ACTIVE")}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#059669] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors cursor-pointer"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Reconnect Service
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Immutable Status History Timeline */}
                              {sa.statusHistory && sa.statusHistory.length > 0 && (
                                <div className="pt-2 border-t border-[#F1F5F9] space-y-1.5">
                                  <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider block">
                                    Status Transition Audit Trail
                                  </span>
                                  <div className="space-y-1.5">
                                    {sa.statusHistory.map((h, i) => (
                                      <div
                                        key={h.id || i}
                                        className="text-[11px] bg-[#F8FAFC] p-2 rounded border border-[#E2E8F0] space-y-0.5"
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5 font-medium text-[#0F172A]">
                                            <span className="px-1 py-0.2 bg-slate-100 rounded text-[9px] font-bold">
                                              {h.fromStatus}
                                            </span>
                                            &rarr;
                                            <span className="px-1 py-0.2 bg-blue-50 text-[#2563EB] rounded text-[9px] font-bold">
                                              {h.toStatus}
                                            </span>
                                          </div>
                                          <span className="font-mono text-[10px] text-[#94A3B8]">
                                            {new Date(h.effectiveAt).toLocaleString()}
                                          </span>
                                        </div>
                                        <p className="text-[#475569]">
                                          <span className="font-semibold text-[#0F172A]">Reason:</span> {h.reason}
                                        </p>
                                        {h.actor && (
                                          <p className="text-[10px] text-[#64748B]">
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
                      <div className="p-6 bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded-lg text-center text-xs text-[#64748B]">
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
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full border border-[#CBD5E1] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <div className="flex items-center gap-2">
                <ShieldAlert
                  className={cn(
                    "w-5 h-5",
                    newStatusAction === "SUSPENDED" ? "text-[#DC2626]" : "text-[#059669]"
                  )}
                />
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Confirm Service {newStatusAction === "SUSPENDED" ? "Suspension" : "Reconnection"}
                </h3>
              </div>
              <button
                onClick={() => setShowStatusModal(false)}
                className="text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={executeStatusChange} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Service Account:</span>
                  <span className="font-mono font-bold text-[#0F172A]">
                    {targetServiceAccount.serviceAccountNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Plan / Rate:</span>
                  <span className="font-medium text-[#0F172A]">
                    {targetServiceAccount.servicePlan?.name} ({formatMoney(targetServiceAccount.currentRate)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Action:</span>
                  <span
                    className={cn(
                      "font-bold",
                      newStatusAction === "SUSPENDED" ? "text-[#DC2626]" : "text-[#059669]"
                    )}
                  >
                    {targetServiceAccount.status} &rarr; {newStatusAction}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Reason for Status Change <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Non-payment of past due invoices"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-[#CBD5E1] rounded focus:outline-hidden focus:ring-1 focus:ring-[#2563EB]"
                />
                <p className="text-[11px] text-[#64748B] mt-1">
                  Mandatory for financial and operational audit trail compliance.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F172A] mb-1">
                  Operational Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional technician or dispatch remarks..."
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-[#CBD5E1] rounded focus:outline-hidden focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded hover:bg-[#F8FAFC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusActionSubmitting || !statusReason.trim()}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold text-white rounded transition-colors disabled:opacity-50",
                    newStatusAction === "SUSPENDED"
                      ? "bg-[#DC2626] hover:bg-rose-700"
                      : "bg-[#059669] hover:bg-emerald-700"
                  )}
                >
                  {statusActionSubmitting ? "Processing..." : `Execute ${newStatusAction}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
      <div className="bg-white rounded-lg shadow-2xl max-w-xl w-full border border-[#CBD5E1] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#2563EB]" />
            <h3 className="text-sm font-bold text-[#0F172A]">Register New Subscriber</h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-[#DC2626] font-medium">
              {error}
            </div>
          )}

          {/* Section: Identity */}
          <div className="space-y-3">
            <h4 className="font-bold text-[#475569] uppercase tracking-wider text-[11px]">
              Customer Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-[#0F172A] mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-medium text-[#0F172A] mb-1">Middle Name</label>
                <input
                  type="text"
                  value={formData.middleName || ""}
                  onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                  className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-medium text-[#0F172A] mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-[#0F172A] mb-1">Business Name (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Bukidnon Enterprise Trading"
                value={formData.businessName || ""}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Section: Contact */}
          <div className="space-y-3 pt-3 border-t border-[#E2E8F0]">
            <h4 className="font-bold text-[#475569] uppercase tracking-wider text-[11px]">
              Contact Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#0F172A] mb-1">
                  Primary Contact Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="0917-123-4567"
                  value={formData.primaryContactNumber}
                  onChange={(e) => setFormData({ ...formData, primaryContactNumber: e.target.value })}
                  className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-[#0F172A] mb-1">Secondary Contact Number</label>
                <input
                  type="text"
                  placeholder="088-813-1234"
                  value={formData.secondaryContactNumber || ""}
                  onChange={(e) => setFormData({ ...formData, secondaryContactNumber: e.target.value })}
                  className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden font-mono"
                />
              </div>

              <div className="col-span-2">
                <label className="block font-medium text-[#0F172A] mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="customer@example.com"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section: Primary Installation Address */}
          <div className="space-y-3 pt-3 border-t border-[#E2E8F0]">
            <h4 className="font-bold text-[#475569] uppercase tracking-wider text-[11px]">
              Primary Address (Bukidnon)
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block font-medium text-[#0F172A] mb-1">
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
                  className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#0F172A] mb-1">
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
                    className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
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
                  <label className="block font-medium text-[#0F172A] mb-1">City / Municipality</label>
                  <input
                    type="text"
                    disabled
                    value={formData.address.cityMunicipality}
                    className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded bg-[#F1F5F9] text-[#64748B]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#0F172A] mb-1">Landmark / Directions</label>
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
                  className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded hover:bg-[#F8FAFC] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded disabled:opacity-50 cursor-pointer shadow-xs"
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
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full border border-[#CBD5E1] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#2563EB]" />
            <h3 className="text-sm font-bold text-[#0F172A]">Add Billable Service Account</h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-[#DC2626] font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block font-medium text-[#0F172A] mb-1">
              Select Service Plan <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
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
              <div className="flex justify-between font-semibold text-[#0F172A]">
                <span>Locked Monthly Rate:</span>
                <span className="font-mono text-base text-[#2563EB]">
                  {formatMoney(selectedPlan.monthlyPrice)}
                </span>
              </div>
              <p className="text-[11px] text-[#475569]">
                Invariant: Rate will be snapshotted authoritatively into the service account.
                Future catalog price adjustments will not alter this subscription rate.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#0F172A] mb-1">Collection Area</label>
              <select
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
                className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#0F172A] mb-1">Field Collector</label>
              <select
                value={selectedCollectorId}
                onChange={(e) => setSelectedCollectorId(e.target.value)}
                className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
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
              <label className="block font-medium text-[#0F172A] mb-1">Billing Day</label>
              <input
                type="number"
                min={1}
                max={28}
                value={billingDay}
                onChange={(e) => setBillingDay(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-[#0F172A] mb-1">Due Day</label>
              <input
                type="number"
                min={1}
                max={28}
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#0F172A] mb-1">
              Activation Reason <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={activationReason}
              onChange={(e) => setActivationReason(e.target.value)}
              className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded focus:ring-1 focus:ring-[#2563EB] focus:outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded hover:bg-[#F8FAFC] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {submitting ? "Binding Plan..." : "Add Subscription"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
