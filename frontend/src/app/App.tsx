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
  LogOut,
  UserCheck,
  ShieldAlert,
  FileCheck,
} from "lucide-react";
import { api, type HealthResponse, type ReadyResponse } from "../api/client";
import { AuthProvider, useAuth } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { SubscribersPage } from "../features/subscribers/SubscribersPage";
import { BillingPage } from "../features/billing/BillingPage";
import { PaymentsPage } from "../features/payments/PaymentsPage";
import { GcashVerificationPage } from "../features/gcash/GcashVerificationPage";
import { CollectionsPage } from "../features/collections/CollectionsPage";
import { ReceivablesPage } from "../features/receivables/ReceivablesPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { BackupPage } from "../features/system/BackupPage";
import { ServicesPage } from "../features/services/ServicesPage";

function AppContent() {
  const { user, roles, permissions, isAuthenticated, isLoading, logout, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  // Direct RBAC test state
  const [rbacTestStatus, setRbacTestStatus] = useState<string | null>(null);
  const [rbacTestLoading, setRbacTestLoading] = useState(false);

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
    if (!isAuthenticated) return;
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const testDirectAdminApi = async () => {
    setRbacTestLoading(true);
    setRbacTestStatus(null);
    try {
      const res = await api.checkAdminAudit();
      setRbacTestStatus(`SUCCESS (200 OK): ${res.message}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setRbacTestStatus(`FORBIDDEN (403): ${err.message}`);
      } else {
        setRbacTestStatus("Error calling admin endpoint");
      }
    } finally {
      setRbacTestLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-500 font-medium">Initializing terminal session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const allNavItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, perm: null },
    { id: "subscribers", label: "Subscribers", icon: Users, perm: "subscriber.view" },
    { id: "billing", label: "Billing", icon: Receipt, perm: "billing.view" },
    { id: "payments", label: "Payments", icon: CreditCard, perm: "payment.view" },
    { id: "gcash", label: "GCash Verification", icon: FileCheck, perm: "gcash.verify" },
    { id: "collections", label: "Collections", icon: FolderSync, perm: "collection.view" },
    { id: "receivables", label: "Receivables", icon: AlertCircle, perm: "receivables.view" },
    { id: "services", label: "Services", icon: Layers, perm: "service.view" },
    { id: "reports", label: "Reports", icon: FileBarChart2, perm: "report.view" },
    { id: "backup", label: "System & Backup", icon: Database, perm: "backup.restore" },
    { id: "administration", label: "Administration", icon: ShieldCheck, perm: "user.manage" },
  ];

  // Role-aware navigation filtering
  const visibleNavItems = allNavItems.filter((item) => !item.perm || hasPermission(item.perm));

  const isConnected = health?.status === "ok";
  const isDbReady = readiness?.database === "connected";

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans selection:bg-blue-100 selection:text-blue-900 print:h-auto print:overflow-visible">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-950 text-white flex flex-col justify-between shrink-0 border-r border-slate-800 print:hidden">
        <div>
          {/* Logo / Header */}
          <div className="px-6 py-5 border-b border-slate-800/60">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="BCIS Logo" className="w-8 h-8 rounded-lg shadow-sm shrink-0" />
              <div>
                <h1 className="text-base font-bold tracking-tight text-white leading-tight">
                  BCIS BILLING
                </h1>
                <p className="text-[11px] text-slate-400 font-medium">Desktop Operations Client</p>
              </div>
            </div>
          </div>

          {/* Navigation Items (Role-filtered) */}
          <nav className="p-3 space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all active-press cursor-pointer ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/50"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Info & Connection Badge */}
        <div className="bg-slate-950 mt-auto">
          {/* User Profile */}
          <div className="p-4 border-t border-slate-800/60">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-800 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 ring-1 ring-slate-700/50">
                {user?.displayName.slice(0, 2).toUpperCase() || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">{user?.displayName}</div>
                <div className="text-[11px] text-blue-400/80 font-medium truncate">
                  {roles[0] || "User"}
                </div>
              </div>
              <button
                onClick={() => logout()}
                title="Sign Out"
                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer active-press"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Connection Status */}
          <div className="p-3 px-4 bg-slate-900/50 border-t border-slate-800/60">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-500 font-medium">API Gateway:</span>
              <span className="flex items-center gap-1.5 font-medium">
                {isConnected ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                    <span className="text-emerald-400">Connected</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></span>
                    <span className="text-rose-400">Offline</span>
                  </>
                )}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono truncate">
              Fastify :3001 &bull; LAN Mode
            </div>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-slate-50 print:bg-white print:overflow-visible">
        {/* Top bar */}
        <header className="h-14 border-b border-slate-200 bg-white px-8 flex items-center justify-between shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)] print:hidden">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold capitalize text-slate-900 tracking-tight">
              {activeTab}
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-bold uppercase tracking-wider">
              Role: {roles.join(", ")}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <button
              onClick={checkStatus}
              disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer active-press shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
              <span>Refresh Status</span>
            </button>
            <span className="text-slate-400 font-mono text-[11px]">
              Checked: {lastChecked.toLocaleTimeString()}
            </span>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-8 max-w-7xl w-full mx-auto space-y-6">
          {activeTab === "subscribers" && <SubscribersPage />}
          {activeTab === "billing" && <BillingPage />}
          {activeTab === "payments" && <PaymentsPage />}
          {activeTab === "gcash" && <GcashVerificationPage />}
          {activeTab === "collections" && <CollectionsPage />}
          {activeTab === "receivables" && <ReceivablesPage />}
          {activeTab === "services" && <ServicesPage />}

          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <DashboardPage />

              {/* Subsystem Health Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* API Server Card */}
                <div className="p-5 bg-white border border-slate-200 rounded-lg shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded bg-blue-50 text-blue-600">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Fastify API Server</h4>
                        <p className="text-xs text-slate-500">Port 3001 &bull; REST API</p>
                      </div>
                    </div>
                    {isConnected ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 space-y-1">
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className="font-semibold text-slate-900">{health?.status || "disconnected"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Uptime:</span>
                      <span className="font-mono text-slate-900">
                        {health ? `${Math.floor(health.uptime)}s` : "0s"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* PostgreSQL Card */}
                <div className="p-5 bg-white border border-slate-200 rounded-lg shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded bg-indigo-50 text-indigo-600">
                        <Database className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">PostgreSQL 17</h4>
                        <p className="text-xs text-slate-500">Port 5432 &bull; bcis_db</p>
                      </div>
                    </div>
                    {isDbReady ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 space-y-1">
                    <div className="flex justify-between">
                      <span>State:</span>
                      <span className="font-semibold text-slate-900">{readiness?.database || "offline"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Client Direct DB Access:</span>
                      <span className="font-semibold text-emerald-600">Blocked (Forbidden)</span>
                    </div>
                  </div>
                </div>

                {/* Security Boundary Card */}
                <div className="p-5 bg-white border border-slate-200 rounded-lg shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded bg-emerald-50 text-emerald-600">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Session Security</h4>
                        <p className="text-xs text-slate-500">Argon2id &bull; SHA-256 Tokens</p>
                      </div>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 space-y-1">
                    <div className="flex justify-between">
                      <span>Lockout Policy:</span>
                      <span className="font-semibold text-slate-900">5 Fails &rarr; 15 min lock</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Audit Trail:</span>
                      <span className="font-semibold text-emerald-600">Immutable Enabled</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === "reports" && <ReportsPage />}
          {activeTab === "backup" && <BackupPage />}

          {activeTab === "administration" && (
            <>
              {/* Welcome Banner */}
              <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-950 flex items-center gap-2">
                <span>Welcome, {user?.displayName}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-normal">
                  Active Session
                </span>
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                Authenticated as <strong className="text-slate-700">{user?.username}</strong> with{" "}
                <span className="text-blue-600 font-semibold">{permissions.length} granular permissions</span>.
              </p>
            </div>
            <button
              onClick={() => logout()}
              className="px-3 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500" />
              <span>Sign Out</span>
            </button>
          </div>

          {/* AT-10 Acceptance Test Interactive Demonstration Card */}
          <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-xs space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Acceptance Test AT-10: Server-Side RBAC Enforcement</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verify that backend rejects unauthorized direct API requests even if called directly.
                  Endpoint: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">GET /api/v1/admin/audit-check</code> (Requires <code className="text-blue-600">user.manage</code>)
                </p>
              </div>
              <button
                onClick={testDirectAdminApi}
                disabled={rbacTestLoading}
                className="px-3 py-1.5 rounded bg-slate-950 hover:bg-slate-800 text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {rbacTestLoading ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  <UserCheck className="w-3.5 h-3.5" />
                )}
                <span>Execute Direct Admin API Call</span>
              </button>
            </div>

            {rbacTestStatus && (
              <div
                className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                  rbacTestStatus.includes("SUCCESS")
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                }`}
              >
                {rbacTestStatus.includes("SUCCESS") ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold">
                    {rbacTestStatus.includes("SUCCESS")
                      ? "Direct API Authorization Granted"
                      : "Direct API Access Blocked (Server-Side Invariant)"}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px]">{rbacTestStatus}</div>
                </div>
              </div>
            )}
          </div>

            </>
          )}

          {activeTab !== "dashboard" &&
           activeTab !== "subscribers" &&
           activeTab !== "billing" &&
           activeTab !== "payments" &&
           activeTab !== "gcash" &&
           activeTab !== "services" &&
           activeTab !== "collections" &&
           activeTab !== "receivables" &&
           activeTab !== "reports" &&
           activeTab !== "backup" &&
           activeTab !== "administration" && (
            <div className="p-12 bg-white border border-slate-200 rounded-lg text-center space-y-2">
              <h3 className="text-base font-bold text-slate-900 capitalize">{activeTab} Module</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                This module is scheduled in subsequent implementation phases according to the BCIS blueprint.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
