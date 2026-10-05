import type { FastifyPluginAsync } from "fastify";
import { SubscriberService } from "./subscriber.service.js";
import { authenticate, requirePermission } from "../auth/auth.guard.js";

export const subscriberRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /subscribers
  fastify.get(
    "/subscribers",
    {
      preHandler: [authenticate, requirePermission("subscriber.view")],
      schema: {
        description: "List subscribers with search, status filtering, and pagination",
        tags: ["Subscribers"],
        querystring: {
          type: "object",
          properties: {
            search: { type: "string" },
            status: { type: "string" },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    async (request) => {
      const query = request.query as {
        search?: string;
        status?: string;
        page?: number;
        limit?: number;
      };
      return await SubscriberService.listSubscribers(query);
    }
  );

  // GET /subscribers/:id
  fastify.get(
    "/subscribers/:id",
    {
      preHandler: [authenticate, requirePermission("subscriber.view")],
      schema: {
        description: "Get full subscriber profile, addresses, service accounts, and history",
        tags: ["Subscribers"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return await SubscriberService.getSubscriberById(id);
    }
  );

  // POST /subscribers
  fastify.post(
    "/subscribers",
    {
      preHandler: [authenticate, requirePermission("subscriber.create")],
      schema: {
        description: "Create a new subscriber with primary address and authoritative account number",
        tags: ["Subscribers"],
        body: {
          type: "object",
          required: ["firstName", "lastName", "primaryContactNumber", "address"],
          properties: {
            firstName: { type: "string", minLength: 1 },
            middleName: { type: "string" },
            lastName: { type: "string", minLength: 1 },
            businessName: { type: "string" },
            primaryContactNumber: { type: "string", minLength: 7 },
            secondaryContactNumber: { type: "string" },
            email: { type: "string", format: "email" },
            notes: { type: "string" },
            address: {
              type: "object",
              required: ["line1", "barangay"],
              properties: {
                label: { type: "string", default: "Home" },
                line1: { type: "string", minLength: 1 },
                line2: { type: "string" },
                barangay: { type: "string", minLength: 1 },
                cityMunicipality: { type: "string", default: "Malaybalay City" },
                province: { type: "string", default: "Bukidnon" },
                postalCode: { type: "string", default: "8700" },
                landmark: { type: "string" },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as any;
      const user = (request as any).user;
      const result = await SubscriberService.createSubscriber(body, user.id, {
        ipAddress: request.ip,
        requestId: request.id,
      });
      return reply.status(201).send(result);
    }
  );

  // PATCH /subscribers/:id
  fastify.patch(
    "/subscribers/:id",
    {
      preHandler: [authenticate, requirePermission("subscriber.update")],
      schema: {
        description: "Update subscriber details and primary address",
        tags: ["Subscribers"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const user = (request as any).user;
      return await SubscriberService.updateSubscriber(id, body, user.id, {
        ipAddress: request.ip,
        requestId: request.id,
      });
    }
  );

  // POST /subscribers/:id/service-accounts
  fastify.post(
    "/subscribers/:id/service-accounts",
    {
      preHandler: [authenticate, requirePermission("subscriber.create")],
      schema: {
        description: "Create a billable service account under a subscriber with catalog rate snapshot",
        tags: ["Subscribers"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["servicePlanId"],
          properties: {
            servicePlanId: { type: "string" },
            installationAddressId: { type: "string" },
            activationDate: { type: "string", format: "date" },
            billingStartDate: { type: "string", format: "date" },
            billingDay: { type: "integer", minimum: 1, maximum: 28 },
            dueDay: { type: "integer", minimum: 1, maximum: 28 },
            collectorId: { type: "string" },
            collectionAreaId: { type: "string" },
            reason: { type: "string" },
            notes: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const user = (request as any).user;
      const result = await SubscriberService.createServiceAccount(id, body, user.id, {
        ipAddress: request.ip,
        requestId: request.id,
      });
      return reply.status(201).send(result);
    }
  );

  // PATCH /service-accounts/:id/status
  fastify.patch(
    "/service-accounts/:id/status",
    {
      preHandler: [authenticate, requirePermission("service.control")],
      schema: {
        description: "Change service account status (suspend, reconnect, disconnect) with mandatory audit reason",
        tags: ["Subscribers"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["toStatus", "reason"],
          properties: {
            toStatus: {
              type: "string",
              enum: ["PENDING", "ACTIVE", "SUSPENDED", "DISCONNECTED", "TERMINATED"],
            },
            reason: { type: "string", minLength: 3 },
            notes: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { toStatus, reason, notes } = request.body as {
        toStatus: string;
        reason: string;
        notes?: string;
      };
      const user = (request as any).user;
      return await SubscriberService.updateServiceAccountStatus(
        id,
        toStatus,
        reason,
        user.id,
        notes,
        {
          ipAddress: request.ip,
          requestId: request.id,
        }
      );
    }
  );

  // GET /service-plans
  fastify.get(
    "/service-plans",
    {
      preHandler: [authenticate, requirePermission("service.view")],
      schema: {
        description: "List active catalog service plans",
        tags: ["Subscribers"],
      },
    },
    async () => {
      return await SubscriberService.listServicePlans();
    }
  );

  // POST /service-plans
  fastify.post(
    "/service-plans",
    {
      preHandler: [authenticate, requirePermission("service.manage")],
      schema: {
        description: "Create a new service plan",
        tags: ["Subscribers"],
      },
    },
    async (request, reply) => {
      const plan = await SubscriberService.createServicePlan(request.body);
      return reply.code(201).send(plan);
    }
  );

  // GET /collection-areas
  fastify.get(
    "/collection-areas",
    {
      preHandler: [authenticate, requirePermission("subscriber.view")],
      schema: {
        description: "List active collection areas",
        tags: ["Subscribers"],
      },
    },
    async () => {
      return await SubscriberService.listCollectionAreas();
    }
  );

  // GET /collectors
  fastify.get(
    "/collectors",
    {
      preHandler: [authenticate, requirePermission("subscriber.view")],
      schema: {
        description: "List active collectors",
        tags: ["Subscribers"],
      },
    },
    async () => {
      return await SubscriberService.listCollectors();
    }
  );
};
