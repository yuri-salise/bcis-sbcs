import type { FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "./auth.service.js";
import { UnauthorizedError, ForbiddenError } from "../../app/errors/app-error.js";

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    roles?: string[];
    permissions?: string[];
    token?: string;
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header. Expected Bearer token.");
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new UnauthorizedError("Bearer token is empty.");
  }

  const session = await AuthService.validateSession(token);
  if (!session) {
    throw new UnauthorizedError("Session is invalid, expired, or revoked. Please log in again.");
  }

  request.user = session.user;
  request.roles = session.roles;
  request.permissions = session.permissions;
  request.token = token;
}

export function requirePermission(permissionCode: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      await authenticate(request, reply);
    }

    const roles = request.roles ?? [];
    const permissions = request.permissions ?? [];

    // Super Admin has unrestricted operational access
    if (roles.includes("SUPER_ADMIN")) {
      return;
    }

    if (!permissions.includes(permissionCode)) {
      throw new ForbiddenError(
        `Access denied. You lack the required permission: "${permissionCode}" to access this resource.`
      );
    }
  };
}
