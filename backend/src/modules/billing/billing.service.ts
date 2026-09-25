import { eq, and, or, ilike, desc, asc, sql, count, inArray } from "drizzle-orm";
import { db } from "../../db/db.js";
import {
  billingCycles,
  invoices,
  invoiceItems,
  ledgerEntries,
} from "../../db/schema/billing.js";
import {
  serviceAccounts,
  subscribers,
  subscriberAddresses,
  servicePlans,
  serviceTypes,
} from "../../db/schema/subscribers.js";
import { auditLogs } from "../../db/schema/system.js";
import { getNextDocumentNumber } from "../../db/sequences.js";
import { Money } from "../../shared/money/money.js";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "../../app/errors/app-error.js";

export interface CreateBillingCycleInput {
  cycleCode: string; // e.g. "2026-10"
  periodStart: string; // "2026-10-01"
  periodEnd: string; // "2026-10-31"
  billingDate: string; // "2026-10-01"
  dueDate: string; // "2026-10-15"
}

export interface ListInvoicesParams {
  cycleCode?: string;
  serviceAccountId?: string;
  subscriberId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class BillingService {
  /**
   * List all billing cycles
   */
  public static async listBillingCycles() {
    return await db
      .select()
      .from(billingCycles)
      .orderBy(desc(billingCycles.periodStart));
  }

  /**
   * Create a new billing cycle
   */
  public static async createBillingCycle(
    input: CreateBillingCycleInput,
    actorId?: string,
    clientInfo?: { ipAddress?: string; requestId?: string }
  ) {
    const cycleCode = input.cycleCode.trim();

    const [existing] = await db
      .select()
      .from(billingCycles)
      .where(eq(billingCycles.cycleCode, cycleCode))
      .limit(1);

    if (existing) {
      throw new ConflictError(`Billing cycle '${cycleCode}' already exists`);
    }

    const [newCycle] = await db
      .insert(billingCycles)
      .values({
        cycleCode,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        billingDate: input.billingDate,
        dueDate: input.dueDate,
        status: "OPEN",
      })
      .returning();

    if (!newCycle) {
      throw new Error("Failed to create billing cycle");
    }

    await db.insert(auditLogs).values({
      actorUserId: actorId || null,
      action: "BILLING_CYCLE_CREATE",
      entityType: "billing_cycles",
      entityId: newCycle.id,
      requestId: clientInfo?.requestId,
      ipAddress: clientInfo?.ipAddress,
      newValues: newCycle,
    });

    return newCycle;
  }

  /**
   * Preview monthly billing generation for a given cycle code
   */
  public static async previewBillingGeneration(cycleCode: string) {
    const [cycle] = await db
      .select()
      .from(billingCycles)
      .where(eq(billingCycles.cycleCode, cycleCode))
      .limit(1);

    if (!cycle) {
      throw new NotFoundError(`Billing cycle '${cycleCode}' not found`);
    }

    // Active service accounts
    const activeAccounts = await db
      .select({
        serviceAccount: serviceAccounts,
        subscriber: subscribers,
        plan: servicePlans,
        serviceType: serviceTypes,
      })
      .from(serviceAccounts)
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .innerJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
      .innerJoin(serviceTypes, eq(serviceAccounts.serviceTypeId, serviceTypes.id))
      .where(eq(serviceAccounts.status, "ACTIVE"));

    // Find accounts already billed in this cycle
    const existingInvoices = await db
      .select({ serviceAccountId: invoices.serviceAccountId })
      .from(invoices)
      .where(eq(invoices.billingCycleId, cycle.id));

    const billedSet = new Set(existingInvoices.map((i) => i.serviceAccountId));

    const billable = activeAccounts.filter((a) => !billedSet.has(a.serviceAccount.id));
    const alreadyBilled = activeAccounts.filter((a) => billedSet.has(a.serviceAccount.id));

    let totalEstimated = Money.zero();
    for (const a of billable) {
      totalEstimated = totalEstimated.add(Money.fromDecimal(a.serviceAccount.currentRate));
    }

    return {
      cycle,
      totalActiveAccounts: activeAccounts.length,
      alreadyBilledCount: alreadyBilled.length,
      billableCount: billable.length,
      estimatedTotalSum: totalEstimated.toDecimalString(),
      billableAccounts: billable.map((a) => ({
        serviceAccountId: a.serviceAccount.id,
        serviceAccountNumber: a.serviceAccount.serviceAccountNumber,
        subscriberName: `${a.subscriber.lastName}, ${a.subscriber.firstName}`,
        planName: a.plan.name,
        serviceType: a.serviceType.name,
        monthlyRate: a.serviceAccount.currentRate,
      })),
    };
  }

  /**
   * Authoritative Monthly Billing Engine (Atomic, Idempotent, AT-11 Invariant)
   */
  public static async generateMonthlyBilling(
    cycleCode: string,
    actorId?: string,
    clientInfo?: { ipAddress?: string; requestId?: string }
  ) {
    return await db.transaction(async (tx) => {
      const [cycle] = await tx
        .select()
        .from(billingCycles)
        .where(eq(billingCycles.cycleCode, cycleCode))
        .limit(1);

      if (!cycle) {
        throw new NotFoundError(`Billing cycle '${cycleCode}' not found`);
      }

      if (cycle.status === "CLOSED" || cycle.status === "LOCKED") {
        throw new BadRequestError(`Cannot generate billing for a ${cycle.status.toLowerCase()} cycle`);
      }

      // Query active service accounts
      const activeAccounts = await tx
        .select({
          serviceAccount: serviceAccounts,
          subscriber: subscribers,
          plan: servicePlans,
        })
        .from(serviceAccounts)
        .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
        .innerJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
        .where(eq(serviceAccounts.status, "ACTIVE"));

      // Query existing invoices for this cycle
      const existingInvoices = await tx
        .select({
          serviceAccountId: invoices.serviceAccountId,
          invoiceNumber: invoices.invoiceNumber,
        })
        .from(invoices)
        .where(eq(invoices.billingCycleId, cycle.id));

      const billedMap = new Map(existingInvoices.map((i) => [i.serviceAccountId, i.invoiceNumber]));

      const toBill = activeAccounts.filter((a) => !billedMap.has(a.serviceAccount.id));

      // AT-11 Invariant: If all accounts are already billed, return idempotent success summary
      if (toBill.length === 0) {
        return {
          cycleCode,
          status: "ALREADY_GENERATED",
          message: "All active service accounts have already been invoiced for this billing cycle.",
          generatedCount: 0,
          skippedCount: activeAccounts.length,
          totalAmount: "0.00",
          invoices: [],
        };
      }

      let totalGeneratedSum = Money.zero();
      const createdInvoices = [];

      for (const item of toBill) {
        const sa = item.serviceAccount;
        const plan = item.plan;

        const invoiceNumber = await getNextDocumentNumber("BCIS-INV", tx);
        const rateMoney = Money.fromDecimal(sa.currentRate);

        // 1. Insert Canonical Invoice
        const [newInvoice] = await tx
          .insert(invoices)
          .values({
            invoiceNumber,
            serviceAccountId: sa.id,
            billingCycleId: cycle.id,
            invoiceDate: cycle.billingDate,
            dueDate: cycle.dueDate,
            status: "UNPAID",
            subtotal: rateMoney.toDecimalString(),
            discountTotal: "0.00",
            penaltyTotal: "0.00",
            adjustmentTotal: "0.00",
            totalAmount: rateMoney.toDecimalString(),
            amountPaidCache: "0.00",
            balanceDueCache: rateMoney.toDecimalString(),
            finalizedAt: new Date(),
            createdBy: actorId || null,
          })
          .returning();

        if (!newInvoice) {
          throw new Error(`Failed to generate invoice for service account ${sa.serviceAccountNumber}`);
        }

        // 2. Insert Invoice Item (Rate Snapshot)
        await tx.insert(invoiceItems).values({
          invoiceId: newInvoice.id,
          lineType: "SUBSCRIPTION",
          description: `${plan.name} Monthly Subscription (${cycleCode})`,
          quantity: 1,
          unitPrice: rateMoney.toDecimalString(),
          lineTotal: rateMoney.toDecimalString(),
          sourceReference: sa.serviceAccountNumber,
        });

        // 3. Post Immutable Ledger Debit Entry
        const [maxEntry] = await tx
          .select({
            maxNo: sql<number>`COALESCE(MAX(${ledgerEntries.entryNo}), 0)`,
          })
          .from(ledgerEntries)
          .where(eq(ledgerEntries.serviceAccountId, sa.id));

        const nextEntryNo = Number(maxEntry?.maxNo || 0) + 1;

        await tx.insert(ledgerEntries).values({
          serviceAccountId: sa.id,
          entryNo: nextEntryNo,
          postedAt: new Date(),
          entryDate: cycle.billingDate,
          referenceType: "INVOICE",
          referenceId: newInvoice.id,
          description: `Monthly Billing ${cycleCode} — Invoice #${newInvoice.invoiceNumber}`,
          debitAmount: rateMoney.toDecimalString(),
          creditAmount: "0.00",
          currency: "PHP",
          createdBy: actorId || null,
        });

        // 4. Update Cached Balance Due on Service Account
        const currentCached = Money.fromDecimal(sa.cachedBalanceDue);
        const updatedBalance = currentCached.add(rateMoney);

        await tx
          .update(serviceAccounts)
          .set({
            cachedBalanceDue: updatedBalance.toDecimalString(),
            lastBilledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(serviceAccounts.id, sa.id));

        totalGeneratedSum = totalGeneratedSum.add(rateMoney);
        createdInvoices.push(newInvoice);
      }

      // 5. Update Billing Cycle Status to GENERATED
      await tx
        .update(billingCycles)
        .set({ status: "GENERATED" })
        .where(eq(billingCycles.id, cycle.id));

      // 6. Audit Trail Entry
      await tx.insert(auditLogs).values({
        actorUserId: actorId || null,
        action: "BILLING_GENERATE",
        entityType: "billing_cycles",
        entityId: cycle.id,
        requestId: clientInfo?.requestId,
        ipAddress: clientInfo?.ipAddress,
        newValues: {
          cycleCode,
          generatedCount: createdInvoices.length,
          skippedCount: billedMap.size,
          totalAmount: totalGeneratedSum.toDecimalString(),
        },
      });

      return {
        cycleCode,
        status: "GENERATED",
        message: `Successfully generated ${createdInvoices.length} invoices for cycle ${cycleCode}`,
        generatedCount: createdInvoices.length,
        skippedCount: billedMap.size,
        totalAmount: totalGeneratedSum.toDecimalString(),
        invoices: createdInvoices,
      };
    });
  }

  /**
   * List invoices with filtering and pagination
   */
  public static async listInvoices(params: ListInvoicesParams) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (params.status) {
      conditions.push(eq(invoices.status, params.status));
    }

    if (params.serviceAccountId) {
      conditions.push(eq(invoices.serviceAccountId, params.serviceAccountId));
    }

    if (params.cycleCode) {
      const [c] = await db
        .select()
        .from(billingCycles)
        .where(eq(billingCycles.cycleCode, params.cycleCode))
        .limit(1);
      if (c) {
        conditions.push(eq(invoices.billingCycleId, c.id));
      }
    }

    if (params.search) {
      const q = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(invoices.invoiceNumber, q),
          ilike(subscribers.firstName, q),
          ilike(subscribers.lastName, q),
          ilike(subscribers.businessName, q),
          ilike(serviceAccounts.serviceAccountNumber, q)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count
    const [countRes] = await db
      .select({ total: count() })
      .from(invoices)
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .where(whereClause);

    const total = Number(countRes?.total || 0);

    // Rows
    const rows = await db
      .select({
        invoice: invoices,
        billingCycle: billingCycles,
        serviceAccount: {
          id: serviceAccounts.id,
          serviceAccountNumber: serviceAccounts.serviceAccountNumber,
          currentRate: serviceAccounts.currentRate,
        },
        subscriber: {
          id: subscribers.id,
          accountNumber: subscribers.accountNumber,
          firstName: subscribers.firstName,
          lastName: subscribers.lastName,
          businessName: subscribers.businessName,
          primaryContactNumber: subscribers.primaryContactNumber,
        },
        plan: {
          id: servicePlans.id,
          name: servicePlans.name,
          code: servicePlans.code,
        },
      })
      .from(invoices)
      .innerJoin(billingCycles, eq(invoices.billingCycleId, billingCycles.id))
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .innerJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
      .where(whereClause)
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);

    const data = rows.map((r) => ({
      ...r.invoice,
      billingCycle: r.billingCycle,
      serviceAccount: r.serviceAccount,
      subscriber: r.subscriber,
      servicePlan: r.plan,
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
   * Get single invoice with itemized breakdown
   */
  public static async getInvoiceById(idOrNumber: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrNumber
    );

    const [row] = await db
      .select({
        invoice: invoices,
        billingCycle: billingCycles,
        serviceAccount: serviceAccounts,
        plan: servicePlans,
        subscriber: subscribers,
      })
      .from(invoices)
      .innerJoin(billingCycles, eq(invoices.billingCycleId, billingCycles.id))
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .where(isUuid ? eq(invoices.id, idOrNumber) : eq(invoices.invoiceNumber, idOrNumber))
      .limit(1);

    if (!row) {
      throw new NotFoundError(`Invoice '${idOrNumber}' not found`);
    }

    // Line items
    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, row.invoice.id))
      .orderBy(asc(invoiceItems.createdAt));

    // Primary address
    const [primaryAddress] = await db
      .select()
      .from(subscriberAddresses)
      .where(
        and(
          eq(subscriberAddresses.subscriberId, row.subscriber.id),
          eq(subscriberAddresses.isPrimary, true)
        )
      )
      .limit(1);

    return {
      ...row.invoice,
      billingCycle: row.billingCycle,
      serviceAccount: {
        ...row.serviceAccount,
        servicePlan: row.plan,
      },
      subscriber: {
        ...row.subscriber,
        primaryAddress: primaryAddress || null,
      },
      items,
    };
  }

  /**
   * Get complete subscriber ledger with mathematical running balance
   */
  public static async getSubscriberLedger(subscriberIdOrAccountNumber: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      subscriberIdOrAccountNumber
    );

    const [subscriber] = await db
      .select()
      .from(subscribers)
      .where(
        isUuid
          ? eq(subscribers.id, subscriberIdOrAccountNumber)
          : eq(subscribers.accountNumber, subscriberIdOrAccountNumber)
      )
      .limit(1);

    if (!subscriber) {
      throw new NotFoundError(`Subscriber '${subscriberIdOrAccountNumber}' not found`);
    }

    // Fetch service accounts
    const saList = await db
      .select()
      .from(serviceAccounts)
      .where(eq(serviceAccounts.subscriberId, subscriber.id));

    const saIds = saList.map((s) => s.id);

    if (saIds.length === 0) {
      return {
        subscriber,
        serviceAccounts: [],
        entries: [],
        currentTotalBalance: "0.00",
      };
    }

    // Fetch all ledger entries across service accounts
    const rawEntries = await db
      .select({
        entry: ledgerEntries,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
      })
      .from(ledgerEntries)
      .innerJoin(serviceAccounts, eq(ledgerEntries.serviceAccountId, serviceAccounts.id))
      .where(inArray(ledgerEntries.serviceAccountId, saIds))
      .orderBy(asc(ledgerEntries.postedAt), asc(ledgerEntries.entryNo));

    // Calculate exact running balance with Money object
    let runningBalance = Money.zero();
    const entriesWithBalance = rawEntries.map((r) => {
      const debit = Money.fromDecimal(r.entry.debitAmount);
      const credit = Money.fromDecimal(r.entry.creditAmount);

      runningBalance = runningBalance.add(debit).subtract(credit);

      return {
        ...r.entry,
        serviceAccountNumber: r.serviceAccountNumber,
        runningBalance: runningBalance.toDecimalString(),
      };
    });

    return {
      subscriber,
      serviceAccounts: saList,
      entries: entriesWithBalance,
      currentTotalBalance: runningBalance.toDecimalString(),
    };
  }
}
