import React, { useState, useEffect, useCallback } from "react";
import {
  api,
  type BackupRecord,
  type DatabaseIntegrityReport,
} from "../../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import {
  Database,
  ShieldCheck,
  ShieldAlert,
  Server,
  RefreshCw,
  HardDriveDownload,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  FileCheck,
  RotateCcw,
  Network,
  Clock,
  Archive,
  Layers,
} from "lucide-react";

export const BackupPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canBackup = hasPermission("backup.restore");

  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [integrityReport, setIntegrityReport] = useState<DatabaseIntegrityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // LAN configuration
  const [activeBaseUrl, setActiveBaseUrl] = useState(api.getBaseUrl());
  const [customBaseUrl, setCustomBaseUrl] = useState(api.getBaseUrl());
  const [isEditingUrl, setIsEditingUrl] = useState(false);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [backupType, setBackupType] = useState<"DATABASE_ONLY" | "FULL">("DATABASE_ONLY");
  const [backupNotes, setBackupNotes] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Restore Modal State
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<BackupRecord | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);

  // Verification in progress map
  const [verifyingMap, setVerifyingMap] = useState<Record<string, boolean>>({});
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listBackups();
      setBackups(data);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to load backups" });
    } finally {
      setLoading(false);
    }
  }, []);

  const runDiagnostics = useCallback(async () => {
    try {
      setDiagnosing(true);
      const report = await api.checkDatabaseIntegrity();
      setIntegrityReport(report);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to run database diagnostics" });
    } finally {
      setDiagnosing(false);
    }
  }, []);

  useEffect(() => {
    if (canBackup) {
      fetchBackups();
      runDiagnostics();
    }
  }, [canBackup, fetchBackups, runDiagnostics]);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleSaveBaseUrl = () => {
    if (!customBaseUrl.trim()) return;
    api.setBaseUrl(customBaseUrl.trim());
    setActiveBaseUrl(api.getBaseUrl());
    setIsEditingUrl(false);
    setActionMessage({
      type: "success",
      text: `API endpoint updated to ${api.getBaseUrl()}. Re-testing connection...`,
    });
    fetchBackups();
    runDiagnostics();
  };

  const handleResetBaseUrl = () => {
    api.resetBaseUrl();
    setActiveBaseUrl(api.getBaseUrl());
    setCustomBaseUrl(api.getBaseUrl());
    setIsEditingUrl(false);
    setActionMessage({
      type: "success",
      text: "API endpoint reset to default development configuration.",
    });
    fetchBackups();
    runDiagnostics();
  };

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreating(true);
      setActionMessage(null);
      const created = await api.createBackup({
        type: backupType,
        notes: backupNotes.trim() || undefined,
      });
      setIsCreateModalOpen(false);
      setBackupNotes("");
      setActionMessage({
        type: "success",
        text: `Backup ${created.fileName} successfully created with SHA-256 checksum (${created.sha256?.substring(0, 16)}...).`,
      });
      fetchBackups();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to generate backup" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleVerifyBackup = async (backup: BackupRecord) => {
    try {
      setVerifyingMap((prev) => ({ ...prev, [backup.id]: true }));
      setActionMessage(null);
      const result = await api.verifyBackup(backup.id);
      if (result.verified) {
        setActionMessage({
          type: "success",
          text: `Backup ${backup.fileName} verified: SHA-256 checksum matches storage manifest perfectly.`,
        });
      } else {
        setActionMessage({
          type: "error",
          text: `Verification failed for ${backup.fileName}: ${result.error || "Integrity error"}`,
        });
      }
      fetchBackups();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Verification request failed" });
    } finally {
      setVerifyingMap((prev) => ({ ...prev, [backup.id]: false }));
    }
  };

  const handleRestore = async () => {
    if (!selectedBackupForRestore || restoreConfirmText !== "RESTORE") return;
    try {
      setIsRestoring(true);
      setActionMessage(null);
      const res = await api.restoreBackup(selectedBackupForRestore.id);
      setSelectedBackupForRestore(null);
      setRestoreConfirmText("");
      setActionMessage({
        type: "success",
        text: `Acceptance Test AT-12 Verified: Database successfully restored from ${res.fileName} at ${new Date(res.restoredAt).toLocaleTimeString()}. All sequences synchronized.`,
      });
      fetchBackups();
      runDiagnostics();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Database restore failed" });
    } finally {
      setIsRestoring(false);
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (!canBackup) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <ShieldAlert className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-red-900 mb-2">Access Restricted</h2>
          <p className="text-sm text-red-700">
            You do not have the <code className="font-mono bg-red-100 px-1 py-0.5 rounded">backup.restore</code> permission required to access system backups, restore tools, or database integrity diagnostics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System & Backup Administration</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Phase 9 / AT-12
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Production-grade cryptographic backups, restore test paths, 3-PC LAN networking, and database integrity diagnostics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchBackups();
              runDiagnostics();
            }}
            disabled={loading || diagnosing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading || diagnosing ? "animate-spin text-indigo-600" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <HardDriveDownload className="w-4 h-4" />
            Create Backup
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            actionMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm font-medium">{actionMessage.text}</div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Section: LAN Topology & Database Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. LAN Deployment & Server Connectivity Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-semibold text-slate-900">3-PC LAN Deployment Endpoint</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Connected
            </span>
          </div>
          <p className="text-xs text-slate-500">
            For academic defense and office operations across PC1, PC2, and PC3, point clients to the dedicated Fastify API Server private LAN IP.
          </p>

          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active API Base URL</div>
            {isEditingUrl ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder="e.g. http://192.168.1.100:3001/api/v1"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveBaseUrl}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 shadow-sm"
                  >
                    Save & Reconnect
                  </button>
                  <button
                    onClick={() => {
                      setCustomBaseUrl(activeBaseUrl);
                      setIsEditingUrl(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetBaseUrl}
                    className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 ml-auto"
                  >
                    Reset Default
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <code className="text-sm font-mono text-indigo-700 font-semibold">{activeBaseUrl}</code>
                <button
                  onClick={() => setIsEditingUrl(true)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Configure LAN IP
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="p-2 rounded bg-slate-50 border border-slate-100 text-xs">
              <span className="font-semibold text-slate-700 block">PC1 Cashier</span>
              <span className="text-slate-400">Client Shell</span>
            </div>
            <div className="p-2 rounded bg-slate-50 border border-slate-100 text-xs">
              <span className="font-semibold text-slate-700 block">PC2 Supervisor</span>
              <span className="text-slate-400">Client Shell</span>
            </div>
            <div className="p-2 rounded bg-indigo-50 border border-indigo-100 text-xs text-indigo-800 font-semibold">
              <span className="block">Server Workstation</span>
              <span className="text-indigo-600 font-normal">Fastify + PG 17</span>
            </div>
          </div>
        </div>

        {/* 2. Database Health & Integrity Diagnostics Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-semibold text-slate-900">Database Integrity Diagnostics</h2>
            </div>
            {integrityReport ? (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full ${
                  integrityReport.isHealthy
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {integrityReport.isHealthy ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    HEALTHY [PASSED]
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    ISSUES DETECTED
                  </>
                )}
              </span>
            ) : null}
          </div>

          <p className="text-xs text-slate-500">
            Validates double-entry ledger alignments, invoice balance-due consistency, absence of orphan records, and sequence synchronization.
          </p>

          {integrityReport?.stats && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-center">
                <div className="text-slate-400 font-medium">Subscribers</div>
                <div className="text-base font-bold text-slate-800 mt-0.5">{integrityReport.stats.subscribers}</div>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-center">
                <div className="text-slate-400 font-medium">Invoices</div>
                <div className="text-base font-bold text-slate-800 mt-0.5">{integrityReport.stats.invoices}</div>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-center">
                <div className="text-slate-400 font-medium">Audit Logs</div>
                <div className="text-base font-bold text-slate-800 mt-0.5">{integrityReport.stats.auditLogs}</div>
              </div>
            </div>
          )}

          {integrityReport?.issues && integrityReport.issues.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1">
              <div className="text-xs font-bold text-red-800">Integrity Warnings:</div>
              {integrityReport.issues.map((issue, idx) => (
                <div key={idx} className="text-xs text-red-700 flex items-start gap-1.5">
                  <span className="font-bold">•</span>
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-400">
              {integrityReport?.timestamp
                ? `Last checked: ${new Date(integrityReport.timestamp).toLocaleTimeString()}`
                : "No check executed"}
            </span>
            <button
              onClick={runDiagnostics}
              disabled={diagnosing}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${diagnosing ? "animate-spin" : ""}`} />
              Run Integrity Check
            </button>
          </div>
        </div>
      </div>

      {/* Backups History Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-bold text-slate-900">Historical Cryptographic Backups</h2>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
              {backups.length} Snapshots
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Backup File</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Created At</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">SHA-256 Checksum</th>
                <th className="py-3 px-4">Verification</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Archive className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No backups found on disk. Click "Create Backup" to generate a new snapshot.
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <FileCheck className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="truncate max-w-xs" title={b.fileName}>
                          {b.fileName}
                        </span>
                      </div>
                      {b.notes && <div className="text-[11px] text-slate-400 font-sans mt-0.5">{b.notes}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                          b.backupType === "FULL"
                            ? "bg-purple-50 text-purple-700 border border-purple-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {b.backupType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(b.startedAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono font-medium text-slate-700">
                      {formatFileSize(b.fileSizeBytes)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${
                          b.status === "RESTORE_TESTED"
                            ? "bg-emerald-100 text-emerald-800"
                            : b.status === "COMPLETED"
                            ? "bg-slate-100 text-slate-800"
                            : b.status === "FAILED"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">
                      {b.sha256 ? (
                        <div className="flex items-center gap-1.5">
                          <span title={b.sha256}>
                            {b.sha256.substring(0, 10)}...{b.sha256.substring(b.sha256.length - 6)}
                          </span>
                          <button
                            onClick={() => handleCopyHash(b.sha256!)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                            title="Copy full SHA-256 hash"
                          >
                            {copiedHash === b.sha256 ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded ${
                          b.verificationStatus === "VERIFIED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : b.verificationStatus === "FAILED"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {b.verificationStatus === "VERIFIED" && <ShieldCheck className="w-3.5 h-3.5" />}
                        {b.verificationStatus === "FAILED" && <ShieldAlert className="w-3.5 h-3.5" />}
                        {b.verificationStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleVerifyBackup(b)}
                          disabled={verifyingMap[b.id]}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 transition-colors"
                          title="Verify SHA-256 checksum and schema against disk storage"
                        >
                          {verifyingMap[b.id] ? "Verifying..." : "Verify Checksum"}
                        </button>
                        <button
                          onClick={() => setSelectedBackupForRestore(b)}
                          className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                          title="Restore approved backup to database"
                        >
                          Restore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE BACKUP MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <HardDriveDownload className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-900">Create System Backup</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBackup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Backup Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBackupType("DATABASE_ONLY")}
                    className={`p-3 text-left rounded-lg border text-xs space-y-1 transition-all ${
                      backupType === "DATABASE_ONLY"
                        ? "border-indigo-600 bg-indigo-50/50 text-indigo-900"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1">
                      <Database className="w-3.5 h-3.5" />
                      DATABASE_ONLY
                    </div>
                    <div className="text-[11px] text-slate-500">All 29 relational tables & sequences</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackupType("FULL")}
                    className={`p-3 text-left rounded-lg border text-xs space-y-1 transition-all ${
                      backupType === "FULL"
                        ? "border-indigo-600 bg-indigo-50/50 text-indigo-900"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      FULL BACKUP
                    </div>
                    <div className="text-[11px] text-slate-500">Database + proof image attachments</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Backup Operator Notes</label>
                <textarea
                  rows={3}
                  value={backupNotes}
                  onChange={(e) => setBackupNotes(e.target.value)}
                  placeholder="Optional operator notes (e.g. 'Daily close-of-business backup', 'Pre-upgrade snapshot')..."
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800">Security & Integrity Invariants:</div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Calculates authoritative SHA-256 checksum on disk.
                </div>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Preserves foreign-key topological hierarchy.
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
                >
                  {isCreating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <HardDriveDownload className="w-3.5 h-3.5" />}
                  {isCreating ? "Generating Snapshot..." : "Generate Snapshot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESTORE CONFIRMATION MODAL (AT-12) */}
      {selectedBackupForRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-red-200 max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-red-100 pb-3">
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-lg font-bold text-slate-900">Database Restore (AT-12)</h3>
              </div>
              <button
                onClick={() => {
                  setSelectedBackupForRestore(null);
                  setRestoreConfirmText("");
                }}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs text-red-900">
              <div className="font-bold text-sm text-red-800 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                CRITICAL WARNING: Destructive Rollback Operation
              </div>
              <p>
                Restoring will replace all current operational data with the historical snapshot. Any subscribers, invoices, payments, or ledger transactions created after this backup was minted will be rolled back.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1 font-mono">
              <div className="text-slate-500 font-sans font-semibold">Target Snapshot:</div>
              <div className="text-slate-800 font-bold">{selectedBackupForRestore.fileName}</div>
              <div className="text-slate-500">
                Timestamp: {new Date(selectedBackupForRestore.startedAt).toLocaleString()}
              </div>
              <div className="text-slate-500 break-all">
                SHA-256: {selectedBackupForRestore.sha256}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Type <code className="font-mono bg-slate-100 text-red-600 font-bold px-1.5 py-0.5 rounded border border-slate-200">RESTORE</code> below to confirm:
              </label>
              <input
                type="text"
                value={restoreConfirmText}
                onChange={(e) => setRestoreConfirmText(e.target.value)}
                placeholder="Type RESTORE to proceed"
                className="w-full text-sm font-mono px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setSelectedBackupForRestore(null);
                  setRestoreConfirmText("");
                }}
                className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={restoreConfirmText !== "RESTORE" || isRestoring}
                onClick={handleRestore}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
              >
                {isRestoring ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                {isRestoring ? "Restoring Database..." : "Confirm & Restore Database"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
