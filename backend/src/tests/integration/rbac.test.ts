import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildServer } from "../../app/server.js";

describe("RBAC & Authentication Integration Tests (AT-10)", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("POST /api/v1/auth/login succeeds for valid admin credentials", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: "admin",
        password: "Password123!",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.user.username).toBe("admin");
    expect(body.roles).toContain("SUPER_ADMIN");
    expect(body.permissions.length).toBeGreaterThan(10);
    expect(typeof body.token).toBe("string");
  });

  it("POST /api/v1/auth/login fails with 401 for incorrect password", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: "admin",
        password: "WrongPassword!",
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(body.message).toContain("Invalid username or password");
  });

  it("GET /api/v1/admin/audit-check returns 401 Unauthorized for unauthenticated request", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/admin/audit-check",
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("AT-10: Cashier calling admin-only endpoint directly receives 403 Forbidden", async () => {
    // 1. Log in as Cashier
    const cashierLogin = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: "cashier",
        password: "Password123!",
      },
    });

    expect(cashierLogin.statusCode).toBe(200);
    const { token } = JSON.parse(cashierLogin.body);

    // 2. Call admin-only endpoint
    const forbiddenResponse = await server.inject({
      method: "GET",
      url: "/api/v1/admin/audit-check",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(forbiddenResponse.statusCode).toBe(403);
    const body = JSON.parse(forbiddenResponse.body);
    expect(body.code).toBe("FORBIDDEN");
    expect(body.message).toContain("user.manage");
  });

  it("Super Admin calling admin-only endpoint directly receives 200 OK", async () => {
    // 1. Log in as Admin
    const adminLogin = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: "admin",
        password: "Password123!",
      },
    });

    const { token } = JSON.parse(adminLogin.body);

    // 2. Call admin-only endpoint
    const successResponse = await server.inject({
      method: "GET",
      url: "/api/v1/admin/audit-check",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(successResponse.statusCode).toBe(200);
    const body = JSON.parse(successResponse.body);
    expect(body.status).toBe("authorized");
  });

  it("POST /api/v1/auth/logout revokes session token", async () => {
    // 1. Log in as Auditor
    const login = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        username: "auditor",
        password: "Password123!",
      },
    });
    const { token } = JSON.parse(login.body);

    // 2. Verify active session with /auth/me
    const meBefore = await server.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meBefore.statusCode).toBe(200);

    // 3. Logout
    const logout = await server.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.statusCode).toBe(200);

    // 4. Verify /auth/me is now 401 Unauthorized
    const meAfter = await server.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meAfter.statusCode).toBe(401);
  });
});
