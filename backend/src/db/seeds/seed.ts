import { eq, and } from "drizzle-orm";
import { db, queryClient } from "../db.js";
import { users, roles, permissions, rolePermissions, userRoles } from "../schema/auth.js";
import {
  serviceTypes,
  servicePlans,
  collectionAreas,
  collectors,
  subscribers,
  subscriberAddresses,
  serviceAccounts,
  serviceAccountStatusHistory,
} from "../schema/subscribers.js";
import { billingCycles } from "../schema/billing.js";
import { applicationSettings } from "../schema/system.js";
import { AuthService } from "../../modules/auth/auth.service.js";
import { setSequenceValue } from "../sequences.js";

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
      "payment.view", "payment.create", "payment.reverse",
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
      "gcash.verify",
      "collection.view", "collection.manage",
      "receivables.view",
    ],
    COLLECTION_SUPERVISOR: [
      "subscriber.view",
      "service.control",
      "payment.view", "payment.reverse",
      "gcash.verify",
      "collection.view", "collection.manage", "collection.reconcile",
      "receivables.view",
      "report.view", "report.export",
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
    {
      username: "viewer",
      passwordHash: defaultPasswordHash,
      displayName: "Vicente Flores (Viewer)",
      email: "viewer@bcis.local",
      roleCode: "VIEWER",
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

  // Fetch admin user for audit tracking in status history
  const [adminUser] = await db.select().from(users).where(eq(users.username, "admin")).limit(1);

  // 5. Seed Service Types
  console.log("Seeding service types...");
  const typesData = [
    { code: "INTERNET", name: "High-Speed Fiber Internet", description: "Broadband fiber internet connectivity" },
    { code: "CABLE", name: "Cable Television", description: "Digital and analog cable TV packages" },
    { code: "COMBO", name: "Fiber Internet + Cable TV Combo", description: "Bundled fiber broadband and television package" },
  ];

  for (const t of typesData) {
    const [existing] = await db.select().from(serviceTypes).where(eq(serviceTypes.code, t.code)).limit(1);
    if (!existing) {
      await db.insert(serviceTypes).values(t);
    }
  }

  const allServiceTypes = await db.select().from(serviceTypes);
  const typeMap = new Map(allServiceTypes.map((t) => [t.code, t.id]));

  // 6. Seed Service Plans
  console.log("Seeding service plans...");
  const plansData = [
    {
      serviceTypeCode: "INTERNET",
      code: "PLAN-INT-25M",
      name: "Fiber 25 Mbps",
      description: "Entry-level fiber internet for basic browsing and streaming",
      monthlyPrice: "999.00",
      installationFee: "1500.00",
      reconnectionFee: "300.00",
      speedMbps: 25,
      channelCount: null,
    },
    {
      serviceTypeCode: "INTERNET",
      code: "PLAN-INT-50M",
      name: "Fiber 50 Mbps",
      description: "Standard family fiber internet for multi-device streaming and gaming",
      monthlyPrice: "1299.00",
      installationFee: "1500.00",
      reconnectionFee: "300.00",
      speedMbps: 50,
      channelCount: null,
    },
    {
      serviceTypeCode: "INTERNET",
      code: "PLAN-INT-100M",
      name: "Fiber 100 Mbps",
      description: "Ultra-fast fiber internet for heavy downloads and home office",
      monthlyPrice: "1699.00",
      installationFee: "1500.00",
      reconnectionFee: "300.00",
      speedMbps: 100,
      channelCount: null,
    },
    {
      serviceTypeCode: "CABLE",
      code: "PLAN-CAB-STD",
      name: "Standard Cable TV (50 Channels)",
      description: "Essential local and international SD/HD cable channels",
      monthlyPrice: "499.00",
      installationFee: "1000.00",
      reconnectionFee: "250.00",
      speedMbps: null,
      channelCount: 50,
    },
    {
      serviceTypeCode: "CABLE",
      code: "PLAN-CAB-PREM",
      name: "Premium Cable TV (100 Channels)",
      description: "Full digital cable channels with sports, movies, and news in HD",
      monthlyPrice: "799.00",
      installationFee: "1000.00",
      reconnectionFee: "250.00",
      speedMbps: null,
      channelCount: 100,
    },
    {
      serviceTypeCode: "COMBO",
      code: "PLAN-COM-30M",
      name: "Combo 30 Mbps + Standard Cable",
      description: "Value bundle combining 30 Mbps fiber internet with 50-channel cable TV",
      monthlyPrice: "1299.00",
      installationFee: "1800.00",
      reconnectionFee: "350.00",
      speedMbps: 30,
      channelCount: 50,
    },
    {
      serviceTypeCode: "COMBO",
      code: "PLAN-COM-75M",
      name: "Combo 75 Mbps + Premium Cable",
      description: "Premium bundle combining 75 Mbps fiber internet with 100-channel cable TV",
      monthlyPrice: "1899.00",
      installationFee: "1800.00",
      reconnectionFee: "350.00",
      speedMbps: 75,
      channelCount: 100,
    },
  ];

  for (const p of plansData) {
    const typeId = typeMap.get(p.serviceTypeCode);
    if (!typeId) continue;
    const [existing] = await db.select().from(servicePlans).where(eq(servicePlans.code, p.code)).limit(1);
    if (!existing) {
      await db.insert(servicePlans).values({
        serviceTypeId: typeId,
        code: p.code,
        name: p.name,
        description: p.description,
        monthlyPrice: p.monthlyPrice,
        installationFee: p.installationFee,
        reconnectionFee: p.reconnectionFee,
        speedMbps: p.speedMbps,
        channelCount: p.channelCount,
        isActive: true,
      });
    }
  }

  const allPlans = await db.select().from(servicePlans);
  const planMap = new Map(allPlans.map((p) => [p.code, p.id]));

  // 7. Seed Collection Areas
  console.log("Seeding collection areas...");
  const areasData = [
    { code: "AREA-CAS", name: "Barangay Casisang", description: "Purok 1 to Purok 12 Casisang" },
    { code: "AREA-POB", name: "Barangay Poblacion", description: "Downtown Malaybalay Commercial & Residential" },
    { code: "AREA-SMP", name: "Barangay Sumpong", description: "Sumpong Highway & Inner Residential Zones" },
  ];

  for (const a of areasData) {
    const [existing] = await db.select().from(collectionAreas).where(eq(collectionAreas.code, a.code)).limit(1);
    if (!existing) {
      await db.insert(collectionAreas).values(a);
    }
  }

  const allAreas = await db.select().from(collectionAreas);
  const areaMap = new Map(allAreas.map((a) => [a.code, a.id]));

  // 8. Seed Collectors
  console.log("Seeding collectors...");
  const [cashierUser] = await db.select().from(users).where(eq(users.username, "cashier")).limit(1);
  const [supervisorUser] = await db.select().from(users).where(eq(users.username, "supervisor")).limit(1);

  const collectorsData = [
    {
      collectorCode: "COL-001",
      name: "Juan Dela Cruz",
      contactNumber: "09171234501",
      userId: cashierUser?.id,
      isActive: true,
    },
    {
      collectorCode: "COL-002",
      name: "Pedro Remit",
      contactNumber: "09181234502",
      userId: supervisorUser?.id,
      isActive: true,
    },
  ];

  for (const c of collectorsData) {
    const [existing] = await db.select().from(collectors).where(eq(collectors.collectorCode, c.collectorCode)).limit(1);
    if (!existing) {
      await db.insert(collectors).values(c);
    }
  }

  const allCollectors = await db.select().from(collectors);
  const collectorMap = new Map(allCollectors.map((c) => [c.collectorCode, c.id]));

  // 9. Seed Demo Subscribers & Service Accounts
  console.log("Seeding demo subscribers, addresses, and service accounts...");

  const demoSubscribersData = [
    {
      accountNumber: "BCIS-SUB-2026-0001",
      firstName: "Juan",
      middleName: "Bautista",
      lastName: "Mercado",
      businessName: null,
      primaryContactNumber: "0917-555-0101",
      secondaryContactNumber: "088-813-1101",
      email: "juan.mercado@gmail.com",
      status: "ACTIVE",
      notes: "Residential fiber subscriber since January 2026.",
      address: {
        label: "Home",
        line1: "Purok 3, Sayre Highway",
        line2: "Near Casisang Central School",
        barangay: "Casisang",
        cityMunicipality: "Malaybalay City",
        province: "Bukidnon",
        postalCode: "8700",
        landmark: "Yellow 2-storey house with black gate",
      },
      serviceAccount: {
        serviceAccountNumber: "BCIS-SA-2026-0001",
        serviceTypeCode: "INTERNET",
        servicePlanCode: "PLAN-INT-50M",
        activationDate: "2026-01-15",
        billingStartDate: "2026-01-15",
        billingDay: 1,
        dueDay: 15,
        currentRate: "1299.00",
        status: "ACTIVE",
        collectorCode: "COL-001",
        collectionAreaCode: "AREA-CAS",
        cachedBalanceDue: "0.00",
      },
    },
    {
      accountNumber: "BCIS-SUB-2026-0002",
      firstName: "Maria Clara",
      middleName: "Santos",
      lastName: "Garcia",
      businessName: "Garcia Mini Mart",
      primaryContactNumber: "0920-555-0202",
      secondaryContactNumber: null,
      email: "mc.garcia@yahoo.com",
      status: "ACTIVE",
      notes: "Commercial combo internet and cable subscriber.",
      address: {
        label: "Business Store",
        line1: "Fortich Street, Corner San Isidro",
        line2: "Building B, Ground Floor",
        barangay: "Poblacion",
        cityMunicipality: "Malaybalay City",
        province: "Bukidnon",
        postalCode: "8700",
        landmark: "Opposite City Hall Plaza",
      },
      serviceAccount: {
        serviceAccountNumber: "BCIS-SA-2026-0002",
        serviceTypeCode: "COMBO",
        servicePlanCode: "PLAN-COM-30M",
        activationDate: "2026-02-01",
        billingStartDate: "2026-02-01",
        billingDay: 1,
        dueDay: 15,
        currentRate: "1299.00",
        status: "ACTIVE",
        collectorCode: "COL-002",
        collectionAreaCode: "AREA-POB",
        cachedBalanceDue: "0.00",
      },
    },
    {
      accountNumber: "BCIS-SUB-2026-0003",
      firstName: "Roberto",
      middleName: "Sy",
      lastName: "Tan",
      businessName: null,
      primaryContactNumber: "0908-555-0303",
      secondaryContactNumber: null,
      email: "robert.tan@outlook.com",
      status: "ACTIVE",
      notes: "Cable television subscriber. Currently suspended due to unpaid bill.",
      address: {
        label: "Home",
        line1: "Purok 5, Zone 2",
        line2: "Block 4 Lot 12",
        barangay: "Sumpong",
        cityMunicipality: "Malaybalay City",
        province: "Bukidnon",
        postalCode: "8700",
        landmark: "Behind Sumpong Barangay Hall",
      },
      serviceAccount: {
        serviceAccountNumber: "BCIS-SA-2026-0003",
        serviceTypeCode: "CABLE",
        servicePlanCode: "PLAN-CAB-STD",
        activationDate: "2025-11-10",
        billingStartDate: "2025-11-10",
        billingDay: 1,
        dueDay: 15,
        currentRate: "499.00",
        status: "SUSPENDED",
        collectorCode: "COL-001",
        collectionAreaCode: "AREA-SMP",
        cachedBalanceDue: "499.00",
        statusHistoryReason: "Non-payment of past due invoices",
      },
    },
  ];

  for (const s of demoSubscribersData) {
    let [sub] = await db.select().from(subscribers).where(eq(subscribers.accountNumber, s.accountNumber)).limit(1);
    if (!sub) {
      [sub] = await db
        .insert(subscribers)
        .values({
          accountNumber: s.accountNumber,
          firstName: s.firstName,
          middleName: s.middleName,
          lastName: s.lastName,
          businessName: s.businessName,
          primaryContactNumber: s.primaryContactNumber,
          secondaryContactNumber: s.secondaryContactNumber,
          email: s.email,
          status: s.status,
          notes: s.notes,
        })
        .returning();
    }

    if (!sub) continue;

    // Address
    let [addr] = await db
      .select()
      .from(subscriberAddresses)
      .where(and(eq(subscriberAddresses.subscriberId, sub.id), eq(subscriberAddresses.isPrimary, true)))
      .limit(1);

    if (!addr) {
      [addr] = await db
        .insert(subscriberAddresses)
        .values({
          subscriberId: sub.id,
          label: s.address.label,
          line1: s.address.line1,
          line2: s.address.line2,
          barangay: s.address.barangay,
          cityMunicipality: s.address.cityMunicipality,
          province: s.address.province,
          postalCode: s.address.postalCode,
          landmark: s.address.landmark,
          isPrimary: true,
        })
        .returning();
    }

    // Service Account
    const typeId = typeMap.get(s.serviceAccount.serviceTypeCode);
    const planId = planMap.get(s.serviceAccount.servicePlanCode);
    const collectorId = collectorMap.get(s.serviceAccount.collectorCode);
    const areaId = areaMap.get(s.serviceAccount.collectionAreaCode);

    if (typeId && planId && addr) {
      let [sa] = await db
        .select()
        .from(serviceAccounts)
        .where(eq(serviceAccounts.serviceAccountNumber, s.serviceAccount.serviceAccountNumber))
        .limit(1);

      if (!sa) {
        [sa] = await db
          .insert(serviceAccounts)
          .values({
            subscriberId: sub.id,
            serviceAccountNumber: s.serviceAccount.serviceAccountNumber,
            serviceTypeId: typeId,
            servicePlanId: planId,
            installationAddressId: addr.id,
            activationDate: s.serviceAccount.activationDate,
            billingStartDate: s.serviceAccount.billingStartDate,
            billingDay: s.serviceAccount.billingDay,
            dueDay: s.serviceAccount.dueDay,
            currentRate: s.serviceAccount.currentRate,
            status: s.serviceAccount.status,
            collectorId: collectorId || null,
            collectionAreaId: areaId || null,
            cachedBalanceDue: s.serviceAccount.cachedBalanceDue,
          })
          .returning();

        // If suspended, add status history record
        if (s.serviceAccount.status === "SUSPENDED" && sa) {
          await db.insert(serviceAccountStatusHistory).values({
            serviceAccountId: sa.id,
            fromStatus: "ACTIVE",
            toStatus: "SUSPENDED",
            reason: s.serviceAccount.statusHistoryReason || "Administrative suspension",
            actorUserId: adminUser?.id || null,
            notes: "Initial demo suspension for testing service controls.",
          });
        }
      }
    }
  }

  // Set sequence values so subsequent accounts generate from 4 onwards
  await setSequenceValue("BCIS-SUB", 3);
  await setSequenceValue("BCIS-SA", 3);

  // 10. Seed Billing Cycles
  console.log("Seeding billing cycles...");
  const defaultCycles = [
    {
      cycleCode: "2026-08",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      billingDate: "2026-08-01",
      dueDate: "2026-08-15",
      status: "CLOSED",
    },
    {
      cycleCode: "2026-09",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      billingDate: "2026-09-01",
      dueDate: "2026-09-15",
      status: "OPEN",
    },
  ];

  for (const c of defaultCycles) {
    const [existing] = await db.select().from(billingCycles).where(eq(billingCycles.cycleCode, c.cycleCode)).limit(1);
    if (!existing) {
      await db.insert(billingCycles).values(c);
    }
  }

  // 9. Application Settings (PRODUCT.md Section 8.11)
  const defaultSettings = [
    { key: "grace_period_days", value: "5", description: "Default grace period in days before an unpaid invoice is deemed delinquent" },
    { key: "suspension_threshold_amount", value: "1500.00", description: "Cumulative overdue balance threshold triggering suspension recommendation" },
    { key: "suspension_threshold_overdue_days", value: "30", description: "Overdue days threshold triggering service suspension candidate status" },
    { key: "default_reconnection_fee", value: "300.00", description: "Standard service reconnection fee in PHP" },
  ];

  for (const s of defaultSettings) {
    const [existing] = await db.select().from(applicationSettings).where(eq(applicationSettings.key, s.key)).limit(1);
    if (!existing) {
      await db.insert(applicationSettings).values(s);
    }
  }

  console.log("Database seeded successfully with catalog, subscribers, service accounts, billing cycles, and system settings.");
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
