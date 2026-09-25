import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { paymentService } from "./payment.service.js";
import { authenticate, requirePermission } from "../auth/auth.guard.js";

const PreviewAllocationSchema = z.object({
  subscriberId: z.string().uuid(),
  serviceAccountId: z.string().uuid().optional(),
  amount: z.string().min(1),
});

const CreatePaymentBodySchema = z.object({
  subscriberId: z.string().uuid(),
  serviceAccountId: z.string().uuid().optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentMethod: z.enum(["CASH", "GCASH", "BANK_TRANSFER", "CHECK", "OTHER"]),
  referenceNumber: z.string().max(64).optional(),
  amountPaid: z.string().regex(/^\d+(\.\d{1,2})?$/),
  tenderedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  collectorId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

const ReversePaymentBodySchema = z.object({
  reason: z.string().min(5, "Reversal reason must be at least 5 characters"),
});

const ListPaymentsQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  paymentMethod: z.string().optional(),
  subscriberId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(15),
});

export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /payments/preview - Preview allocation oldest-first (JSON body)
  fastify.post(
    "/payments/preview",
    {
      preHandler: [authenticate, requirePermission("payment.view")],
      schema: {
        description: "Preview oldest-first payment allocation across unpaid invoices",
        tags: ["Payments"],
        body: {
          type: "object",
          required: ["subscriberId", "amount"],
          properties: {
            subscriberId: { type: "string", format: "uuid" },
            serviceAccountId: { type: "string", format: "uuid" },
            amount: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const body = PreviewAllocationSchema.parse(request.body);
      const result = await paymentService.previewPaymentAllocation(body);
      return reply.send(result);
    }
  );

  // GET /payments/preview-allocation - Preview allocation oldest-first (Querystring)
  fastify.get(
    "/payments/preview-allocation",
    {
      preHandler: [authenticate, requirePermission("payment.view")],
      schema: {
        description: "Preview oldest-first payment allocation across unpaid invoices (query string)",
        tags: ["Payments"],
        querystring: {
          type: "object",
          required: ["subscriberId", "amount"],
          properties: {
            subscriberId: { type: "string" },
            serviceAccountId: { type: "string" },
            amount: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const query = PreviewAllocationSchema.parse(request.query);
      const result = await paymentService.previewPaymentAllocation(query);
      return reply.send(result);
    }
  );

  // POST /payments - Process & Post payment
  fastify.post(
    "/payments",
    {
      preHandler: [authenticate, requirePermission("payment.create")],
      schema: {
        description: "Post a payment transaction with oldest-first allocation and official receipt",
        tags: ["Payments"],
        body: {
          type: "object",
          required: ["subscriberId", "paymentMethod", "amountPaid"],
          properties: {
            subscriberId: { type: "string", format: "uuid" },
            serviceAccountId: { type: "string", format: "uuid" },
            paymentDate: { type: "string" },
            paymentMethod: {
              type: "string",
              enum: ["CASH", "GCASH", "BANK_TRANSFER", "CHECK", "OTHER"],
            },
            referenceNumber: { type: "string" },
            amountPaid: { type: "string" },
            tenderedAmount: { type: "string" },
            collectorId: { type: "string", format: "uuid" },
            notes: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const body = CreatePaymentBodySchema.parse(request.body);
      const cashierId = (request as any).user.id;
      try {
        const result = await paymentService.createPayment(body, cashierId);
        return reply.status(201).send(result);
      } catch (err: any) {
        if (err.message && err.message.includes("Duplicate payment reference")) {
          return reply.status(409).send({ error: "Conflict", message: err.message });
        }
        return reply.status(400).send({ error: "Bad Request", message: err.message });
      }
    }
  );

  // GET /payments - List payments
  fastify.get(
    "/payments",
    {
      preHandler: [authenticate, requirePermission("payment.view")],
      schema: {
        description: "List posted payments with multi-field search and pagination",
        tags: ["Payments"],
        querystring: {
          type: "object",
          properties: {
            search: { type: "string" },
            status: { type: "string" },
            paymentMethod: { type: "string" },
            subscriberId: { type: "string" },
            startDate: { type: "string" },
            endDate: { type: "string" },
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 15 },
          },
        },
      },
    },
    async (request, reply) => {
      const query = ListPaymentsQuerySchema.parse(request.query);
      const result = await paymentService.listPayments(query);
      return reply.send(result);
    }
  );

  // GET /payments/:id - Get payment details and receipt
  fastify.get(
    "/payments/:id",
    {
      preHandler: [authenticate, requirePermission("payment.view")],
      schema: {
        description: "Get payment and official receipt details by ID",
        tags: ["Payments"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const payment = await paymentService.getPaymentById(id);
      return reply.send(payment);
    }
  );

  // POST /payments/:id/reverse - Authorized reversal workflow (AT-06)
  fastify.post(
    "/payments/:id/reverse",
    {
      preHandler: [authenticate, requirePermission("payment.reverse")],
      schema: {
        description: "Reverse a posted payment, restore invoice balances, and record audit trail",
        tags: ["Payments"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["reason"],
          properties: {
            reason: { type: "string", minLength: 5 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { reason } = ReversePaymentBodySchema.parse(request.body);
      const actorUserId = (request as any).user.id;
      try {
        const result = await paymentService.reversePayment(id, reason, actorUserId);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(400).send({ error: "Bad Request", message: err.message });
      }
    }
  );
};
