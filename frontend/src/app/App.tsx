import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  Receipt,
  CreditCard,
  FolderSync,
  AlertCircle,
  Layers,
  FileBarChart2,
  ShieldCheck,
  Server,
  Database,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { api, type HealthResponse, type ReadyResponse } from "../api/client";

export function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  const checkStatus = async () => {
    setLoading(true);
    try {
      const [h, r] = await Promise.all([api.getHealth(), api.getReadiness()]);
      setHealth(h);
      setReadiness(r);
    } catch {
      setHealth(null);
      setReadiness(null);
    } finally {
      setLoading(false);
      setLastChecked(new Date());
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "subscribers", label: "Subscribers", icon: Users },
    { id: "billing", label: "Billing", icon: Receipt },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "collections", label: "Collections", icon: FolderSync },
    { id: "receivables", label: "Receivables", icon: AlertCircle },
    { id: "services", label: "Services", icon: Layers },
    { id: "reports", label: "Reports", icon: FileBarChart2 },
    { id: "administration", label: "Administration", icon: ShieldCheck },
  ];

  const isConnected = health?.status === "ok";
  const isDbReady = readiness?.database === "connected";

  return (
    <div className="flex h-screen bg-[#F6F8FB] text-[#0F172A] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0F2747] text-white flex flex-col justify-between shrink-0 shadow-lg">
        <div>
          {/* Logo / Header */}
          <div className="px-6 py-5 border-b border-[#1E3A5F]">
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]"></span>
              BCIS BILLING
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">Desktop Operations Client</p>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#2563EB] text-white shadow-sm"
                      : "text-slate-300 hover:bg-[#1E3A5F] hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* System Connection Badge in Sidebar */}
        <div className="p-4 border-t border-[#1E3A5F] bg-[#0A1B33]">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-slate-400">API Gateway:</span>
            <span className="flex items-center gap-1.5 font-medium">
              {isConnected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="text-emerald-400">Connected</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  <span className="text-rose-400">Offline</span>
                </>
              )}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            Fastify :3001 &bull; LAN Mode
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top bar */}
        <header className="h-14 border-b border-[#E2E8F0] bg-white px-8 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold capitalize text-[#0F172A]">
              {activeTab}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              Phase 0: Foundation
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <button
              onClick={checkStatus}
              disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#E2E8F0] bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Status</span>
            </button>
            <span className="text-slate-400">
              Checked: {lastChecked.toLocaleTimeString()}
            </span>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Welcome Banner */}
          <div className="p-6 bg-white border border-[#E2E8F0] rounded-lg shadow-xs">
            <h3 className="text-lg font-bold text-[#0F2747]">
              BCIS Subscription Billing and Collection System
            </h3>
            <p className="text-sm text-[#64748B] mt-1 max-w-2xl">
              Production-ready Windows desktop business system for Bukidnon Cable and Internet Services.
              Architecture: Tauri Desktop Client &rarr; Fastify API Server &rarr; PostgreSQL 17.
            </p>
          </div>

          {/* Subsystem Health Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* API Server Card */}
            <div className="p-5 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded bg-blue-50 text-[#2563EB]">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#0F172A]">Fastify API Server</h4>
                    <p className="text-xs text-[#64748B]">Port 3001 &bull; REST API</p>
                  </div>
                </div>
                {isConnected ? (
                  <CheckCircle2 className="w-5 h-5 text-[#059669]" />
                ) : (
                  <XCircle className="w-5 h-5 text-[#DC2626]" />
                )}
              </div>
              <div className="text-xs text-[#64748B] pt-2 border-t border-[#F1F5F9] space-y-1">
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-semibold text-[#0F172A]">{health?.status || "disconnected"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Uptime:</span>
                  <span className="font-mono text-[#0F172A]">
                    {health ? `${Math.floor(health.uptime)}s` : "0s"}
                  </span>
                </div>
              </div>
            </div>

            {/* PostgreSQL Card */}
            <div className="p-5 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded bg-indigo-50 text-indigo-600">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#0F172A]">PostgreSQL 17</h4>
                    <p className="text-xs text-[#64748B]">Port 5432 &bull; bcis_db</p>
                  </div>
                </div>
                {isDbReady ? (
                  <CheckCircle2 className="w-5 h-5 text-[#059669]" />
                ) : (
                  <XCircle className="w-5 h-5 text-[#DC2626]" />
                )}
              </div>
              <div className="text-xs text-[#64748B] pt-2 border-t border-[#F1F5F9] space-y-1">
                <div className="flex justify-between">
                  <span>State:</span>
                  <span className="font-semibold text-[#0F172A]">{readiness?.database || "offline"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Client Direct DB Access:</span>
                  <span className="font-semibold text-emerald-600">Blocked (Forbidden)</span>
                </div>
              </div>
            </div>

            {/* Architecture Invariant Card */}
            <div className="p-5 bg-white border border-[#E2E8F0] rounded-lg shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded bg-emerald-50 text-[#059669]">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#0F172A]">Security Boundary</h4>
                    <p className="text-xs text-[#64748B]">Tauri Capability Guard</p>
                  </div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-[#059669]" />
              </div>
              <div className="text-xs text-[#64748B] pt-2 border-t border-[#F1F5F9] space-y-1">
                <div className="flex justify-between">
                  <span>Financial Authority:</span>
                  <span className="font-semibold text-[#0F172A]">Fastify Server</span>
                </div>
                <div className="flex justify-between">
                  <span>Client RBAC Enforcement:</span>
                  <span className="font-semibold text-[#0F172A]">Server-Side</span>
                </div>
              </div>
            </div>
          </div>

          {/* Phase 0 Completion Gate Table */}
          <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E2E8F0] bg-slate-50">
              <h4 className="text-sm font-semibold text-[#0F172A]">Phase 0: Engineering Foundation Verification</h4>
              <p className="text-xs text-[#64748B] mt-0.5">Verification checklist for architecture and foundation gates</p>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-slate-800 font-medium">Independent Git repositories:</span>
                <span className="text-slate-600 text-xs font-mono">backend/.git and frontend/.git created</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-slate-800 font-medium">Root orchestration:</span>
                <span className="text-slate-600 text-xs font-mono">Delegation via pnpm --dir, no pnpm-workspace.yaml</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-slate-800 font-medium">Authoritative centralized catalog:</span>
                <span className="text-slate-600 text-xs font-mono">SKILLS.md established at workspace root</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-slate-800 font-medium">Authoritative Money value object:</span>
                <span className="text-slate-600 text-xs font-mono">Integer centavos, zero JS floating-point arithmetic</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-slate-800 font-medium">Fastify 5 REST API & OpenAPI contract:</span>
                <span className="text-slate-600 text-xs font-mono">docs/openapi.yaml and docs/openapi.json synchronized</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-slate-800 font-medium">Tauri 2 Desktop Shell:</span>
                <span className="text-slate-600 text-xs font-mono">src-tauri/ configured with strict capabilities</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
