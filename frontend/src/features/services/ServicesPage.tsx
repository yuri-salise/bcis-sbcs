import React, { useState, useEffect, useCallback } from "react";
import {
  Layers,
  Wifi,
  Tv,
  Zap,
  MapPin,
  RefreshCw,
  Search,
  Gauge,
  SlidersHorizontal,
  FileText,
  ShieldCheck,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  api,
  type ServicePlan,
  type CollectionArea,
  type Collector,
} from "../../api/client";
import { cn, formatMoney } from "../../lib/utils";

type ServiceTab = "plans" | "areas" | "policies";
type TypeFilter = "ALL" | "INTERNET" | "CABLE" | "COMBO";

export const ServicesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ServiceTab>("plans");
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [areas, setAreas] = useState<CollectionArea[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansData, areasData, collectorsData] = await Promise.all([
        api.listServicePlans(),
        api.listCollectionAreas(),
        api.listCollectors(),
      ]);
      setPlans(plansData);
      setAreas(areasData);
      setCollectors(collectorsData);
    } catch (err: unknown) {
      console.error("Failed to load services data", err);
      setError(err instanceof Error ? err.message : "Failed to load services catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered Plans
  const filteredPlans = plans.filter((plan) => {
    const matchesSearch =
      search.trim() === "" ||
      plan.name.toLowerCase().includes(search.toLowerCase()) ||
      plan.code.toLowerCase().includes(search.toLowerCase()) ||
      (plan.description && plan.description.toLowerCase().includes(search.toLowerCase()));

    const matchesType =
      typeFilter === "ALL" ||
      (typeFilter === "INTERNET" && plan.serviceType?.code === "INTERNET") ||
      (typeFilter === "CABLE" && plan.serviceType?.code === "CABLE") ||
      (typeFilter === "COMBO" && plan.serviceType?.code === "COMBO");

    return matchesSearch && matchesType;
  });

  // Filtered Areas
  const filteredAreas = areas.filter((area) => {
    return (
      search.trim() === "" ||
      area.name.toLowerCase().includes(search.toLowerCase()) ||
      area.code.toLowerCase().includes(search.toLowerCase()) ||
      (area.description && area.description.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const internetPlansCount = plans.filter((p) => p.serviceType?.code === "INTERNET").length;
  const cablePlansCount = plans.filter((p) => p.serviceType?.code === "CABLE").length;
  const comboPlansCount = plans.filter((p) => p.serviceType?.code === "COMBO").length;

  return (
    <div className="space-y-6" data-testid="services-page">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">Services & Plans Catalog</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-[#2563EB] border border-blue-200 font-medium">
              Official Catalog
            </span>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Broadband Internet speed tiers, digital cable television lineups, and municipal coverage areas
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-md hover:bg-[#F8FAFC] shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Plans */}
        <div className="bg-white p-4 rounded-lg border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-[#64748B]">Active Service Plans</div>
            <div className="text-2xl font-bold font-mono text-[#0F172A] mt-1">{plans.length}</div>
            <div className="text-[11px] text-[#059669] font-medium mt-0.5">Catalog tiers online</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Broadband Internet */}
        <div className="bg-white p-4 rounded-lg border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-[#64748B]">Fiber Broadband Tiers</div>
            <div className="text-2xl font-bold font-mono text-[#0F172A] mt-1">{internetPlansCount}</div>
            <div className="text-[11px] text-[#64748B] font-medium mt-0.5">Up to 100+ Mbps</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-[#059669] flex items-center justify-center">
            <Wifi className="w-5 h-5" />
          </div>
        </div>

        {/* Cable & Combo */}
        <div className="bg-white p-4 rounded-lg border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-[#64748B]">Cable & Bundles</div>
            <div className="text-2xl font-bold font-mono text-[#0F172A] mt-1">
              {cablePlansCount + comboPlansCount}
            </div>
            <div className="text-[11px] text-[#64748B] font-medium mt-0.5">TV & Dual-Play Bundles</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Tv className="w-5 h-5" />
          </div>
        </div>

        {/* Coverage Areas */}
        <div className="bg-white p-4 rounded-lg border border-[#E2E8F0] shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-[#64748B]">Coverage Zones</div>
            <div className="text-2xl font-bold font-mono text-[#0F172A] mt-1">{areas.length}</div>
            <div className="text-[11px] text-[#64748B] font-medium mt-0.5">
              {collectors.length} Field Collectors
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <MapPin className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-1.5 shadow-2xs flex items-center gap-2">
        <button
          onClick={() => setActiveTab("plans")}
          data-testid="tab-plans"
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer",
            activeTab === "plans"
              ? "bg-[#2563EB] text-white shadow-2xs"
              : "text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
          )}
        >
          <Layers className="w-4 h-4" />
          <span>Service Plans Catalog ({plans.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("areas")}
          data-testid="tab-areas"
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer",
            activeTab === "areas"
              ? "bg-[#2563EB] text-white shadow-2xs"
              : "text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
          )}
        >
          <MapPin className="w-4 h-4" />
          <span>Coverage & Collection Areas ({areas.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("policies")}
          data-testid="tab-policies"
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer",
            activeTab === "policies"
              ? "bg-[#2563EB] text-white shadow-2xs"
              : "text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
          )}
        >
          <FileText className="w-4 h-4" />
          <span>Service Policies & Fees</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      {activeTab !== "policies" && (
        <div className="bg-white p-3.5 border border-[#E2E8F0] rounded-lg shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeTab === "plans"
                  ? "Search plans by name, code, or speed..."
                  : "Search collection areas by name or code..."
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB] text-[#0F172A] placeholder:text-[#94A3B8]"
            />
          </div>

          {activeTab === "plans" && (
            <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto">
              <span className="text-xs text-[#64748B] mr-1 flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Type:
              </span>
              {(["ALL", "INTERNET", "CABLE", "COMBO"] as TypeFilter[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap",
                    typeFilter === t
                      ? "bg-[#0F172A] text-white"
                      : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                  )}
                >
                  {t === "ALL" ? "All Packages" : t === "INTERNET" ? "Fiber Internet" : t === "CABLE" ? "Cable TV" : "Combo Bundles"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 1: Service Plans */}
      {activeTab === "plans" && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                  <th className="py-3 px-4">Plan Code</th>
                  <th className="py-3 px-4">Service Plan Name</th>
                  <th className="py-3 px-4">Service Type</th>
                  <th className="py-3 px-4">Bandwidth / Lineup</th>
                  <th className="py-3 px-4 text-right">Monthly Fee</th>
                  <th className="py-3 px-4 text-right">Installation</th>
                  <th className="py-3 px-4 text-right">Reconnection</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#64748B]">
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
                        <span>Loading service catalog...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredPlans.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#64748B]">
                      <div className="flex flex-col items-center gap-2">
                        <Layers className="w-8 h-8 text-[#CBD5E1]" />
                        <span className="font-medium text-[#0F172A]">No service plans found</span>
                        <p className="text-xs text-[#94A3B8]">
                          {search.trim() ? "No plans match your search query." : "No plans currently active."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredPlans.map((plan) => {
                    const isInternet = plan.serviceType?.code === "INTERNET";
                    const isCable = plan.serviceType?.code === "CABLE";

                    return (
                      <tr key={plan.id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-[#2563EB]">
                          {plan.code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#0F172A]">{plan.name}</div>
                          {plan.description && (
                            <div className="text-[11px] text-[#64748B] mt-0.5 line-clamp-1">
                              {plan.description}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border",
                              isInternet
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : isCable
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-purple-50 text-purple-700 border-purple-200"
                            )}
                          >
                            {isInternet ? (
                              <Wifi className="w-3 h-3" />
                            ) : isCable ? (
                              <Tv className="w-3 h-3" />
                            ) : (
                              <Zap className="w-3 h-3" />
                            )}
                            {plan.serviceType?.name || plan.serviceType?.code}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {plan.speedMbps ? (
                            <div className="flex items-center gap-1.5 font-mono font-medium text-[#0F172A]">
                              <Gauge className="w-3.5 h-3.5 text-[#2563EB]" />
                              <span>{plan.speedMbps} Mbps</span>
                            </div>
                          ) : plan.channelCount ? (
                            <div className="flex items-center gap-1.5 font-mono font-medium text-[#0F172A]">
                              <Tv className="w-3.5 h-3.5 text-amber-600" />
                              <span>{plan.channelCount} Channels</span>
                            </div>
                          ) : (
                            <span className="text-[#94A3B8]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-[#0F172A]">
                          {formatMoney(plan.monthlyPrice)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[#475569]">
                          {formatMoney(plan.installationFee)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[#475569]">
                          {formatMoney(plan.reconnectionFee)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider",
                              plan.isActive
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-600"
                            )}
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                plan.isActive ? "bg-emerald-500" : "bg-slate-400"
                              )}
                            />
                            {plan.isActive ? "Active" : "Archived"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Coverage Areas */}
      {activeTab === "areas" && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                  <th className="py-3 px-4">Area Code</th>
                  <th className="py-3 px-4">Barangay / Coverage Zone</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Assigned Collector</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#64748B]">
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
                        <span>Loading coverage zones...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredAreas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#64748B]">
                      <div className="flex flex-col items-center gap-2">
                        <MapPin className="w-8 h-8 text-[#CBD5E1]" />
                        <span className="font-medium text-[#0F172A]">No coverage areas found</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAreas.map((area) => {
                    const assignedCollector = collectors.find(
                      (c) => c.isActive
                    ); // default display indicator

                    return (
                      <tr key={area.id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-[#2563EB]">
                          {area.code}
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#0F172A]">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-[#2563EB]" />
                            <span>{area.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#475569]">
                          {area.description || "Malaybalay City, Bukidnon"}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs text-[#0F172A] font-medium">
                            {assignedCollector ? assignedCollector.name : "Unassigned"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider",
                              area.isActive
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-600"
                            )}
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                area.isActive ? "bg-emerald-500" : "bg-slate-400"
                              )}
                            />
                            {area.isActive ? "Operational" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Service Policies */}
      {activeTab === "policies" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2.5 text-[#0F172A] font-bold text-sm border-b border-[#E2E8F0] pb-3">
              <Clock className="w-4 h-4 text-[#2563EB]" />
              <span>Billing Cycles & Due Dates</span>
            </div>
            <ul className="space-y-3 text-xs text-[#475569]">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-1.5 shrink-0" />
                <span>
                  <strong>Monthly Cycle:</strong> Invoices are generated at the 1st of each calendar month covering the active subscription cycle.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-1.5 shrink-0" />
                <span>
                  <strong>Due Date:</strong> Due dates default to the 15th of the billing month (14-day standard settlement window).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-1.5 shrink-0" />
                <span>
                  <strong>5-Day Grace Period:</strong> Overdue penalties and automated service disconnection notices activate strictly after the 5-day grace period.
                </span>
              </li>
            </ul>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2.5 text-[#0F172A] font-bold text-sm border-b border-[#E2E8F0] pb-3">
              <ShieldCheck className="w-4 h-4 text-[#059669]" />
              <span>Suspension & Reconnection Standards</span>
            </div>
            <ul className="space-y-3 text-xs text-[#475569]">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#059669] mt-1.5 shrink-0" />
                <span>
                  <strong>Delinquency Threshold:</strong> Service accounts with overdue balances exceeding ₱1,500.00 or aging beyond 30 days are flagged as Suspension Candidates.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#059669] mt-1.5 shrink-0" />
                <span>
                  <strong>Reconnection Fee:</strong> A standard ₱300.00 reconnection fee applies to restore suspended fiber lines upon full arrears settlement.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#059669] mt-1.5 shrink-0" />
                <span>
                  <strong>Same-Day Restoration SLA:</strong> Paid accounts have restoration work orders dispatched to technicians within 4 business hours.
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
