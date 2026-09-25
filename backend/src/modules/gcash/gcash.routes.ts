import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { gcashService } from "./gcash.service.js";
import { authenticate, requirePermission, requireAnyPermission } from "../auth/auth.guard.js";

const SubmitProofJsonSchema = z.object({
  subscriberId: z.string().uuid(),
  serviceAccountId: z.string().uuid().optional(),
  referenceNumber: z.string().min(1).max(64),
  senderName: z.string().max(128).optional(),
  senderMobile: z.string().max(32).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional(),
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  fileBase64: z.string().min(1),
});

const QueueQuerySchema = z.object({
  status: z.enum(["PENDING", "VERIFIED", "REJECTED", "FLAGGED", "ALL"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const VerifyBodySchema = z.object({
  serviceAccountId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

const RejectBodySchema = z.object({
  reason: z.string().min(5, "Rejection reason must be at least 5 characters"),
});

export const gcashRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /gcash/submit - Ingest payment proof (JSON or Multipart)
  fastify.post(
    "/gcash/submit",
    {
      preHandler: [authenticate, requireAnyPermission("payment.create", "gcash.verify")],
      schema: {
        description: "Submit a GCash proof of payment attachment and metadata",
        tags: ["GCash"],
      },
    },
    async (request, reply) => {
      const isMultipart = request.isMultipart();

      if (isMultipart) {
        let fileBuffer: Buffer | null = null;
        let originalFilename = "proof.jpg";
        let mimeType = "image/jpeg";
        const fields: Record<string, string> = {};

        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            originalFilename = part.filename;
            mimeType = part.mimetype;
            fileBuffer = await part.toBuffer();
          } else {
            fields[part.fieldname] = part.value as string;
          }
        }

        if (!fileBuffer) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Missing payment proof attachment file.",
          });
        }

        const subscriberId = fields["subscriberId"];
        const referenceNumber = fields["referenceNumber"];
        const amount = fields["amount"];
        const transactionDate = fields["transactionDate"] || (new Date().toISOString().split("T")[0] as string);

        if (!subscriberId || !referenceNumber || !amount) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "subscriberId, referenceNumber, and amount are required fields.",
          });
        }

        const result = await gcashService.submitProof({
          subscriberId,
          serviceAccountId: fields["serviceAccountId"] || undefined,
          referenceNumber,
          senderName: fields["senderName"] || undefined,
          senderMobile: fields["senderMobile"] || undefined,
          amount,
          transactionDate,
          notes: fields["notes"] || undefined,
          fileBuffer,
          originalFilename,
          mimeType,
          submittedByUserId: request.user?.id,
        });

        return reply.status(201).send(result);
      } else {
        const body = SubmitProofJsonSchema.parse(request.body);
        const fileBuffer = Buffer.from(body.fileBase64, "base64");

        const result = await gcashService.submitProof({
          subscriberId: body.subscriberId,
          serviceAccountId: body.serviceAccountId,
          referenceNumber: body.referenceNumber,
          senderName: body.senderName,
          senderMobile: body.senderMobile,
          amount: body.amount,
          transactionDate: body.transactionDate,
          notes: body.notes,
          fileBuffer,
          originalFilename: body.originalFilename,
          mimeType: body.mimeType,
          submittedByUserId: request.user?.id,
        });

        return reply.status(201).send(result);
      }
    }
  );

  // GET /gcash/verification-queue - Retrieve verification queue
  fastify.get(
    "/gcash/verification-queue",
    {
      preHandler: [authenticate, requireAnyPermission("gcash.verify", "payment.view")],
      schema: {
        description: "List payment proofs in verification queue with search, filter, and duplicate status",
        tags: ["GCash"],
      },
    },
    async (request, reply) => {
      const query = QueueQuerySchema.parse(request.query);
      const queue = await gcashService.getVerificationQueue(query);
      return reply.send(queue);
    }
  );

  // GET /gcash/proofs/:id - Retrieve proof details
  fastify.get(
    "/gcash/proofs/:id",
    {
      preHandler: [authenticate, requireAnyPermission("gcash.verify", "payment.view")],
      schema: {
        description: "Get detailed proof information including duplicate detection results",
        tags: ["GCash"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const proof = await gcashService.getProofById(id);
      return reply.send(proof);
    }
  );

  // GET /gcash/proofs/:id/file - Stream proof image/document securely
  fastify.get(
    "/gcash/proofs/:id/file",
    {
      preHandler: [authenticate, requireAnyPermission("gcash.verify", "payment.view")],
      schema: {
        description: "Stream the uploaded proof image or PDF document securely",
        tags: ["GCash"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const fileData = await gcashService.getProofFile(id);

      reply
        .header("Content-Type", fileData.mimeType)
        .header("Content-Disposition", `inline; filename="${fileData.originalFilename}"`)
        .header("Cache-Control", "private, max-age=3600")
        .send(fileData.buffer);
    }
  );

  // POST /gcash/proofs/:id/verify - Verify and post GCash payment (AT-05)
  fastify.post(
    "/gcash/proofs/:id/verify",
    {
      preHandler: [authenticate, requirePermission("gcash.verify")],
      schema: {
        description: "Verify GCash proof, mint official receipt, and post payment with oldest-first allocation",
        tags: ["GCash"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = VerifyBodySchema.parse(request.body || {});

      try {
        const result = await gcashService.verifyProof({
          proofId: id,
          verifiedByUserId: request.user!.id,
          serviceAccountId: body.serviceAccountId,
          notes: body.notes,
        });

        return reply.status(200).send(result);
      } catch (err: any) {
        if (err.message && err.message.includes("Double-posting is strictly prohibited")) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: err.message,
          });
        }
        throw err;
      }
    }
  );

  // POST /gcash/proofs/:id/reject - Reject proof with required reason
  fastify.post(
    "/gcash/proofs/:id/reject",
    {
      preHandler: [authenticate, requirePermission("gcash.verify")],
      schema: {
        description: "Reject payment proof with mandatory reason while preserving evidence",
        tags: ["GCash"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = RejectBodySchema.parse(request.body);

      const result = await gcashService.rejectProof({
        proofId: id,
        verifiedByUserId: request.user!.id,
        reason: body.reason,
      });

      return reply.status(200).send(result);
    }
  );
};
