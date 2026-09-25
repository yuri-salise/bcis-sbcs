import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { collectionsService } from "./collections.service.js";
import { authenticate, requirePermission, requireAnyPermission } from "../auth/auth.guard.js";

const ListBatchesQuerySchema = z.object({
  status: z.string().optional(),
  collectorId: z.string().uuid().optional(),
  collectionAreaId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const CreateBatchBodySchema = z.object({
  collectorId: z.string().uuid(),
  collectionAreaId: z.string().uuid(),
  collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceAccountIds: z.array(z.string().uuid()).optional(),
  notes: z.string().max(500).optional(),
});

const RecordCollectionBodySchema = z.object({
  batchAccountId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  paymentMethod: z.enum(["CASH", "GCASH", "BANK_TRANSFER", "CHECK", "OTHER"]).default("CASH"),
  referenceNumber: z.string().max(64).optional(),
  notes: z.string().max(500).optional(),
});

const RecordRemittanceBodySchema = z.object({
  remittedCash: z.string().regex(/^\d+(\.\d{1,2})?$/),
  remittedGcash: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  remittedBankTransfer: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  otherNonCash: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  notes: z.string().max(500).optional(),
});

const ReconcileBatchBodySchema = z.object({
  notes: z.string().max(500).optional(),
});

const CloseBatchBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

export const collectionsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /collections/batches
  fastify.get(
    "/collections/batches",
    {
      preHandler: [authenticate, requireAnyPermission("collection.view", "collection.manage")],
      schema: {
        description: "List collection batches with filters, search, and pagination",
        tags: ["Collections"],
      },
    },
    async (request, reply) => {
      const query = ListBatchesQuerySchema.parse(request.query);
      const result = await collectionsService.listBatches(query);
      return reply.send(result);
    }
  );

  // POST /collections/batches - Create batch
  fastify.post(
    "/collections/batches",
    {
      preHandler: [authenticate, requirePermission("collection.manage")],
      schema: {
        description: "Create a new collection batch and route sheet for a collector/area",
        tags: ["Collections"],
      },
    },
    async (request, reply) => {
      const body = CreateBatchBodySchema.parse(request.body);
      const result = await collectionsService.createBatch(body, request.user!.id);
      return reply.status(201).send({
        data: result.batch,
        ...result,
      });
    }
  );

  // GET /collections/batches/:id - Get batch details
  fastify.get(
    "/collections/batches/:id",
    {
      preHandler: [authenticate, requireAnyPermission("collection.view", "collection.manage")],
      schema: {
        description: "Get collection batch details with accounts and remittances",
        tags: ["Collections"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await collectionsService.getBatchById(id);
      return reply.send({
        data: result.batch,
        ...result.batch,
        ...result,
      });
    }
  );

  // POST /collections/batches/:id/collections - Record field collection
  fastify.post(
    "/collections/batches/:id/collections",
    {
      preHandler: [authenticate, requireAnyPermission("payment.create", "collection.manage")],
      schema: {
        description: "Record a field collection on a batch account and issue official receipt",
        tags: ["Collections"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = RecordCollectionBodySchema.parse(request.body);
      const result = await collectionsService.recordFieldCollection(id, body, request.user!.id);
      return reply.status(200).send(result);
    }
  );

  // POST /collections/batches/:id/accounts/:accountId/collect - Alternative RESTful collection endpoint
  fastify.post(
    "/collections/batches/:id/accounts/:accountId/collect",
    {
      preHandler: [authenticate, requireAnyPermission("payment.create", "collection.manage")],
      schema: {
        description: "Record a field collection on a specific batch account",
        tags: ["Collections"],
      },
    },
    async (request, reply) => {
      const { id, accountId } = request.params as { id: string; accountId: string };
      const body = RecordCollectionBodySchema.omit({ batchAccountId: true }).parse(request.body);
      const result = await collectionsService.recordFieldCollection(
        id,
        { ...body, batchAccountId: accountId },
        request.user!.id
      );
      return reply.status(200).send(result);
    }
  );

  // POST /collections/batches/:id/submit - Submit completed field route
  fastify.post(
    "/collections/batches/:id/submit",
    {
      preHandler: [authenticate, requireAnyPermission("collection.manage", "collection.reconcile")],
      schema: {
        description: "Submit completed field collection batch for cash remittance handover",
        tags: ["Collections"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await collectionsService.submitBatch(id);
      return reply.status(200).send(result);
    }
  );

  // POST /collections/batches/:id/remit - Record cash remittance (AT-07 & AT-08)
  fastify.post(
    "/collections/batches/:id/remit",
    {
      preHandler: [authenticate, requireAnyPermission("collection.manage", "collection.reconcile", "payment.create")],
      schema: {
        description: "Record physical cash and non-cash remittance, calculate shortage/overage",
        tags: ["Collections"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = RecordRemittanceBodySchema.parse(request.body);
      const result = await collectionsService.recordRemittance(id, body, request.user!.id);
      return reply.status(201).send(result);
    }
  );

  // POST /collections/batches/:id/reconcile - Reconcile remittance
  fastify.post(
    "/collections/batches/:id/reconcile",
    {
      preHandler: [authenticate, requirePermission("collection.reconcile")],
      schema: {
        description: "Verify remittance, acknowledge variance, and mark batch reconciled",
        tags: ["Collections"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = ReconcileBatchBodySchema.parse(request.body || {});
      const result = await collectionsService.reconcileBatch(id, request.user!.id, body.notes);
      return reply.status(200).send(result);
    }
  );

  // POST /collections/batches/:id/close - Close batch with AT-08 guard
  fastify.post(
    "/collections/batches/:id/close",
    {
      preHandler: [authenticate, requireAnyPermission("collection.reconcile", "collection.manage")],
      schema: {
        description: "Close collection batch permanently, requiring reason if unbalanced (AT-08)",
        tags: ["Collections"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = CloseBatchBodySchema.parse(request.body || {});
      const result = await collectionsService.closeBatch(id, request.user!.id, body.reason);
      return reply.status(200).send(result);
    }
  );

  // GET /collections/collectors - List active collectors
  fastify.get(
    "/collections/collectors",
    {
      preHandler: [authenticate, requireAnyPermission("collection.view", "collection.manage")],
      schema: {
        description: "List active collectors",
        tags: ["Collections"],
      },
    },
    async (_request, reply) => {
      const list = await collectionsService.listCollectors();
      return reply.send({ data: list });
    }
  );

  // GET /collections/areas - List active collection areas
  fastify.get(
    "/collections/areas",
    {
      preHandler: [authenticate, requireAnyPermission("collection.view", "collection.manage")],
      schema: {
        description: "List active collection areas",
        tags: ["Collections"],
      },
    },
    async (_request, reply) => {
      const list = await collectionsService.listCollectionAreas();
      return reply.send({ data: list });
    }
  );
};
