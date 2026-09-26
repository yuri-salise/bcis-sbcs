import type { FastifyPluginAsync } from "fastify";
import { AuthService } from "./auth.service.js";
import { authenticate, requirePermission } from "./auth.guard.js";
import { checkRateLimit, resetRateLimit } from "./rate-limiter.js";
import { AppError } from "../../app/errors/app-error.js";

const loginBodySchema = {
  type: "object",
  required: ["username", "password"],
  properties: {
    username: { type: "string", minLength: 1 },
    password: { type: "string", minLength: 1 },
  },
};

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /login
  fastify.post(
    "/auth/login",
    {
      schema: {
        description: "Authenticate user and issue session Bearer token",
        tags: ["Auth"],
        body: loginBodySchema,
        response: {
          200: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  username: { type: "string" },
                  displayName: { type: "string" },
                  email: { type: "string", nullable: true },
                },
                required: ["id", "username", "displayName"],
              },
              token: { type: "string" },
              expiresAt: { type: "string" },
              roles: { type: "array", items: { type: "string" } },
              permissions: { type: "array", items: { type: "string" } },
            },
            required: ["user", "token", "expiresAt", "roles", "permissions"],
          },
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body as { username: string; password: string };
      const ip = request.ip;
      const userAgent = request.headers["user-agent"];

      const rateLimitKey = `login:${ip}:${username.trim().toLowerCase()}`;
      const rateCheck = checkRateLimit(rateLimitKey, 5, 60 * 1000);
      if (!rateCheck.allowed) {
        reply.header("Retry-After", String(rateCheck.retryAfter));
        reply.header("X-RateLimit-Limit", "5");
        reply.header("X-RateLimit-Remaining", "0");
        throw new AppError(
          `Too many login attempts. Please try again in ${rateCheck.retryAfter} seconds.`,
          429,
          "RATE_LIMIT_EXCEEDED",
          { retryAfter: rateCheck.retryAfter }
        );
      }

      const result = await AuthService.login(username, password, ip, userAgent);
      resetRateLimit(rateLimitKey);
      return result;
    }
  );

  // POST /logout
  fastify.post(
    "/auth/logout",
    {
      preHandler: [authenticate],
      schema: {
        description: "Revoke active session token",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              message: { type: "string" },
            },
            required: ["status", "message"],
          },
        },
      },
    },
    async (request) => {
      if (request.token) {
        await AuthService.logout(request.token, request.user?.id);
      }
      return { status: "ok", message: "Logged out successfully." };
    }
  );

  // GET /auth/me
  fastify.get(
    "/auth/me",
    {
      preHandler: [authenticate],
      schema: {
        description: "Retrieve currently authenticated user identity and effective permissions",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  username: { type: "string" },
                  displayName: { type: "string" },
                  email: { type: "string", nullable: true },
                },
                required: ["id", "username", "displayName"],
              },
              roles: { type: "array", items: { type: "string" } },
              permissions: { type: "array", items: { type: "string" } },
            },
            required: ["user", "roles", "permissions"],
          },
        },
      },
    },
    async (request) => {
      return {
        user: request.user,
        roles: request.roles ?? [],
        permissions: request.permissions ?? [],
      };
    }
  );

  // GET /admin/audit-check — admin-only endpoint requiring 'user.manage' permission
  fastify.get(
    "/admin/audit-check",
    {
      preHandler: [requirePermission("user.manage")],
      schema: {
        description: "Admin verification endpoint requiring user.manage permission",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              message: { type: "string" },
            },
            required: ["status", "message"],
          },
        },
      },
    },
    async () => {
      return {
        status: "authorized",
        message: "You have verified administrative user management access.",
      };
    }
  );
};
