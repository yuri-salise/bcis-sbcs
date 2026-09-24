import { eq, and } from "drizzle-orm";
import { db, queryClient } from "../db.js";
import { users, roles, permissions, rolePermissions, userRoles } from "../schema/auth.js";
import { AuthService } from "../../modules/auth/auth.service.js";

export async function runSeeds() {
  console.log("Seeding database with default roles, permissions, and demo users...");

  // 1. Roles
  const defaultRoles = [
    { code: "SUPER_ADMIN", name: "Owner / Super Admin", description: "Full operational and administrative authority" },
    { code: "ADMIN", name: "Administrator", description: "Operational administration, billing, and subscriber control" },
    { code: "CASHIER", name: "Cashier", description: "Daily payment collection, receipt issuing, and balance inquiry" },
    { code: "COLLECTION_SUPERVISOR", name: "Collection Supervisor", description: "Field collections, batch routes, and remittance reconciliation" },
    { code: "AUDITOR", name: "Accounting / Auditor", description: "Audit trail reviews, adjustments review, financial reports" },
    { code: "TECHNICIAN", name: "Technician", description: "Field installations, service suspensions, and reconnections" },
    { code: "VIEWER", name: "Read-only Viewer", description: "Executive dashboard view and read-only reports" },
  ];

  for (const r of defaultRoles) {
    const [existing] = await db.select().from(roles).where(eq(roles.code, r.code)).limit(1);
    if (!existing) {
      await db.insert(roles).values(r);
    }
  }

  // 2. Permissions
  const defaultPermissions = [
    { code: "subscriber.view", name: "View Subscribers", category: "Subscribers" },
    { code: "subscriber.create", name: "Create Subscribers", category: "Subscribers" },
    { code: "subscriber.update", name: "Update Subscribers", category: "Subscribers" },
    { code: "service.view", name: "View Services and Plans", category: "Services" },
    { code: "service.manage", name: "Manage Service Plans", category: "Services" },
    { code: "service.control", name: "Service Suspension & Reconnection", category: "Services" },
    { code: "billing.view", name: "View Invoices & Billing Cycles", category: "Billing" },
    { code: "billing.generate", name: "Generate Monthly Billing", category: "Billing" },
    { code: "payment.view", name: "View Payments & Receipts", category: "Payments" },
    { code: "payment.create", name: "Process & Post Payments", category: "Payments" },
    { code: "payment.reverse", name: "Reverse Payments", category: "Payments" },
    { code: "gcash.verify", name: "Verify GCash Submissions", category: "GCash" },
    { code: "collection.view", name: "View Collection Batches", category: "Collections" },
    { code: "collection.manage", name: "Manage Collectors & Routes", category: "Collections" },
    { code: "collection.reconcile", name: "Reconcile Collector Remittances", category: "Collections" },
    { code: "receivables.view", name: "View Accounts Receivable Aging", category: "Receivables" },
    { code: "report.view", name: "View Operational Reports", category: "Reports" },
    { code: "report.export", name: "Export Reports to PDF/XLSX", category: "Reports" },
    { code: "user.manage", name: "Manage System Users & Roles", category: "Administration" },
    { code: "audit.view", name: "View Audit Trail", category: "Audit" },
    { code: "backup.restore", name: "Perform Backups and Restores", category: "Administration" },
  ];

  for (const p of defaultPermissions) {
    const [existing] = await db.select().from(permissions).where(eq(permissions.code, p.code)).limit(1);
    if (!existing) {
      await db.insert(permissions).values(p);
    }
  }

  // Fetch all roles & permissions from DB
  const allRoles = await db.select().from(roles);
  const allPermissions = await db.select().from(permissions);

  const roleMap = new Map(allRoles.map((r) => [r.code, r.id]));
  const permMap = new Map(allPermissions.map((p) => [p.code, p.id]));

  // 3. Map Role Permissions
  const rolePermissionAssignments: Record<string, string[]> = {
    SUPER_ADMIN: allPermissions.map((p) => p.code),
    ADMIN: [
      "subscriber.view", "subscriber.create", "subscriber.update",
      "service.view", "service.manage", "service.control",
      "billing.view", "billing.generate",
      "payment.view", "payment.create",
      "gcash.verify",
      "collection.view", "collection.manage", "collection.reconcile",
      "receivables.view",
      "report.view", "report.export",
      "audit.view",
    ],
    CASHIER: [
      "subscriber.view",
      "service.view",
      "billing.view",
      "payment.view", "payment.create",
      "receivables.view",
    ],
    COLLECTION_SUPERVISOR: [
      "subscriber.view",
      "collection.view", "collection.manage", "collection.reconcile",
      "receivables.view",
      "report.view",
    ],
    AUDITOR: [
      "subscriber.view",
      "billing.view",
      "payment.view",
      "collection.view",
      "receivables.view",
      "report.view", "report.export",
      "audit.view",
    ],
    TECHNICIAN: [
      "subscriber.view",
      "service.view",
      "service.control",
    ],
    VIEWER: [
      "subscriber.view",
      "service.view",
      "billing.view",
      "report.view",
    ],
  };

  for (const [rCode, pCodes] of Object.entries(rolePermissionAssignments)) {
    const roleId = roleMap.get(rCode);
    if (!roleId) continue;

    for (const pCode of pCodes) {
      const permissionId = permMap.get(pCode);
      if (!permissionId) continue;

      const [existing] = await db
        .select()
        .from(rolePermissions)
        .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId)))
        .limit(1);

      if (!existing) {
        await db.insert(rolePermissions).values({ roleId, permissionId });
      }
    }
  }

  // 4. Seed Demo Users
  const defaultPasswordHash = await AuthService.hashPassword("Password123!");

  const demoUsers = [
    {
      username: "admin",
      passwordHash: defaultPasswordHash,
      displayName: "Maria Santos (Super Admin)",
      email: "admin@bcis.local",
      roleCode: "SUPER_ADMIN",
    },
    {
      username: "cashier",
      passwordHash: defaultPasswordHash,
      displayName: "Elena Ramos (Cashier)",
      email: "cashier@bcis.local",
      roleCode: "CASHIER",
    },
    {
      username: "supervisor",
      passwordHash: defaultPasswordHash,
      displayName: "Carlos Reyes (Supervisor)",
      email: "supervisor@bcis.local",
      roleCode: "COLLECTION_SUPERVISOR",
    },
    {
      username: "auditor",
      passwordHash: defaultPasswordHash,
      displayName: "Grace Lim (Auditor)",
      email: "auditor@bcis.local",
      roleCode: "AUDITOR",
    },
    {
      username: "tech",
      passwordHash: defaultPasswordHash,
      displayName: "Danilo Cruz (Technician)",
      email: "tech@bcis.local",
      roleCode: "TECHNICIAN",
    },
  ];

  for (const u of demoUsers) {
    let [user] = await db.select().from(users).where(eq(users.username, u.username)).limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          username: u.username,
          passwordHash: u.passwordHash,
          displayName: u.displayName,
          email: u.email,
          isActive: true,
        })
        .returning();
    }

    if (user) {
      const roleId = roleMap.get(u.roleCode);
      if (roleId) {
        const [existingUserRole] = await db
          .select()
          .from(userRoles)
          .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, roleId)))
          .limit(1);

        if (!existingUserRole) {
          await db.insert(userRoles).values({
            userId: user.id,
            roleId,
          });
        }
      }
    }
  }

  console.log("Database seeded successfully with default roles, permissions, and users.");
}

// Allow direct CLI execution
runSeeds()
  .then(async () => {
    await queryClient.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Seeding failed:", err);
    await queryClient.end();
    process.exit(1);
  });
