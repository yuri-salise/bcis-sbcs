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
