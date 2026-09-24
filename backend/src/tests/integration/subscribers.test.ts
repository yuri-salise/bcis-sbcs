import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildServer } from "../../app/server.js";

describe("Subscribers, Plans & Service Accounts Integration Tests (Phase 2)", () => {
  let server: FastifyInstance;
  let adminToken: string;
  let cashierToken: string;
  let techToken: string;
  let seededSubscriberId: string;
  let seededServiceAccountId: string;
  let samplePlanId: string;

  beforeAll(async () => {
    server = buildServer();
    await server.ready();

    // Login as Admin
    const adminRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin", password: "Password123!" },
    });
    expect(adminRes.statusCode).toBe(200);
    adminToken = JSON.parse(adminRes.body).token;

    // Login as Cashier
    const cashierRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "cashier", password: "Password123!" },
    });
    expect(cashierRes.statusCode).toBe(200);
    cashierToken = JSON.parse(cashierRes.body).token;

    // Login as Technician
    const techRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "tech", password: "Password123!" },
    });
    expect(techRes.statusCode).toBe(200);
    techToken = JSON.parse(techRes.body).token;
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /api/v1/service-plans returns catalog plans with service types", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/service-plans",
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    expect(res.statusCode).toBe(200);
    const plans = JSON.parse(res.body);
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBeGreaterThanOrEqual(7);

    const plan = plans.find((p: any) => p.code === "PLAN-INT-50M");
    expect(plan).toBeDefined();
    expect(plan.monthlyPrice).toBe("1299.00");
    expect(plan.speedMbps).toBe(50);
    expect(plan.serviceType.code).toBe("INTERNET");

    samplePlanId = plan.id;
  });

  it("GET /api/v1/subscribers returns 401 for unauthenticated requests", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/subscribers",
    });

    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/subscribers allows Cashier to view and search subscribers", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/subscribers?search=Mercado",
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].lastName).toBe("Mercado");
    expect(body.data[0].accountNumber).toBe("BCIS-SUB-2026-0001");
    expect(body.data[0].primaryAddress).toBeDefined();
    expect(body.data[0].primaryAddress.barangay).toBe("Casisang");

    seededSubscriberId = body.data[0].id;
  });

  it("GET /api/v1/subscribers/:id returns complete subscriber details and service accounts", async () => {
    const res = await server.inject({
      method: "GET",
      url: `/api/v1/subscribers/${seededSubscriberId}`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });

    expect(res.statusCode).toBe(200);
    const sub = JSON.parse(res.body);
    expect(sub.id).toBe(seededSubscriberId);
    expect(sub.addresses.length).toBeGreaterThanOrEqual(1);
    expect(sub.serviceAccounts.length).toBeGreaterThanOrEqual(1);

    const sa = sub.serviceAccounts[0];
    expect(sa.serviceAccountNumber).toBe("BCIS-SA-2026-0001");
    expect(sa.servicePlan.code).toBe("PLAN-INT-50M");
    expect(sa.currentRate).toBe("1299.00");
    expect(sa.status).toBe("ACTIVE");

    seededServiceAccountId = sa.id;
  });

  it("POST /api/v1/subscribers returns 403 Forbidden for Technician (lacks subscriber.create)", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/subscribers",
      headers: { authorization: `Bearer ${techToken}` },
      payload: {
        firstName: "Test",
        lastName: "Unauthorized",
        primaryContactNumber: "0917-000-0000",
        address: { line1: "Test St", barangay: "Test" },
      },
    });

    expect(res.statusCode).toBe(403);
  });

  let createdSubscriberId: string;
  let createdAccountNumber: string;

  it("POST /api/v1/subscribers creates a subscriber with authoritative sequential account number", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/subscribers",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Corazon",
        middleName: "Aquino",
        lastName: "Dela Rosa",
        businessName: "Dela Rosa Bakeshop",
        primaryContactNumber: "0917-777-8899",
        email: "corazon.delarosa@example.ph",
        notes: "New commercial subscriber application",
        address: {
          label: "Store",
          line1: "Sayre Highway KM 3",
          line2: "Commercial Strip 1",
          barangay: "Casisang",
          cityMunicipality: "Malaybalay City",
          province: "Bukidnon",
          postalCode: "8700",
          landmark: "Next to Caltex Station",
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.accountNumber).toMatch(/^BCIS-SUB-\d{4}-\d{4}$/);
    expect(body.firstName).toBe("Corazon");
    expect(body.businessName).toBe("Dela Rosa Bakeshop");
    expect(body.addresses.length).toBe(1);
    expect(body.addresses[0].barangay).toBe("Casisang");

    createdSubscriberId = body.id;
    createdAccountNumber = body.accountNumber;
  });

  it("PATCH /api/v1/subscribers/:id updates subscriber details and primary address", async () => {
    const res = await server.inject({
      method: "PATCH",
      url: `/api/v1/subscribers/${createdSubscriberId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        notes: "Updated commercial bakeshop account notes",
        address: {
          line1: "Sayre Highway KM 3 Suite 102",
          barangay: "Casisang",
        },
      },
    });

    expect(res.statusCode).toBe(200);

    // Verify updated details via GET
    const getRes = await server.inject({
      method: "GET",
      url: `/api/v1/subscribers/${createdSubscriberId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const sub = JSON.parse(getRes.body);
    expect(sub.notes).toBe("Updated commercial bakeshop account notes");
    expect(sub.addresses[0].line1).toBe("Sayre Highway KM 3 Suite 102");
  });

  let createdServiceAccountId: string;

  it("POST /api/v1/subscribers/:id/service-accounts binds plan rate snapshot and mints service account number", async () => {
    const res = await server.inject({
      method: "POST",
      url: `/api/v1/subscribers/${createdSubscriberId}/service-accounts`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        servicePlanId: samplePlanId,
        billingDay: 1,
        dueDay: 15,
        reason: "Initial fiber activation for bakeshop",
      },
    });

    expect(res.statusCode).toBe(201);
    const sa = JSON.parse(res.body);
    expect(sa.id).toBeDefined();
    expect(sa.serviceAccountNumber).toMatch(/^BCIS-SA-\d{4}-\d{4}$/);
    expect(sa.currentRate).toBe("1299.00");
    expect(sa.status).toBe("ACTIVE");

    createdServiceAccountId = sa.id;
  });

  it("PATCH /api/v1/service-accounts/:id/status returns 403 for Cashier (lacks service.control)", async () => {
    const res = await server.inject({
      method: "PATCH",
      url: `/api/v1/service-accounts/${createdServiceAccountId}/status`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        toStatus: "SUSPENDED",
        reason: "Unauthorized attempt",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("PATCH /api/v1/service-accounts/:id/status allows Technician to suspend service with audit trail", async () => {
    const res = await server.inject({
      method: "PATCH",
      url: `/api/v1/service-accounts/${createdServiceAccountId}/status`,
      headers: { authorization: `Bearer ${techToken}` },
      payload: {
        toStatus: "SUSPENDED",
        reason: "Temporary line maintenance requested by subscriber",
        notes: "Scheduled restoration within 48 hours",
      },
    });

    expect(res.statusCode).toBe(200);
    const sa = JSON.parse(res.body);
    expect(sa.status).toBe("SUSPENDED");

    // Verify status history recorded
    const getRes = await server.inject({
      method: "GET",
      url: `/api/v1/subscribers/${createdSubscriberId}`,
      headers: { authorization: `Bearer ${techToken}` },
    });
    const sub = JSON.parse(getRes.body);
    const targetSa = sub.serviceAccounts.find((s: any) => s.id === createdServiceAccountId);
    expect(targetSa.status).toBe("SUSPENDED");
    expect(targetSa.statusHistory.length).toBeGreaterThanOrEqual(2); // Initial activation + suspension
    expect(targetSa.statusHistory[0].toStatus).toBe("SUSPENDED");
    expect(targetSa.statusHistory[0].reason).toBe("Temporary line maintenance requested by subscriber");
    expect(targetSa.statusHistory[0].actor.username).toBe("tech");
  });

  it("PATCH /api/v1/service-accounts/:id/status allows Admin to reconnect service", async () => {
    const res = await server.inject({
      method: "PATCH",
      url: `/api/v1/service-accounts/${createdServiceAccountId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        toStatus: "ACTIVE",
        reason: "Maintenance complete, service reactivated",
      },
    });

    expect(res.statusCode).toBe(200);
    const sa = JSON.parse(res.body);
    expect(sa.status).toBe("ACTIVE");
  });
});
