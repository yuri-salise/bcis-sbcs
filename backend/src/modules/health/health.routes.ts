import type { FastifyPluginAsync } from "fastify";
import { checkDatabaseConnection } from "../../db/db.js";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/health",
    {
      schema: {
        description: "Liveness probe verifying that the API server is responsive",
        tags: ["System"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
              uptime: { type: "number" },
            },
            required: ["status", "timestamp", "uptime"],
          },
        },
      },
    },
    async () => {
      return {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    }
  );

  fastify.get(
    "/ready",
    {
      schema: {
        description: "Readiness probe verifying that database and critical subsystems are healthy",
        tags: ["System"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              database: { type: "string" },
              timestamp: { type: "string" },
            },
            required: ["status", "database", "timestamp"],
          },
          503: {
            type: "object",
            properties: {
              status: { type: "string" },
              database: { type: "string" },
              timestamp: { type: "string" },
            },
            required: ["status", "database", "timestamp"],
          },
        },
      },
    },
    async (_request, reply) => {
      const isDbConnected = await checkDatabaseConnection();
      if (!isDbConnected) {
        return reply.status(503).send({
          status: "degraded",
          database: "disconnected",
          timestamp: new Date().toISOString(),
        });
      }

      return {
        status: "ready",
        database: "connected",
        timestamp: new Date().toISOString(),
      };
    }
  );
};
