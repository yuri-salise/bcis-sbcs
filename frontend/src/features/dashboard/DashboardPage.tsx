import React, { useState, useEffect, useCallback } from "react";
import {
  api,
  type DashboardMetrics,
} from "../../api/client";

export const DashboardPage: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDashboardMetrics();
      setMetrics(data);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err.message || "Failed to load executive dashboard metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading && !metrics) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
        <p className="text-gray-600 font-medium">Loading executive dashboard & operational metrics...</p>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-1">Operational Dashboard Error</h3>
          <p className="text-sm mb-4">{error}</p>
          <button
            onClick={loadDashboard}
            className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 font-medium"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  const kpis = metrics?.kpis;
  const supporting = metrics?.supporting;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto" data-testid="dashboard-page">
      {/* Executive Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-gray-200 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Executive Dashboard</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Live Operations
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Real-time financial status, AR aging distribution, collection efficiency, and compliance indicators.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-500 font-medium">
              As of: <span className="font-semibold text-gray-700">{metrics?.asOfDate}</span> (Updated {lastRefreshed})
            </span>
          )}
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex items-center px-3.5 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            data-testid="refresh-dashboard-btn"
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* 6 Key Operational KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* 1. Today's Collections */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider">
            <span>Today's Collections</span>
            <span className="p-1 bg-emerald-50 text-emerald-600 rounded">💵</span>
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-600 tracking-tight" data-testid="kpi-today-collection">
            {kpis?.todayCollection || "₱0.00"}
          </div>
          <div className="mt-1 text-xs text-gray-500">Posted payments today</div>
        </div>

        {/* 2. Current Receivables */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider">
            <span>Current Receivables</span>
            <span className="p-1 bg-blue-50 text-blue-600 rounded">📊</span>
          </div>
          <div className="mt-2 text-xl font-bold text-gray-900 tracking-tight" data-testid="kpi-current-receivable">
            {kpis?.currentReceivable || "₱0.00"}
          </div>
          <div className="mt-1 text-xs text-blue-600 font-medium">Unpaid within due date</div>
        </div>

        {/* 3. Overdue Receivables */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider">
            <span>Overdue Receivables</span>
            <span className="p-1 bg-amber-50 text-amber-600 rounded">⚠️</span>
          </div>
          <div className="mt-2 text-xl font-bold text-amber-600 tracking-tight" data-testid="kpi-overdue-receivable">
            {kpis?.overdueReceivable || "₱0.00"}
          </div>
          <div className="mt-1 text-xs text-amber-700 font-medium">Past grace period</div>
        </div>

        {/* 4. Current Billing */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider">
            <span>Active Billing Cycle</span>
            <span className="p-1 bg-purple-50 text-purple-600 rounded">📑</span>
          </div>
          <div className="mt-2 text-xl font-bold text-gray-900 tracking-tight" data-testid="kpi-current-billing">
            {kpis?.currentBilling || "₱0.00"}
          </div>
          <div className="mt-1 text-xs text-gray-500">Current cycle billed</div>
        </div>

        {/* 5. Pending GCash Verification */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider">
            <span>Pending GCash</span>
            <span className="p-1 bg-indigo-50 text-indigo-600 rounded">📱</span>
          </div>
          <div className="mt-2 text-xl font-bold text-indigo-600 tracking-tight" data-testid="kpi-pending-gcash">
            {kpis?.pendingGcashCount ?? 0}
          </div>
          <div className="mt-1 text-xs text-indigo-600 font-medium">Awaiting verification</div>
        </div>

        {/* 6. Reconciliation Exceptions */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider">
            <span>Reconciliation Issues</span>
            <span className="p-1 bg-rose-50 text-rose-600 rounded">⚖️</span>
          </div>
          <div className="mt-2 text-xl font-bold text-rose-600 tracking-tight" data-testid="kpi-reconciliation-exceptions">
            {kpis?.reconciliationExceptionsCount ?? 0}
          </div>
          <div className="mt-1 text-xs text-rose-600 font-medium">Unbalanced batches</div>
        </div>
      </div>

      {/* Delinquency Alert Banner (if issues present) */}
      {(supporting?.delinquencyAlerts.overdueInvoicesCount ?? 0) > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Action Required: {supporting?.delinquencyAlerts.overdueInvoicesCount} Delinquent Invoices Detected
              </p>
              <p className="text-xs text-amber-700">
                {supporting?.delinquencyAlerts.daysOverdue30PlusCount} accounts are over 30 days past due and eligible for notice of disconnection.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content: Trendlines & Distributions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: 6-Month Billing vs Collection Trend */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Billing vs Collection Trend</h2>
              <p className="text-xs text-gray-500">Historical performance across the last 6 billing cycles</p>
            </div>
            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-medium">Efficiency Analysis</span>
          </div>

          <div className="space-y-4">
            {(supporting?.billingVsCollectionTrend || []).map((trend) => {
              const billed = parseFloat(trend.billedNumber) || 0;
              const collected = parseFloat(trend.collectedNumber) || 0;
              const efficiency = billed > 0 ? Math.min(100, Math.round((collected / billed) * 100)) : 100;

              return (
                <div key={trend.cycleId} className="border-b border-gray-100 pb-3 last:border-none last:pb-0">
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="font-semibold text-gray-800">{trend.cycleCode} ({trend.period})</span>
                    <span className="font-medium text-emerald-600">{efficiency}% Collected</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600 mb-1.5">
                    <span>Billed: <strong className="text-gray-900">{trend.billedAmount}</strong></span>
                    <span>Collected: <strong className="text-emerald-700">{trend.collectedAmount}</strong></span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${efficiency}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {(supporting?.billingVsCollectionTrend?.length ?? 0) === 0 && (
              <p className="text-xs text-gray-400 py-4 text-center">No billing cycle history recorded yet.</p>
            )}
          </div>
        </div>

        {/* Panel 2: AR Aging 5-Bucket Distribution */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Accounts Receivable Aging</h2>
              <p className="text-xs text-gray-500">Portfolio aging breakdown by days past due</p>
            </div>
            <span className="text-xs font-semibold text-gray-900">
              Total: {supporting?.agingSummary.totalReceivable || "₱0.00"}
            </span>
          </div>

          <div className="space-y-3">
            {/* Current */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-700 font-medium">Current (Not Yet Due)</span>
                <span className="font-semibold text-gray-900">
                  {supporting?.agingSummary.current.amount} ({supporting?.agingSummary.current.percentage}%)
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-emerald-500 h-2.5 rounded-full"
                  style={{ width: `${supporting?.agingSummary.current.percentage || 0}%` }}
                />
              </div>
            </div>

            {/* 1-30 Days */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-700 font-medium">1 - 30 Days Overdue</span>
                <span className="font-semibold text-gray-900">
                  {supporting?.agingSummary.days1to30.amount} ({supporting?.agingSummary.days1to30.percentage}%)
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-blue-500 h-2.5 rounded-full"
                  style={{ width: `${supporting?.agingSummary.days1to30.percentage || 0}%` }}
                />
              </div>
            </div>

            {/* 31-60 Days */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-700 font-medium">31 - 60 Days Overdue</span>
                <span className="font-semibold text-gray-900">
                  {supporting?.agingSummary.days31to60.amount} ({supporting?.agingSummary.days31to60.percentage}%)
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-amber-500 h-2.5 rounded-full"
                  style={{ width: `${supporting?.agingSummary.days31to60.percentage || 0}%` }}
                />
              </div>
            </div>

            {/* 61-90 Days */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-700 font-medium">61 - 90 Days Overdue</span>
                <span className="font-semibold text-gray-900">
                  {supporting?.agingSummary.days61to90.amount} ({supporting?.agingSummary.days61to90.percentage}%)
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-orange-500 h-2.5 rounded-full"
                  style={{ width: `${supporting?.agingSummary.days61to90.percentage || 0}%` }}
                />
              </div>
            </div>

            {/* >90 Days */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-rose-700 font-semibold">&gt; 90 Days Overdue (High Risk)</span>
                <span className="font-bold text-rose-700">
                  {supporting?.agingSummary.days90Plus.amount} ({supporting?.agingSummary.days90Plus.percentage}%)
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-rose-500 h-2.5 rounded-full"
                  style={{ width: `${supporting?.agingSummary.days90Plus.percentage || 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Panel 3: Payment Method Split */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Payment Channels & Methods</h2>
              <p className="text-xs text-gray-500">Distribution of collected payments this month</p>
            </div>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-medium">Channel Split</span>
          </div>

          <div className="space-y-3">
            {(supporting?.paymentMethodBreakdown || []).map((method) => (
              <div key={method.method} className="border-b border-gray-50 pb-2.5 last:border-none last:pb-0">
                <div className="flex justify-between items-center text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">
                      {method.method === "CASH" ? "💵 Cash" :
                       method.method === "GCASH" ? "📱 GCash" :
                       method.method === "BANK_TRANSFER" ? "🏦 Bank Transfer" : "📑 Check"}
                    </span>
                    <span className="text-gray-400">({method.count} txns)</span>
                  </div>
                  <span className="font-semibold text-gray-900">{method.amount} ({method.percentage}%)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-indigo-500 h-2 rounded-full"
                    style={{ width: `${method.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel 4: Field Collector Leaderboard */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Collector Leaderboard</h2>
              <p className="text-xs text-gray-500">Field collection performance and efficiency</p>
            </div>
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-medium">Active Squad</span>
          </div>

          <div className="divide-y divide-gray-100">
            {(supporting?.topCollectors || []).map((collector, idx) => (
              <div key={collector.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 font-bold text-gray-600 text-[10px]">
                    #{idx + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-gray-900">{collector.name}</p>
                    <p className="text-[11px] text-gray-400">{collector.code} • {collector.batchesCount} batches</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{collector.collectedThisMonth}</p>
                  <p className="text-[11px] text-emerald-600 font-medium">{collector.efficiencyPercentage}% efficiency</p>
                </div>
              </div>
            ))}
            {(supporting?.topCollectors?.length ?? 0) === 0 && (
              <p className="text-xs text-gray-400 py-4 text-center">No collector batch data recorded this month.</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Payments Ticker Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Recent Payment Transactions</h2>
            <p className="text-xs text-gray-500">Latest posted payments received across all collection channels</p>
          </div>
          <span className="text-xs font-medium text-gray-500">Real-time Ticker</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase">Receipt #</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase">Subscriber</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase">Date</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase">Method</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-600 uppercase">Collector/Cashier</th>
                <th className="px-4 py-2.5 text-right font-semibold text-gray-600 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {(supporting?.recentPayments || []).map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono font-medium text-gray-900">{p.receiptNumber}</td>
                  <td className="px-4 py-2.5 text-gray-900 font-medium">{p.subscriberName}</td>
                  <td className="px-4 py-2.5 text-gray-500">{p.paymentDate}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-800">
                      {p.paymentMethod}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{p.collectorName}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{p.amount}</td>
                </tr>
              ))}
              {(supporting?.recentPayments?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    No recent payments recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
