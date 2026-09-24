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
          roles: ["SUPER_ADMIN"],
          permissions: ["subscriber.view", "billing.view", "payment.view", "user.manage"],
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
          permissions: ["subscriber.view", "billing.view", "payment.view", "user.manage"],
        }),
    });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  });
});
