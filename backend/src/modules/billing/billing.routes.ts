import type { FastifyPluginAsync } from "fastify";
import { BillingService } from "./billing.service.js";
import { authenticate, requirePermission } from "../auth/auth.guard.js";

export const billingRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /billing/cycles
  fastify.get(
    "/billing/cycles",
    {
      preHandler: [authenticate, requirePermission("billing.view")],
      schema: {
        description: "List all monthly billing cycles",
        tags: ["Billing"],
      },
    },
    async () => {
      return await BillingService.listBillingCycles();
    }
  );

  // POST /billing/cycles
  fastify.post(
    "/billing/cycles",
    {
      preHandler: [authenticate, requirePermission("billing.generate")],
      schema: {
        description: "Create a new accounting billing cycle",
        tags: ["Billing"],
        body: {
          type: "object",
          required: ["cycleCode", "periodStart", "periodEnd", "billingDate", "dueDate"],
          properties: {
            cycleCode: { type: "string", minLength: 7, maxLength: 32 },
            periodStart: { type: "string", format: "date" },
            periodEnd: { type: "string", format: "date" },
            billingDate: { type: "string", format: "date" },
            dueDate: { type: "string", format: "date" },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as any;
      const user = (request as any).user;
      const result = await BillingService.createBillingCycle(body, user.id, {
        ipAddress: request.ip,
        requestId: request.id,
      });
      return reply.status(201).send(result);
    }
  );

  // GET /billing/generate/preview
  fastify.get(
    "/billing/generate/preview",
    {
      preHandler: [authenticate, requirePermission("billing.generate")],
      schema: {
        description: "Preview accounts and projected total amount for monthly billing generation",
        tags: ["Billing"],
        querystring: {
          type: "object",
          required: ["cycleCode"],
          properties: {
            cycleCode: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const { cycleCode } = request.query as { cycleCode: string };
      return await BillingService.previewBillingGeneration(cycleCode);
    }
  );

  // POST /billing/generate
  fastify.post(
    "/billing/generate",
    {
      preHandler: [authenticate, requirePermission("billing.generate")],
      schema: {
        description: "Generate monthly invoices and ledger debits for all eligible active accounts (AT-11 idempotent)",
        tags: ["Billing"],
        body: {
          type: "object",
          required: ["cycleCode"],
          properties: {
            cycleCode: { type: "string" },
          },
        },
      },
    },
    async (request) => {
      const { cycleCode } = request.body as { cycleCode: string };
      const user = (request as any).user;
      return await BillingService.generateMonthlyBilling(cycleCode, user.id, {
        ipAddress: request.ip,
        requestId: request.id,
      });
    }
  );

  // GET /invoices
  fastify.get(
    "/invoices",
    {
      preHandler: [authenticate, requirePermission("billing.view")],
      schema: {
        description: "List finalized invoices with search, status filtering, and pagination",
        tags: ["Billing"],
        querystring: {
          type: "object",
          properties: {
            cycleCode: { type: "string" },
            serviceAccountId: { type: "string" },
            subscriberId: { type: "string" },
            status: { type: "string" },
            search: { type: "string" },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
          },
        },
      },
    },
    async (request) => {
      const query = request.query as any;
      return await BillingService.listInvoices(query);
    }
  );

  // GET /invoices/:id
  fastify.get(
    "/invoices/:id",
    {
      preHandler: [authenticate, requirePermission("billing.view")],
      schema: {
        description: "Get invoice details including line items, subscriber, and rate breakdown",
        tags: ["Billing"],
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
      return await BillingService.getInvoiceById(id);
    }
  );

  // GET /subscribers/:id/ledger
  fastify.get(
    "/subscribers/:id/ledger",
    {
      preHandler: [authenticate, requirePermission("subscriber.view")],
      schema: {
        description: "Get full subscriber ledger history with computed running balance",
        tags: ["Billing", "Subscribers"],
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
      return await BillingService.getSubscriberLedger(id);
    }
  );
};
