import { eq, and, or, ilike, desc, sql, count } from "drizzle-orm";
import { db } from "../../db/db.js";
import {
  subscribers,
  subscriberAddresses,
  serviceAccounts,
  servicePlans,
  serviceTypes,
  collectionAreas,
  collectors,
  serviceAccountStatusHistory,
} from "../../db/schema/subscribers.js";
import { auditLogs } from "../../db/schema/system.js";
import { users } from "../../db/schema/auth.js";
import { getNextDocumentNumber } from "../../db/sequences.js";
import {
  NotFoundError,
  BadRequestError,
} from "../../app/errors/app-error.js";

export interface AddressInput {
  label?: string;
  line1: string;
  line2?: string | null;
  barangay: string;
  cityMunicipality?: string;
  province?: string;
  postalCode?: string;
  landmark?: string | null;
}

export interface CreateSubscriberInput {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  businessName?: string | null;
  primaryContactNumber: string;
  secondaryContactNumber?: string | null;
  email?: string | null;
  notes?: string | null;
  address: AddressInput;
}

export interface UpdateSubscriberInput {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  businessName?: string | null;
  primaryContactNumber?: string;
  secondaryContactNumber?: string | null;
  email?: string | null;
  status?: string;
  notes?: string | null;
  address?: AddressInput;
}

export interface CreateServiceAccountInput {
  servicePlanId: string;
  installationAddressId?: string;
  activationDate?: string;
  billingStartDate?: string;
  billingDay?: number;
  dueDay?: number;
  collectorId?: string | null;
  collectionAreaId?: string | null;
  reason?: string;
  notes?: string | null;
}

export interface ListSubscribersParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export class SubscriberService {
  /**
   * List subscribers with pagination, search, and primary address
   */
  public static async listSubscribers(params: ListSubscribersParams) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (params.status) {
      conditions.push(eq(subscribers.status, params.status));
    }

