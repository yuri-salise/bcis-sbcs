import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ReceivablesService } from "./receivables.service.js";
import { authenticate, requirePermission, requireAnyPermission } from "../auth/auth.guard.js";

const OutstandingQuerySchema = z.object({
  search: z.string().optional(),
  subscriberId: z.string().uuid().optional(),
  serviceAccountId: z.string().uuid().optional(),
  collectionAreaId: z.string().uuid().optional(),
  collectorId: z.string().uuid().optional(),
  status: z.string().optional(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const OverdueQuerySchema = z.object({
  search: z.string().optional(),
  collectionAreaId: z.string().uuid().optional(),
  collectorId: z.string().uuid().optional(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeGracePeriod: z
    .string()
    .optional()
    .transform((val) => (val === undefined ? true : val === "true" || val === "1")),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const AgingQuerySchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  collectionAreaId: z.string().uuid().optional(),
  collectorId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const SuspensionCandidatesQuerySchema = z.object({
  collectionAreaId: z.string().uuid().optional(),
  collectorId: z.string().uuid().optional(),
  search: z.string().optional(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const SuspendAccountBodySchema = z.object({
  reason: z.string().min(5, "Suspension reason must be at least 5 characters long"),
  notes: z.string().max(1000).optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const ReconnectAccountBodySchema = z.object({
  fee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  technicianUserId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
  immediate: z.boolean().optional(),
});

const CompleteReconnectionBodySchema = z.object({
  notes: z.string().max(1000).optional(),
});

const ReconnectionsQuerySchema = z.object({
  status: z.string().optional(),
  technicianUserId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const receivablesRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. GET /receivables/outstanding
  fastify.get(
    "/receivables/outstanding",
    {
      preHandler: [authenticate, requirePermission("receivables.view")],
      schema: {
        description: "List all outstanding receivables with balance > 0",
        tags: ["Receivables"],
      },
    },
    async (request, reply) => {
      const query = OutstandingQuerySchema.parse(request.query);
      const res = await ReceivablesService.getOutstandingReceivables(query);
      return reply.send(res);
    }
  );

  // 2. GET /receivables/overdue
  fastify.get(
    "/receivables/overdue",
    {
      preHandler: [authenticate, requirePermission("receivables.view")],
      schema: {
        description: "List overdue receivables taking grace period into account",
        tags: ["Receivables"],
      },
    },
    async (request, reply) => {
      const query = OverdueQuerySchema.parse(request.query);
      const res = await ReceivablesService.getOverdueReceivables(query);
      return reply.send(res);
    }
  );

  // 3. GET /receivables/aging
  fastify.get(
    "/receivables/aging",
    {
      preHandler: [authenticate, requirePermission("receivables.view")],
      schema: {
        description: "Accounts receivable aging summary across 5 standard buckets and subscriber breakdown",
        tags: ["Receivables"],
      },
    },
    async (request, reply) => {
      const query = AgingQuerySchema.parse(request.query);
      const res = await ReceivablesService.getAgingReport(query);
      return reply.send(res);
    }
  );

  // 4. GET /receivables/suspension-candidates
  fastify.get(
    "/receivables/suspension-candidates",
    {
      preHandler: [authenticate, requireAnyPermission("receivables.view", "service.control")],
      schema: {
        description: "List active service accounts exceeding overdue balance or days thresholds",
        tags: ["Receivables"],
      },
    },
    async (request, reply) => {
      const query = SuspensionCandidatesQuerySchema.parse(request.query);
      const res = await ReceivablesService.getSuspensionCandidates(query);
      return reply.send(res);
    }
  );

  // 5. POST /service-accounts/:id/suspend
  fastify.post(
    "/service-accounts/:id/suspend",
    {
      preHandler: [authenticate, requirePermission("service.control")],
      schema: {
        description: "Suspend service account, writing suspension record and state history",
        tags: ["Service Control"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = SuspendAccountBodySchema.parse(request.body);
      const actorUserId = request.user!.id;

      try {
        const res = await ReceivablesService.suspendServiceAccount(id, body, actorUserId);
        return reply.send(res);
      } catch (err: any) {
        return reply.status(400).send({
          error: "SUSPENSION_FAILED",
          message: err.message || "Failed to suspend service account.",
        });
      }
    }
  );

  // 6. POST /service-accounts/:id/reconnect
  fastify.post(
    "/service-accounts/:id/reconnect",
    {
      preHandler: [authenticate, requirePermission("service.control")],
      schema: {
        description: "Request service reconnection or execute immediate restoration",
        tags: ["Service Control"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = ReconnectAccountBodySchema.parse(request.body || {});
      const actorUserId = request.user!.id;

      try {
        const res = await ReceivablesService.requestReconnection(id, body, actorUserId);
        return reply.send(res);
      } catch (err: any) {
        return reply.status(400).send({
          error: "RECONNECTION_FAILED",
          message: err.message || "Failed to initiate reconnection.",
        });
      }
    }
  );

  // 7. GET /service-accounts/:id/service-history
  fastify.get(
    "/service-accounts/:id/service-history",
    {
      preHandler: [authenticate, requireAnyPermission("subscriber.view", "service.control")],
      schema: {
        description: "Get complete chronological service control and status history for an account",
        tags: ["Service Control"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const events = await ReceivablesService.getServiceControlHistory(id);
      return reply.send({ events });
    }
  );

  // 8. GET /receivables/reconnections
  fastify.get(
    "/receivables/reconnections",
    {
      preHandler: [authenticate, requirePermission("service.control")],
      schema: {
        description: "List service reconnection work orders with filter by status and technician",
        tags: ["Service Control"],
      },
    },
    async (request, reply) => {
      const query = ReconnectionsQuerySchema.parse(request.query);
      const res = await ReceivablesService.listReconnections(query);
      return reply.send(res);
    }
  );

  // 9. POST /receivables/reconnections/:id/complete
  fastify.post(
    "/receivables/reconnections/:id/complete",
    {
      preHandler: [authenticate, requirePermission("service.control")],
      schema: {
        description: "Mark a reconnection work order completed, restoring account to ACTIVE status",
        tags: ["Service Control"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = CompleteReconnectionBodySchema.parse(request.body || {});
      const actorUserId = request.user!.id;

      try {
        const res = await ReceivablesService.completeReconnection(id, body, actorUserId);
        return reply.send(res);
      } catch (err: any) {
        return reply.status(400).send({
          error: "COMPLETION_FAILED",
          message: err.message || "Failed to complete reconnection.",
        });
      }
    }
  );

  // 10. GET /receivables/technicians
  fastify.get(
    "/receivables/technicians",
    {
      preHandler: [authenticate, requirePermission("service.control")],
      schema: {
        description: "List users available for technician work order assignment",
        tags: ["Service Control"],
      },
    },
    async (_request, reply) => {
      const techs = await ReceivablesService.listTechnicians();
      return reply.send({ data: techs });
    }
  );
};
