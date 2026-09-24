import argon2 from "argon2";
import crypto from "node:crypto";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
import { db } from "../../db/db.js";
import {
  users,
  sessions,
  roles,
  permissions,
  userRoles,
  rolePermissions,
} from "../../db/schema/auth.js";
import { auditLogs } from "../../db/schema/system.js";
import { UnauthorizedError } from "../../app/errors/app-error.js";

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export class AuthService {
  public static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  public static async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  public static hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  public static async login(
    usernameInput: string,
    passwordInput: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    user: {
      id: string;
      username: string;
      displayName: string;
      email: string | null;
    };
    token: string;
    expiresAt: string;
    roles: string[];
    permissions: string[];
  }> {
    const username = usernameInput.trim().toLowerCase();

    // 1. Fetch user by username
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = ${username}`)
      .limit(1);

    if (!user) {
      throw new UnauthorizedError("Invalid username or password");
    }

    // 2. Check active status
    if (!user.isActive) {
      throw new UnauthorizedError("Account is inactive. Please contact your administrator.");
    }

    const now = new Date();

    // 3. Check account lockout
    if (user.lockedUntil && user.lockedUntil > now) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
      throw new UnauthorizedError(
        `Account is temporarily locked due to excessive failed attempts. Try again in ${remainingMinutes} minute(s).`
      );
    }

    // 4. Verify password
    const isPasswordValid = await this.verifyPassword(user.passwordHash, passwordInput);

    if (!isPasswordValid) {
      const newFailedCount = user.failedLoginCount + 1;
      const isNowLocked = newFailedCount >= LOCKOUT_THRESHOLD;
      const lockedUntil = isNowLocked ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : null;

      await db
        .update(users)
        .set({
          failedLoginCount: newFailedCount,
          lockedUntil,
          updatedAt: now,
        })
        .where(eq(users.id, user.id));

      // Record audit failure
      await db.insert(auditLogs).values({
        actorUserId: user.id,
        action: isNowLocked ? "AUTH_ACCOUNT_LOCKED" : "AUTH_LOGIN_FAILED",
        entityType: "user",
        entityId: user.id,
        ipAddress: ipAddress ?? null,
        reason: isNowLocked ? "Exceeded maximum failed login attempts (5)" : "Invalid password",
        metadata: { username, failedCount: newFailedCount },
      });

      if (isNowLocked) {
        throw new UnauthorizedError("Account is now locked for 15 minutes due to multiple failed login attempts.");
      }

      throw new UnauthorizedError("Invalid username or password");
    }

    // 5. Successful password - reset lockout counters & update lastLoginAt
    await db
      .update(users)
      .set({
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    // 6. Create session
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    await db.insert(sessions).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    // 7. Fetch user roles and permissions
    const { roleCodes, permissionCodes } = await this.getUserRolesAndPermissions(user.id);

    // 8. Audit log login success
    await db.insert(auditLogs).values({
      actorUserId: user.id,
      action: "AUTH_LOGIN_SUCCESS",
      entityType: "user",
      entityId: user.id,
      ipAddress: ipAddress ?? null,
      metadata: { username, roles: roleCodes },
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
      },
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      roles: roleCodes,
      permissions: permissionCodes,
    };
  }

  public static async logout(rawToken: string, userId?: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();

    const [session] = await db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .returning();

    if (session) {
      await db.insert(auditLogs).values({
        actorUserId: userId ?? session.userId,
        action: "AUTH_LOGOUT",
        entityType: "session",
        entityId: session.id,
        metadata: { sessionId: session.id },
      });
    }
  }

  public static async validateSession(rawToken: string): Promise<{
    user: {
      id: string;
      username: string;
      displayName: string;
      email: string | null;
    };
    roles: string[];
    permissions: string[];
  } | null> {
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();

    // Query active session
    const [sessionRecord] = await db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        isActive: users.isActive,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now)
        )
      )
      .limit(1);

    if (!sessionRecord || !sessionRecord.isActive) {
      return null;
    }

    const { roleCodes, permissionCodes } = await this.getUserRolesAndPermissions(sessionRecord.userId);

    return {
      user: {
        id: sessionRecord.userId,
        username: sessionRecord.username,
        displayName: sessionRecord.displayName,
        email: sessionRecord.email,
      },
      roles: roleCodes,
      permissions: permissionCodes,
    };
  }

  public static async getUserRolesAndPermissions(userId: string): Promise<{
    roleCodes: string[];
    permissionCodes: string[];
  }> {
    // Fetch assigned roles
    const userRoleRows = await db
      .select({
        roleId: roles.id,
        code: roles.code,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    const roleCodes = userRoleRows.map((r) => r.code);
    const roleIds = userRoleRows.map((r) => r.roleId);

    if (roleIds.length === 0) {
      return { roleCodes: [], permissionCodes: [] };
    }

    // Fetch permissions mapped to these roles
    const permissionRows = await db
      .select({
        code: permissions.code,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(sql`${rolePermissions.roleId} IN ${roleIds}`);

    // Deduplicate permissions
    const permissionCodes = Array.from(new Set(permissionRows.map((p) => p.code)));

    return { roleCodes, permissionCodes };
  }
}
