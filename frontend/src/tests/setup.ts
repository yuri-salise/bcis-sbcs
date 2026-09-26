import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock fetch globally for testing
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes("/health")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "ok", timestamp: new Date().toISOString(), uptime: 100 }),
    });
  }
  if (url.includes("/ready")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "ready", database: "connected", timestamp: new Date().toISOString() }),
    });
  }
  if (url.includes("/auth/login")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          user: {
            id: "user-123",
            username: "admin",
            displayName: "Maria Santos (Super Admin)",
            email: "admin@bcis.local",
          },
          token: "mock-token-abc",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          permissions: [
            "subscriber.view",
            "subscriber.manage",
            "billing.view",
            "billing.generate",
            "payment.view",
            "payment.create",
            "payment.reverse",
            "gcash.verify",
            "collection.view",
            "collection.manage",
            "collection.reconcile",
            "receivables.view",
            "service.control",
            "user.manage",
            "report.view",
            "report.export",
            "audit.view",
          ],
        }),
    });
  }
  if (url.includes("/auth/me")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          user: {
            id: "user-123",
            username: "admin",
            displayName: "Maria Santos (Super Admin)",
            email: "admin@bcis.local",
          },
          roles: ["SUPER_ADMIN"],
          permissions: [
            "subscriber.view",
            "subscriber.manage",
            "billing.view",
            "billing.generate",
            "payment.view",
            "payment.create",
            "payment.reverse",
            "gcash.verify",
            "collection.view",
            "collection.manage",
            "collection.reconcile",
            "receivables.view",
            "service.control",
            "user.manage",
            "report.view",
            "report.export",
            "audit.view",
          ],
        }),
    });
  }
  if (url.includes("/service-plans")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            id: "plan-1",
            code: "PLAN-INT-50M",
            name: "Fiber 50 Mbps",
            monthlyPrice: "1299.00",
            speedMbps: 50,
            channelCount: null,
            isActive: true,
            serviceType: { id: "type-1", code: "INTERNET", name: "Fiber Internet" },
          },
        ]),
    });
  }
  if (url.includes("/collection-areas")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { id: "area-1", code: "AREA-CAS", name: "Barangay Casisang", isActive: true },
        ]),
    });
  }
  if (url.includes("/collectors")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { id: "col-1", collectorCode: "COL-001", name: "Juan Dela Cruz", isActive: true },
        ]),
    });
  }
  if (url.includes("/subscribers")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: "sub-1",
              accountNumber: "BCIS-SUB-2026-0001",
              firstName: "Juan",
              middleName: "B.",
              lastName: "Mercado",
              businessName: null,
              primaryContactNumber: "0917-555-0101",
              status: "ACTIVE",
              primaryAddress: {
                label: "Home",
                line1: "Purok 3",
                barangay: "Casisang",
                cityMunicipality: "Malaybalay City",
                province: "Bukidnon",
              },
              serviceAccountsCount: 1,
            },
          ],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
        }),
    });
  }
  if (url.includes("/reports/") && url.includes("/export")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-disposition": 'attachment; filename="BCIS-Report.xlsx"',
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      blob: () => Promise.resolve(new Blob(["mock-binary-export-content"], { type: "application/octet-stream" })),
    });
  }
  if (url.includes("/reports/dashboard")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          kpis: {
            currentReceivable: "₱145,250.00",
            overdueReceivable: "₱32,400.00",
            todayCollection: "₱18,500.00",
            currentBilling: "₱180,000.00",
            pendingGcashCount: 3,
            reconciliationExceptionsCount: 1,
          },
          supporting: {
            billingVsCollectionTrend: [
              {
                cycleId: "cycle-1",
                cycleCode: "2026-08",
                period: "2026-08-01 to 2026-08-31",
                billedAmount: "₱150,000.00",
                collectedAmount: "₱142,500.00",
                billedNumber: "150000.00",
                collectedNumber: "142500.00",
              },
            ],
            paymentMethodBreakdown: [
              { method: "CASH", amount: "₱12,500.00", count: 10, percentage: 68 },
              { method: "GCASH", amount: "₱6,000.00", count: 4, percentage: 32 },
            ],
            agingSummary: {
              totalReceivable: "₱177,650.00",
              current: { amount: "₱145,250.00", count: 110, percentage: 82 },
              days1to30: { amount: "₱18,400.00", count: 14, percentage: 10 },
              days31to60: { amount: "₱8,000.00", count: 6, percentage: 5 },
              days61to90: { amount: "₱4,000.00", count: 3, percentage: 2 },
              days90Plus: { amount: "₱2,000.00", count: 2, percentage: 1 },
            },
            topCollectors: [
              {
                id: "col-1",
                name: "Juan Dela Cruz",
                code: "COL-001",
                areaName: "Barangay Casisang",
                collectedThisMonth: "₱45,000.00",
                batchesCount: 12,
                efficiencyPercentage: 98,
              },
            ],
            delinquencyAlerts: {
              overdueInvoicesCount: 5,
              daysOverdue30PlusCount: 2,
            },
            recentPayments: [
              {
                id: "pay-1",
                receiptNumber: "OR-2026-0001",
                paymentDate: "2026-09-26",
                amount: "₱1,299.00",
                paymentMethod: "CASH",
                subscriberName: "Juan Mercado",
                collectorName: "Juan Dela Cruz",
              },
            ],
          },
          asOfDate: "2026-09-26",
        }),
    });
  }
  if (url.includes("/reports/daily-collection")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          reportType: "DAILY_COLLECTION",
          date: "2026-09-26",
          totalCollected: "₱18,500.00",
          rawTotalCollected: "18500.00",
          totalTransactions: 1,
          byPaymentMethod: [{ method: "CASH", amount: "₱18,500.00", count: 1, percentage: 100 }],
          byCashier: [{ cashierId: "user-123", cashierName: "Maria Santos", amount: "₱18,500.00", count: 1 }],
          byCollector: [],
          items: [
            {
              id: "pay-1",
              receiptNumber: "OR-2026-0001",
              paymentDate: "2026-09-26",
              createdAt: new Date().toISOString(),
              subscriberAccountNumber: "BCIS-SUB-2026-0001",
              subscriberDisplayName: "Juan Mercado",
              paymentMethod: "CASH",
              referenceNumber: "—",
              amount: "₱18,500.00",
              rawAmount: "18500.00",
              cashierName: "Maria Santos",
              collectorName: "Office Direct",
              batchNumber: "—",
              notes: "Walk-in cash payment",
            },
          ],
        }),
    });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  });
});

// URL helpers mock for file previews
if (typeof window !== "undefined") {
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = vi.fn(() => "blob:http://localhost/fake-proof-blob");
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = vi.fn();
  }
}
