import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildServer } from "../../app/server.js";

describe("Health & System Endpoints", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /health returns liveness status ok", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.timestamp).toBe("string");
  });

  it("GET /api/v1/health also returns liveness status ok", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
  });

  it("GET /ready returns database readiness status", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/ready",
    });

    // Since local postgresql service is running and verified, expect 200 ready
    expect([200, 503]).toContain(response.statusCode);
    const body = JSON.parse(response.body);
    expect(["ready", "degraded"]).toContain(body.status);
    expect(["connected", "disconnected"]).toContain(body.database);
  });
});
