import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { backupService } from "./backup.service.js";
import { authenticate, requirePermission } from "../auth/auth.guard.js";

const createBackupSchema = z.object({
  type: z.enum(["FULL", "DATABASE_ONLY"]).default("DATABASE_ONLY"),
  notes: z.string().max(500).optional(),
});

export const backupRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. List backup history
  fastify.get(
    "/system/backups",
    {
      preHandler: [authenticate, requirePermission("backup.restore")],
      schema: {
        description: "List historical backups with size, checksum, and verification status",
        tags: ["System & Backup"],
      },
    },
    async (_request, reply) => {
      const backups = await backupService.listBackups();
      return reply.send({ data: backups });
    }
  );

  // 2. Trigger new backup creation
  fastify.post<{
    Body: z.infer<typeof createBackupSchema>;
  }>(
    "/system/backups",
    {
      preHandler: [authenticate, requirePermission("backup.restore")],
      schema: {
        description: "Generate a new cryptographic database/system backup",
        tags: ["System & Backup"],
      },
    },
    async (request, reply) => {
      const body = createBackupSchema.parse(request.body || {});
      const user = (request as any).user;
      const backup = await backupService.createBackup({
        type: body.type,
        createdBy: user?.id,
        notes: body.notes,
      });
      return reply.status(201).send({ data: backup });
    }
  );

  // 3. Get single backup details
  fastify.get<{
    Params: { id: string };
  }>(
    "/system/backups/:id",
    {
      preHandler: [authenticate, requirePermission("backup.restore")],
      schema: {
        description: "Get detailed metadata for a specific backup",
        tags: ["System & Backup"],
      },
    },
    async (request, reply) => {
      const backup = await backupService.getBackupById(request.params.id);
      return reply.send({ data: backup });
    }
  );

  // 4. Verify backup checksum and manifest
  fastify.post<{
    Params: { id: string };
  }>(
    "/system/backups/:id/verify",
    {
      preHandler: [authenticate, requirePermission("backup.restore")],
      schema: {
        description: "Verify backup SHA-256 checksum and schema manifest against disk storage",
        tags: ["System & Backup"],
      },
    },
    async (request, reply) => {
      const result = await backupService.verifyBackup(request.params.id);
      return reply.send({ data: result });
    }
  );

  // 5. Restore database from verified backup
  fastify.post<{
    Params: { id: string };
  }>(
    "/system/backups/:id/restore",
    {
      preHandler: [authenticate, requirePermission("backup.restore")],
      schema: {
        description: "Restore entire database state and resynchronize sequences from approved backup",
        tags: ["System & Backup"],
      },
    },
    async (request, reply) => {
      const user = (request as any).user;
      const result = await backupService.restoreBackup(request.params.id, user?.id);
      return reply.send({ data: result });
    }
  );

  // 6. Database Integrity Check Diagnostics
  fastify.get(
    "/system/database/integrity",
    {
      preHandler: [authenticate, requirePermission("backup.restore")],
      schema: {
        description: "Run automated database integrity checks (orphans, balance drift, sequence health)",
        tags: ["System & Backup"],
      },
    },
    async (_request, reply) => {
      const report = await backupService.checkDatabaseIntegrity();
      return reply.send({ data: report });
    }
  );
};