    if (params.search) {
      const q = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(subscribers.accountNumber, q),
          ilike(subscribers.firstName, q),
          ilike(subscribers.lastName, q),
          ilike(subscribers.businessName, q),
          ilike(subscribers.primaryContactNumber, q)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count query
    const [countResult] = await db
      .select({ total: count() })
      .from(subscribers)
      .where(whereClause);
    const total = Number(countResult?.total ?? 0);

    // Subscribers query
    const rows = await db
      .select()
      .from(subscribers)
      .where(whereClause)
      .orderBy(desc(subscribers.createdAt))
      .limit(limit)
      .offset(offset);

    // Hydrate primary addresses and active service account counts
    const subscriberIds = rows.map((s) => s.id);
    let addressMap = new Map<string, typeof subscriberAddresses.$inferSelect>();
    let serviceAccountCountMap = new Map<string, number>();

    if (subscriberIds.length > 0) {
      const addrs = await db
        .select()
        .from(subscriberAddresses)
        .where(
          and(
            eq(subscriberAddresses.isPrimary, true),
            sql`${subscriberAddresses.subscriberId} IN ${subscriberIds}`
          )
        );
      for (const a of addrs) {
        addressMap.set(a.subscriberId, a);
      }

      const saCounts = await db
        .select({
          subscriberId: serviceAccounts.subscriberId,
          count: count(),
        })
        .from(serviceAccounts)
        .where(sql`${serviceAccounts.subscriberId} IN ${subscriberIds}`)
        .groupBy(serviceAccounts.subscriberId);

      for (const sc of saCounts) {
        serviceAccountCountMap.set(sc.subscriberId, Number(sc.count));
      }
    }

    const data = rows.map((s) => ({
      ...s,
      primaryAddress: addressMap.get(s.id) || null,
      serviceAccountsCount: serviceAccountCountMap.get(s.id) || 0,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single subscriber by ID or Account Number with complete details
   */
  public static async getSubscriberById(idOrAccountNumber: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrAccountNumber
    );

    const [subscriber] = await db
      .select()
      .from(subscribers)
      .where(
        isUuid
          ? eq(subscribers.id, idOrAccountNumber)
          : eq(subscribers.accountNumber, idOrAccountNumber)
      )
      .limit(1);

    if (!subscriber) {
      throw new NotFoundError(`Subscriber '${idOrAccountNumber}' not found`);
    }

    // Addresses
    const addresses = await db
      .select()
      .from(subscriberAddresses)
      .where(eq(subscriberAddresses.subscriberId, subscriber.id))
      .orderBy(desc(subscriberAddresses.isPrimary), desc(subscriberAddresses.createdAt));

    // Service accounts with joined details
    const saRows = await db
      .select({
        serviceAccount: serviceAccounts,
        serviceType: serviceTypes,
        servicePlan: servicePlans,
        collectionArea: collectionAreas,
        collector: collectors,
      })
      .from(serviceAccounts)
      .leftJoin(serviceTypes, eq(serviceAccounts.serviceTypeId, serviceTypes.id))
      .leftJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
      .leftJoin(collectionAreas, eq(serviceAccounts.collectionAreaId, collectionAreas.id))
      .leftJoin(collectors, eq(serviceAccounts.collectorId, collectors.id))
      .where(eq(serviceAccounts.subscriberId, subscriber.id))
      .orderBy(desc(serviceAccounts.createdAt));

    // Load status history for each service account
    const saIds = saRows.map((r) => r.serviceAccount.id);
    let historyMap = new Map<string, any[]>();

    if (saIds.length > 0) {
      const histories = await db
        .select({
          history: serviceAccountStatusHistory,
          actor: {
            id: users.id,
            username: users.username,
            displayName: users.displayName,
          },
        })
        .from(serviceAccountStatusHistory)
        .leftJoin(users, eq(serviceAccountStatusHistory.actorUserId, users.id))
        .where(sql`${serviceAccountStatusHistory.serviceAccountId} IN ${saIds}`)
        .orderBy(desc(serviceAccountStatusHistory.effectiveAt));

      for (const h of histories) {
        const list = historyMap.get(h.history.serviceAccountId) || [];
        list.push({
          ...h.history,
          actor: h.actor,
        });
        historyMap.set(h.history.serviceAccountId, list);
      }
    }

    const formattedServiceAccounts = saRows.map((r) => ({
      ...r.serviceAccount,
      serviceType: r.serviceType,
      servicePlan: r.servicePlan,
      collectionArea: r.collectionArea,
      collector: r.collector,
      statusHistory: historyMap.get(r.serviceAccount.id) || [],
    }));

    return {
      ...subscriber,
      addresses,
      serviceAccounts: formattedServiceAccounts,
    };
  }

  /**
   * Create subscriber with primary address inside transaction
   */
  public static async createSubscriber(
    input: CreateSubscriberInput,
    actorId?: string,
    clientInfo?: { ipAddress?: string; requestId?: string }
  ) {
    if (!input.firstName?.trim() || !input.lastName?.trim()) {
      throw new BadRequestError("First name and last name are required");
    }
    if (!input.primaryContactNumber?.trim()) {
      throw new BadRequestError("Primary contact number is required");
    }
    if (!input.address?.line1?.trim() || !input.address?.barangay?.trim()) {
      throw new BadRequestError("Address line 1 and barangay are required");
    }

    return await db.transaction(async (tx) => {
      const accountNumber = await getNextDocumentNumber("BCIS-SUB", tx);

      const [newSubscriber] = await tx
        .insert(subscribers)
        .values({
          accountNumber,
          firstName: input.firstName.trim(),
          middleName: input.middleName?.trim() || null,
          lastName: input.lastName.trim(),
          businessName: input.businessName?.trim() || null,
          primaryContactNumber: input.primaryContactNumber.trim(),
          secondaryContactNumber: input.secondaryContactNumber?.trim() || null,
          email: input.email?.trim().toLowerCase() || null,
          status: "ACTIVE",
          notes: input.notes?.trim() || null,
        })
        .returning();

      if (!newSubscriber) {
        throw new Error("Failed to create subscriber record");
      }

      const [newAddress] = await tx
        .insert(subscriberAddresses)
        .values({
          subscriberId: newSubscriber.id,
          label: input.address.label?.trim() || "Home",
          line1: input.address.line1.trim(),
          line2: input.address.line2?.trim() || null,
          barangay: input.address.barangay.trim(),
          cityMunicipality: input.address.cityMunicipality?.trim() || "Malaybalay City",
          province: input.address.province?.trim() || "Bukidnon",
          postalCode: input.address.postalCode?.trim() || "8700",
          landmark: input.address.landmark?.trim() || null,
          isPrimary: true,
        })
        .returning();

      // Audit log
      await tx.insert(auditLogs).values({
        actorUserId: actorId || null,
        action: "SUBSCRIBER_CREATE",
        entityType: "subscribers",
        entityId: newSubscriber.id,
        requestId: clientInfo?.requestId,
        ipAddress: clientInfo?.ipAddress,
        newValues: {
          subscriber: newSubscriber,
          primaryAddress: newAddress,
        },
      });

      return {
        ...newSubscriber,
        addresses: [newAddress],
        serviceAccounts: [],
      };
    });
  }

  /**
   * Update subscriber details and optional address
   */
  public static async updateSubscriber(
    id: string,
    input: UpdateSubscriberInput,
    actorId?: string,
    clientInfo?: { ipAddress?: string; requestId?: string }
  ) {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(subscribers)
        .where(eq(subscribers.id, id))
        .limit(1);

      if (!existing) {
        throw new NotFoundError(`Subscriber '${id}' not found`);
      }

      const updateData: Partial<typeof subscribers.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (input.firstName !== undefined) updateData.firstName = input.firstName.trim();
      if (input.middleName !== undefined) updateData.middleName = input.middleName?.trim() || null;
      if (input.lastName !== undefined) updateData.lastName = input.lastName.trim();
      if (input.businessName !== undefined) updateData.businessName = input.businessName?.trim() || null;
      if (input.primaryContactNumber !== undefined) updateData.primaryContactNumber = input.primaryContactNumber.trim();
      if (input.secondaryContactNumber !== undefined) updateData.secondaryContactNumber = input.secondaryContactNumber?.trim() || null;
      if (input.email !== undefined) updateData.email = input.email?.trim().toLowerCase() || null;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null;

      const [updatedSubscriber] = await tx
        .update(subscribers)
        .set(updateData)
        .where(eq(subscribers.id, id))
        .returning();

      if (input.address) {
        const [existingAddr] = await tx
          .select()
          .from(subscriberAddresses)
          .where(
            and(
              eq(subscriberAddresses.subscriberId, id),
              eq(subscriberAddresses.isPrimary, true)
            )
          )
          .limit(1);

        if (existingAddr) {
          await tx
            .update(subscriberAddresses)
            .set({
              label: input.address.label?.trim() || existingAddr.label,
              line1: input.address.line1?.trim() || existingAddr.line1,
              line2: input.address.line2 !== undefined ? input.address.line2?.trim() || null : existingAddr.line2,
              barangay: input.address.barangay?.trim() || existingAddr.barangay,
              cityMunicipality: input.address.cityMunicipality?.trim() || existingAddr.cityMunicipality,
              province: input.address.province?.trim() || existingAddr.province,
              postalCode: input.address.postalCode?.trim() || existingAddr.postalCode,
              landmark: input.address.landmark !== undefined ? input.address.landmark?.trim() || null : existingAddr.landmark,
              updatedAt: new Date(),
            })
            .where(eq(subscriberAddresses.id, existingAddr.id));
        }
      }

      await tx.insert(auditLogs).values({
        actorUserId: actorId || null,
        action: "SUBSCRIBER_UPDATE",
        entityType: "subscribers",
        entityId: id,
        requestId: clientInfo?.requestId,
        ipAddress: clientInfo?.ipAddress,
        oldValues: existing,
        newValues: updatedSubscriber,
      });

      return updatedSubscriber;
    });
  }

  /**
   * Create service account under a subscriber with immutable plan rate snapshot
   */
  public static async createServiceAccount(
    subscriberId: string,
    input: CreateServiceAccountInput,
    actorId?: string,
    clientInfo?: { ipAddress?: string; requestId?: string }
  ) {
    return await db.transaction(async (tx) => {
      const [subscriber] = await tx
        .select()
        .from(subscribers)
        .where(eq(subscribers.id, subscriberId))
        .limit(1);

      if (!subscriber) {
        throw new NotFoundError(`Subscriber '${subscriberId}' not found`);
      }

      const [plan] = await tx
        .select()
        .from(servicePlans)
        .where(eq(servicePlans.id, input.servicePlanId))
        .limit(1);

      if (!plan) {
        throw new NotFoundError(`Service plan '${input.servicePlanId}' not found`);
      }

      // Address resolution: either provided address ID or primary address
      let addressId = input.installationAddressId;
      if (!addressId) {
        const [primaryAddr] = await tx
          .select()
          .from(subscriberAddresses)
          .where(
            and(
              eq(subscriberAddresses.subscriberId, subscriberId),
              eq(subscriberAddresses.isPrimary, true)
            )
          )
          .limit(1);

        if (!primaryAddr) {
          throw new BadRequestError("Subscriber has no registered installation address");
        }
        addressId = primaryAddr.id;
      }

      if (!addressId) {
        throw new BadRequestError("Installation address is required");
      }

      const serviceAccountNumber = await getNextDocumentNumber("BCIS-SA", tx);
      const today = new Date().toISOString().slice(0, 10);

      const saValues: typeof serviceAccounts.$inferInsert = {
        subscriberId,
        serviceAccountNumber,
        serviceTypeId: plan.serviceTypeId,
        servicePlanId: plan.id,
        installationAddressId: addressId,
        activationDate: input.activationDate || today,
        billingStartDate: input.billingStartDate || input.activationDate || today,
        billingDay: input.billingDay ?? 1,
        dueDay: input.dueDay ?? 15,
        currentRate: plan.monthlyPrice,
        status: "ACTIVE",
        collectorId: input.collectorId || null,
        collectionAreaId: input.collectionAreaId || null,
        cachedBalanceDue: "0.00",
      };

      const [serviceAccount] = await tx
        .insert(serviceAccounts)
        .values(saValues)
        .returning();

      if (!serviceAccount) {
        throw new Error("Failed to create service account record");
      }

      // Record initial activation in status history
      await tx.insert(serviceAccountStatusHistory).values({
        serviceAccountId: serviceAccount.id,
        fromStatus: "NONE",
        toStatus: "ACTIVE",
        effectiveAt: new Date(),
        reason: input.reason || "Initial service activation",
        actorUserId: actorId || null,
        notes: input.notes || null,
      });

      // Audit log
      await tx.insert(auditLogs).values({
        actorUserId: actorId || null,
        action: "SERVICE_ACCOUNT_CREATE",
        entityType: "service_accounts",
        entityId: serviceAccount.id,
        requestId: clientInfo?.requestId,
        ipAddress: clientInfo?.ipAddress,
        newValues: serviceAccount,
      });

      return {
        ...serviceAccount,
        servicePlan: plan,
      };
    });
  }

  /**
   * Update service account status with immutable status history tracking
   */
  public static async updateServiceAccountStatus(
    serviceAccountId: string,
    toStatus: string,
    reason: string,
    actorId?: string,
    notes?: string,
    clientInfo?: { ipAddress?: string; requestId?: string }
  ) {
    const validStatuses = ["PENDING", "ACTIVE", "SUSPENDED", "DISCONNECTED", "TERMINATED"];
    if (!validStatuses.includes(toStatus)) {
      throw new BadRequestError(
        `Invalid status '${toStatus}'. Must be one of: ${validStatuses.join(", ")}`
      );
    }

    if (!reason?.trim()) {
      throw new BadRequestError("A reason is mandatory for any service status change");
    }

    return await db.transaction(async (tx) => {
      const [sa] = await tx
        .select()
        .from(serviceAccounts)
        .where(eq(serviceAccounts.id, serviceAccountId))
        .limit(1);

      if (!sa) {
        throw new NotFoundError(`Service account '${serviceAccountId}' not found`);
      }

      if (sa.status === toStatus) {
        return sa;
      }

      const fromStatus = sa.status;

      const [updated] = await tx
        .update(serviceAccounts)
        .set({
          status: toStatus,
          updatedAt: new Date(),
        })
        .where(eq(serviceAccounts.id, serviceAccountId))
        .returning();

      // Record status transition in history
      await tx.insert(serviceAccountStatusHistory).values({
        serviceAccountId,
        fromStatus,
        toStatus,
        effectiveAt: new Date(),
        reason: reason.trim(),
        actorUserId: actorId || null,
        notes: notes?.trim() || null,
      });

      // Audit log
      await tx.insert(auditLogs).values({
        actorUserId: actorId || null,
        action: "SERVICE_ACCOUNT_STATUS_CHANGE",
        entityType: "service_accounts",
        entityId: serviceAccountId,
        requestId: clientInfo?.requestId,
        ipAddress: clientInfo?.ipAddress,
        oldValues: { status: fromStatus },
        newValues: { status: toStatus, reason },
      });

      return updated;
    });
  }

  /**
   * List all active service plans with joined service type
   */
  public static async listServicePlans() {
    return await db
      .select({
        id: servicePlans.id,
        code: servicePlans.code,
        name: servicePlans.name,
        description: servicePlans.description,
        monthlyPrice: servicePlans.monthlyPrice,
        installationFee: servicePlans.installationFee,
        reconnectionFee: servicePlans.reconnectionFee,
        speedMbps: servicePlans.speedMbps,
        channelCount: servicePlans.channelCount,
        isActive: servicePlans.isActive,
        serviceType: {
          id: serviceTypes.id,
          code: serviceTypes.code,
          name: serviceTypes.name,
        },
      })
      .from(servicePlans)
      .innerJoin(serviceTypes, eq(servicePlans.serviceTypeId, serviceTypes.id))
      .where(eq(servicePlans.isActive, true))
      .orderBy(servicePlans.monthlyPrice);
  }

  /**
   * List all active collection areas
   */
  public static async listCollectionAreas() {
    return await db
      .select()
      .from(collectionAreas)
      .where(eq(collectionAreas.isActive, true))
      .orderBy(collectionAreas.name);
  }

  /**
   * List all active collectors
   */
  public static async listCollectors() {
    return await db
      .select()
      .from(collectors)
      .where(eq(collectors.isActive, true))
      .orderBy(collectors.name);
  }
}
