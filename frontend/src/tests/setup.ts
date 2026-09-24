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
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  });
});
