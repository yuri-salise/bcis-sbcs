import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildServer } from "../../app/server.js";
import { db } from "../../db/db.js";
import { subscribers } from "../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { clearAllRateLimits } from "../../modules/auth/rate-limiter.js";

describe("Security, Hardening, Backup, & Deployment Integration Tests (Phase 9 & AT-12)", () => {
  let server: FastifyInstance;
  let adminToken: string;
  let cashierToken: string;
  let createdBackupId: string;

  beforeAll(async () => {
    server = buildServer();
    await server.ready();

    clearAllRateLimits();

    // Login Admin
    const adminRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "admin", password: "Password123!" },
    });
    expect(adminRes.statusCode).toBe(200);
    adminToken = JSON.parse(adminRes.body).token;

    // Login Cashier
    const cashierRes = await server.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "cashier", password: "Password123!" },
    });
    expect(cashierRes.statusCode).toBe(200);
    cashierToken = JSON.parse(cashierRes.body).token;
  });

  afterAll(async () => {
    clearAllRateLimits();
    await server.close();
  });

  describe("Security Headers & RBAC Enforcement", () => {
    it("attaches hardened security headers to responses", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/health",
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["x-xss-protection"]).toBe("1; mode=block");
      expect(res.headers["strict-transport-security"]).toBeDefined();
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    });

    it("rejects unauthenticated requests to backup endpoints", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/system/backups",
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects Cashier lacking backup.restore permission", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/system/backups",
        headers: { authorization: `Bearer ${cashierToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("Login Rate Limiting & Brute-Force Protection", () => {
    it("throttles excessive failed login attempts with HTTP 429", async () => {
      const testUser = "brute_force_test_user";

      // Attempts 1 to 5 should fail with 401 Unauthorized
      for (let i = 0; i < 5; i++) {
        const attempt = await server.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: { username: testUser, password: "wrong-password" },
        });
        expect(attempt.statusCode).toBe(401);
      }

      // 6th attempt should be blocked by rate limiter with 429 Too Many Requests
      const throttled = await server.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { username: testUser, password: "wrong-password" },
      });

      expect(throttled.statusCode).toBe(429);
      const body = JSON.parse(throttled.body);
      expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(throttled.headers["retry-after"]).toBeDefined();
      expect(throttled.headers["x-ratelimit-remaining"]).toBe("0");

      clearAllRateLimits();
    });
  });

  describe("Backup Creation & Verification Engine", () => {
    it("POST /api/v1/system/backups allows Admin to create a database backup", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/system/backups",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          type: "DATABASE_ONLY",
          notes: "Automated integration test backup",
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.data).toBeDefined();
      expect(json.data.id).toBeDefined();
      expect(json.data.fileName).toMatch(/^bcis_backup_database_only_/);
      expect(json.data.status).toBe("COMPLETED");
      expect(json.data.fileSizeBytes).toBeGreaterThan(1000);
      expect(json.data.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(json.data.tableCounts).toBeDefined();

      createdBackupId = json.data.id;
    });

    it("GET /api/v1/system/backups lists backup history with metadata", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/system/backups",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
      const found = json.data.find((b: any) => b.id === createdBackupId);
      expect(found).toBeDefined();
      expect(found.status).toBe("COMPLETED");
    });

    it("GET /api/v1/system/backups/:id returns details of single backup", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/system/backups/${createdBackupId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.id).toBe(createdBackupId);
      expect(json.data.sha256).toBeDefined();
    });

    it("POST /api/v1/system/backups/:id/verify verifies SHA-256 and schema manifest on disk", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/system/backups/${createdBackupId}/verify`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.verified).toBe(true);
      expect(json.data.status).toBe("VERIFIED");
      expect(json.data.sha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it("GET /api/v1/system/database/integrity runs diagnostics on active database", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/system/database/integrity",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.isHealthy).toBe(true);
      expect(json.data.issues).toEqual([]);
      expect(json.data.stats).toBeDefined();
      expect(json.data.stats.subscribers).toBeGreaterThan(0);
      expect(json.data.stats.invoices).toBeGreaterThan(0);
    });
  });

  describe("Acceptance Test AT-12: Full Backup & Restore Lifecycle", () => {
    it("AT-12: creates backup, changes data, restores approved backup, and verifies complete integrity", async () => {
      // Step 1: Create baseline backup before mutation
      const backupRes = await server.inject({
        method: "POST",
        url: "/api/v1/system/backups",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          type: "DATABASE_ONLY",
          notes: "AT-12 Pre-Mutation Baseline Backup",
        },
      });
      expect(backupRes.statusCode).toBe(201);
      const baselineBackup = JSON.parse(backupRes.body).data;
      const baselineBackupId = baselineBackup.id;

      // Step 2: Change data (Mutate database state by adding a canary subscriber)
      const canaryMobile = "09998887766";
      const insertCanaryRes = await server.inject({
        method: "POST",
        url: "/api/v1/subscribers",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: "AT12Canary",
          lastName: "CanarySubscriber",
          primaryContactNumber: canaryMobile,
          email: "at12.canary@bcis.test",
          notes: "Temporary record created for AT-12 restore verification",
          address: {
            line1: "123 AT-12 Test Street",
            barangay: "Casisang",
            cityMunicipality: "Malaybalay City",
            province: "Bukidnon",
          },
        },
      });
      expect(insertCanaryRes.statusCode).toBe(201);
      const canaryData = JSON.parse(insertCanaryRes.body);
      const canaryId = canaryData.id;

      // Confirm canary subscriber exists
      const [existingCanary] = await db
        .select()
        .from(subscribers)
        .where(eq(subscribers.id, canaryId))
        .limit(1);
      expect(existingCanary).toBeDefined();
      expect(existingCanary.primaryContactNumber).toBe(canaryMobile);

      // Step 3: Restore approved baseline backup
      const restoreRes = await server.inject({
        method: "POST",
        url: `/api/v1/system/backups/${baselineBackupId}/restore`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(restoreRes.statusCode).toBe(200);
      const restoreData = JSON.parse(restoreRes.body).data;
      expect(restoreData.success).toBe(true);
      expect(restoreData.status).toBe("RESTORE_TESTED");

      // Step 4: Verify integrity — the temporary canary subscriber must no longer exist
      const [revertedCanary] = await db
        .select()
        .from(subscribers)
        .where(eq(subscribers.id, canaryId))
        .limit(1);
      expect(revertedCanary).toBeUndefined();

      // Step 5: Verify full database integrity check passes post-restore
      const integrityRes = await server.inject({
        method: "GET",
        url: "/api/v1/system/database/integrity",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(integrityRes.statusCode).toBe(200);
      const integrityData = JSON.parse(integrityRes.body).data;
      expect(integrityData.isHealthy).toBe(true);
      expect(integrityData.issues).toEqual([]);
    });
  });
});
