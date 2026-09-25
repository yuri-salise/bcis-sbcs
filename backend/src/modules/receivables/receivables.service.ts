import { eq, and, sql, desc, asc, inArray, lte } from "drizzle-orm";
import { db } from "../../db/db.js";
import {
  invoices,
} from "../../db/schema/billing.js";
import {
  serviceAccounts,
  subscribers,
  servicePlans,
  collectionAreas,
  collectors,
  serviceAccountStatusHistory,
} from "../../db/schema/subscribers.js";
import {
  suspensionRecords,
  reconnectionRecords,
} from "../../db/schema/service_control.js";
import { applicationSettings, auditLogs } from "../../db/schema/system.js";
import { users } from "../../db/schema/auth.js";
import { getNextDocumentNumber } from "../../db/sequences.js";
import { Money } from "../../shared/money/money.js";

export interface OutstandingReceivableItem {
  invoiceId: string;
  invoiceNumber: string;
  serviceAccountId: string;
  serviceAccountNumber: string;
  subscriberId: string;
  subscriberAccountNumber: string;
  subscriberDisplayName: string;
  subscriberMobile: string | null;
  servicePlanName: string;
  collectionAreaName: string | null;
  collectorName: string | null;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  status: string;
  daysPastDue: number;
  isOverdue: boolean;
}

export interface AgingBucketSummary {
  amount: string;
  count: number;
  percentage: number;
}

export interface AgingReportSummary {
  asOfDate: string;
  totalReceivable: string;
  current: AgingBucketSummary;
  days1to30: AgingBucketSummary;
  days31to60: AgingBucketSummary;
  days61to90: AgingBucketSummary;
  days90Plus: AgingBucketSummary;
}

export interface SubscriberAgingRow {
  subscriberId: string;
  subscriberAccountNumber: string;
  displayName: string;
  mobileNumber: string | null;
  activeAccountsCount: number;
  currentAmount: string;
  days1to30Amount: string;
  days31to60Amount: string;
  days61to90Amount: string;
  days90PlusAmount: string;
  totalDue: string;
  oldestDueDate: string | null;
  maxDaysOverdue: number;
  hasSuspendedService: boolean;
}

export interface SuspensionCandidate {
  serviceAccountId: string;
  serviceAccountNumber: string;
  subscriberId: string;
  subscriberAccountNumber: string;
  subscriberDisplayName: string;
  subscriberMobile: string | null;
  servicePlanName: string;
  collectionAreaName: string | null;
  collectorName: string | null;
  accountStatus: string;
  totalBalanceDue: string;
  overdueBalance: string;
  overdueInvoicesCount: number;
  oldestDueDate: string;
  daysOverdue: number;
  candidateReasons: string[];
}

export interface ServiceHistoryEvent {
  id: string;
  eventType: "STATUS_CHANGE" | "SUSPENSION" | "RECONNECTION";
  occurredAt: string;
  title: string;
  description: string;
  actorName: string | null;
  metadata?: Record<string, unknown>;
}

function computeSubscriberDisplayName(sub: {
  firstName: string;
  lastName: string;
  businessName: string | null;
}): string {
  if (sub.businessName && sub.businessName.trim().length > 0) {
    return `${sub.businessName.trim()} (${sub.firstName} ${sub.lastName})`;
  }
  return `${sub.firstName} ${sub.lastName}`;
}

export class ReceivablesService {
  /**
   * Helper: Retrieve system setting with fallback
   */
  private static async getSetting(key: string, defaultValue: string): Promise<string> {
    const [row] = await db
      .select()
      .from(applicationSettings)
      .where(eq(applicationSettings.key, key))
      .limit(1);
    return row ? row.value : defaultValue;
  }

  /**
   * 1. Get Outstanding Receivables
   * Derived strictly from invoices with balance_due_cache > 0 and status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')
   */
  static async getOutstandingReceivables(params: {
    search?: string;
    subscriberId?: string;
    serviceAccountId?: string;
    collectionAreaId?: string;
    collectorId?: string;
    status?: string;
    asOfDate?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;
    const asOfDateStr = params.asOfDate || new Date().toISOString().slice(0, 10);
    const asOfDateObj = new Date(asOfDateStr);

    const conditions = [
      sql`${invoices.balanceDueCache} > 0`,
      inArray(invoices.status, ["UNPAID", "PARTIALLY_PAID", "OVERDUE"]),
    ];

    if (params.subscriberId) {
      conditions.push(eq(serviceAccounts.subscriberId, params.subscriberId));
    }
    if (params.serviceAccountId) {
      conditions.push(eq(invoices.serviceAccountId, params.serviceAccountId));
    }
    if (params.collectionAreaId) {
      conditions.push(eq(serviceAccounts.collectionAreaId, params.collectionAreaId));
    }
    if (params.collectorId) {
      conditions.push(eq(serviceAccounts.collectorId, params.collectorId));
    }
    if (params.status && params.status !== "ALL") {
      conditions.push(eq(invoices.status, params.status));
    }
    if (params.search) {
      const term = `%${params.search}%`;
      conditions.push(
        sql`(${invoices.invoiceNumber} ILIKE ${term} OR ${subscribers.accountNumber} ILIKE ${term} OR ${subscribers.firstName} ILIKE ${term} OR ${subscribers.lastName} ILIKE ${term} OR ${subscribers.businessName} ILIKE ${term} OR ${serviceAccounts.serviceAccountNumber} ILIKE ${term})`
      );
    }

    const whereClause = and(...conditions);

    // Get total count and aggregate balance
    const [countAndSum] = await db
      .select({
        totalCount: sql<number>`count(*)::int`,
        totalBalance: sql<string>`coalesce(sum(${invoices.balanceDueCache}), '0.00')`,
      })
      .from(invoices)
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .where(whereClause);

    const total = countAndSum?.totalCount || 0;
    const totalBalance = countAndSum?.totalBalance || "0.00";

    // Fetch paginated rows
    const rows = await db
      .select({
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        serviceAccountId: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        subscriberId: subscribers.id,
        subscriberAccountNumber: subscribers.accountNumber,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        subscriberMobile: subscribers.primaryContactNumber,
        servicePlanName: servicePlans.name,
        collectionAreaName: collectionAreas.name,
        collectorName: collectors.name,
        invoiceDate: invoices.invoiceDate,
        dueDate: invoices.dueDate,
        totalAmount: invoices.totalAmount,
        amountPaid: invoices.amountPaidCache,
        balanceDue: invoices.balanceDueCache,
        status: invoices.status,
      })
      .from(invoices)
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .innerJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
      .leftJoin(collectionAreas, eq(serviceAccounts.collectionAreaId, collectionAreas.id))
      .leftJoin(collectors, eq(serviceAccounts.collectorId, collectors.id))
      .where(whereClause)
      .orderBy(asc(invoices.dueDate), desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);

    const data: OutstandingReceivableItem[] = rows.map((r) => {
      const dueObj = new Date(r.dueDate);
      const diffMs = asOfDateObj.getTime() - dueObj.getTime();
      const daysPastDue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

      const displayName = computeSubscriberDisplayName({
        firstName: r.subscriberFirstName,
        lastName: r.subscriberLastName,
        businessName: r.subscriberBusinessName,
      });

      return {
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        serviceAccountId: r.serviceAccountId,
        serviceAccountNumber: r.serviceAccountNumber,
        subscriberId: r.subscriberId,
        subscriberAccountNumber: r.subscriberAccountNumber,
        subscriberDisplayName: displayName,
        subscriberMobile: r.subscriberMobile,
        servicePlanName: r.servicePlanName,
        collectionAreaName: r.collectionAreaName,
        collectorName: r.collectorName,
        invoiceDate: r.invoiceDate,
        dueDate: r.dueDate,
        totalAmount: r.totalAmount,
        amountPaid: r.amountPaid,
        balanceDue: r.balanceDue,
        status: r.status,
        daysPastDue,
        isOverdue: daysPastDue > 0,
      };
    });

    return {
      data,
      totalOutstanding: Money.fromDecimal(totalBalance).format(),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 2. Get Overdue Receivables
   * Evaluates past-due invoices, factoring in configurable grace period.
   */
  static async getOverdueReceivables(params: {
    search?: string;
    collectionAreaId?: string;
    collectorId?: string;
    asOfDate?: string;
    includeGracePeriod?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;
    const asOfDateStr = params.asOfDate || new Date().toISOString().slice(0, 10);
    const asOfDateObj = new Date(asOfDateStr);

    const graceDaysStr = await this.getSetting("grace_period_days", "5");
    const graceDays = parseInt(graceDaysStr, 10) || 5;
    const applyGrace = params.includeGracePeriod !== false;

    // Overdue cutoff
    const cutoffDate = new Date(asOfDateObj);
    if (applyGrace) {
      cutoffDate.setDate(cutoffDate.getDate() - graceDays);
    }
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const conditions = [
      sql`${invoices.balanceDueCache} > 0`,
      inArray(invoices.status, ["UNPAID", "PARTIALLY_PAID", "OVERDUE"]),
      lte(invoices.dueDate, cutoffStr),
    ];

    if (params.collectionAreaId) {
      conditions.push(eq(serviceAccounts.collectionAreaId, params.collectionAreaId));
    }
    if (params.collectorId) {
      conditions.push(eq(serviceAccounts.collectorId, params.collectorId));
    }
    if (params.search) {
      const term = `%${params.search}%`;
      conditions.push(
        sql`(${invoices.invoiceNumber} ILIKE ${term} OR ${subscribers.accountNumber} ILIKE ${term} OR ${subscribers.firstName} ILIKE ${term} OR ${subscribers.lastName} ILIKE ${term} OR ${subscribers.businessName} ILIKE ${term} OR ${serviceAccounts.serviceAccountNumber} ILIKE ${term})`
      );
    }

    const whereClause = and(...conditions);

    const [countAndSum] = await db
      .select({
        totalCount: sql<number>`count(*)::int`,
        totalBalance: sql<string>`coalesce(sum(${invoices.balanceDueCache}), '0.00')`,
      })
      .from(invoices)
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .where(whereClause);

    const total = countAndSum?.totalCount || 0;
    const totalBalance = countAndSum?.totalBalance || "0.00";

    const rows = await db
      .select({
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        serviceAccountId: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        subscriberId: subscribers.id,
        subscriberAccountNumber: subscribers.accountNumber,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        subscriberMobile: subscribers.primaryContactNumber,
        servicePlanName: servicePlans.name,
        collectionAreaName: collectionAreas.name,
        collectorName: collectors.name,
        invoiceDate: invoices.invoiceDate,
        dueDate: invoices.dueDate,
        totalAmount: invoices.totalAmount,
        amountPaid: invoices.amountPaidCache,
        balanceDue: invoices.balanceDueCache,
        status: invoices.status,
      })
      .from(invoices)
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .innerJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
      .leftJoin(collectionAreas, eq(serviceAccounts.collectionAreaId, collectionAreas.id))
      .leftJoin(collectors, eq(serviceAccounts.collectorId, collectors.id))
      .where(whereClause)
      .orderBy(asc(invoices.dueDate))
      .limit(limit)
      .offset(offset);

    const data = rows.map((r) => {
      const dueObj = new Date(r.dueDate);
      const diffMs = asOfDateObj.getTime() - dueObj.getTime();
      const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

      let delinquencySeverity = "GRACE_PERIOD";
      if (daysOverdue > graceDays && daysOverdue <= 30) {
        delinquencySeverity = "DELINQUENT_1_30";
      } else if (daysOverdue > 30 && daysOverdue <= 60) {
        delinquencySeverity = "DELINQUENT_31_60";
      } else if (daysOverdue > 60) {
        delinquencySeverity = "SEVERE_DELINQUENT";
      }

      const displayName = computeSubscriberDisplayName({
        firstName: r.subscriberFirstName,
        lastName: r.subscriberLastName,
        businessName: r.subscriberBusinessName,
      });

      return {
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        serviceAccountId: r.serviceAccountId,
        serviceAccountNumber: r.serviceAccountNumber,
        subscriberId: r.subscriberId,
        subscriberAccountNumber: r.subscriberAccountNumber,
        subscriberDisplayName: displayName,
        subscriberMobile: r.subscriberMobile,
        servicePlanName: r.servicePlanName,
        collectionAreaName: r.collectionAreaName,
        collectorName: r.collectorName,
        invoiceDate: r.invoiceDate,
        dueDate: r.dueDate,
        totalAmount: r.totalAmount,
        amountPaid: r.amountPaid,
        balanceDue: r.balanceDue,
        status: r.status,
        daysOverdue,
        graceDaysConfigured: graceDays,
        delinquencySeverity,
      };
    });

    return {
      data,
      totalOverdue: Money.fromDecimal(totalBalance).format(),
      gracePeriodDays: graceDays,
      asOfDate: asOfDateStr,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 3. Accounts Receivable Aging Report (PRODUCT.md Section 8.9)
   * 5 standard buckets: Current, 1-30, 31-60, 61-90, 90+ days.
   * Derived strictly from invoice balances relative to asOfDate.
   */
  static async getAgingReport(params: {
    asOfDate?: string;
    collectionAreaId?: string;
    collectorId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const asOfDateStr = params.asOfDate || new Date().toISOString().slice(0, 10);
    const asOfDateObj = new Date(asOfDateStr);
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const baseConditions = [
      sql`${invoices.balanceDueCache} > 0`,
      inArray(invoices.status, ["UNPAID", "PARTIALLY_PAID", "OVERDUE"]),
    ];

    if (params.collectionAreaId) {
      baseConditions.push(eq(serviceAccounts.collectionAreaId, params.collectionAreaId));
    }
    if (params.collectorId) {
      baseConditions.push(eq(serviceAccounts.collectorId, params.collectorId));
    }

    const whereClause = and(...baseConditions);

    // 1. Fetch all matching invoices to compute high-precision 5-bucket totals
    const allInvoices = await db
      .select({
        id: invoices.id,
        balanceDue: invoices.balanceDueCache,
        dueDate: invoices.dueDate,
        subscriberId: serviceAccounts.subscriberId,
        subscriberAccountNumber: subscribers.accountNumber,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        subscriberMobile: subscribers.primaryContactNumber,
        serviceAccountStatus: serviceAccounts.status,
      })
      .from(invoices)
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .where(whereClause);

    let totalRec = Money.zero();
    let curAmount = Money.zero();
    let d1to30Amount = Money.zero();
    let d31to60Amount = Money.zero();
    let d61to90Amount = Money.zero();
    let d90PlusAmount = Money.zero();

    let curCount = 0;
    let d1to30Count = 0;
    let d31to60Count = 0;
    let d61to90Count = 0;
    let d90PlusCount = 0;

    // Per-subscriber buckets map
    interface SubBucketAgg {
      subscriberId: string;
      accountNumber: string;
      displayName: string;
      mobile: string | null;
      cur: Money;
      d1to30: Money;
      d31to60: Money;
      d61to90: Money;
      d90Plus: Money;
      total: Money;
      oldestDue: string | null;
      maxDays: number;
      hasSuspended: boolean;
    }

    const subMap = new Map<string, SubBucketAgg>();

    for (const inv of allInvoices) {
      const bal = Money.fromDecimal(inv.balanceDue);
      totalRec = totalRec.add(bal);

      const dueObj = new Date(inv.dueDate);
      const diffMs = asOfDateObj.getTime() - dueObj.getTime();
      const daysPastDue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let existing = subMap.get(inv.subscriberId);
      if (!existing) {
        const displayName = computeSubscriberDisplayName({
          firstName: inv.subscriberFirstName,
          lastName: inv.subscriberLastName,
          businessName: inv.subscriberBusinessName,
        });

        existing = {
          subscriberId: inv.subscriberId,
          accountNumber: inv.subscriberAccountNumber,
          displayName,
          mobile: inv.subscriberMobile,
          cur: Money.zero(),
          d1to30: Money.zero(),
          d31to60: Money.zero(),
          d61to90: Money.zero(),
          d90Plus: Money.zero(),
          total: Money.zero(),
          oldestDue: inv.dueDate,
          maxDays: Math.max(0, daysPastDue),
          hasSuspended: inv.serviceAccountStatus === "SUSPENDED",
        };
        subMap.set(inv.subscriberId, existing);
      } else {
        if (inv.serviceAccountStatus === "SUSPENDED") {
          existing.hasSuspended = true;
        }
        if (!existing.oldestDue || inv.dueDate < existing.oldestDue) {
          existing.oldestDue = inv.dueDate;
        }
        if (daysPastDue > existing.maxDays) {
          existing.maxDays = daysPastDue;
        }
      }

      existing.total = existing.total.add(bal);

      if (daysPastDue <= 0) {
        curAmount = curAmount.add(bal);
        curCount++;
        existing.cur = existing.cur.add(bal);
      } else if (daysPastDue <= 30) {
        d1to30Amount = d1to30Amount.add(bal);
        d1to30Count++;
        existing.d1to30 = existing.d1to30.add(bal);
      } else if (daysPastDue <= 60) {
        d31to60Amount = d31to60Amount.add(bal);
        d31to60Count++;
        existing.d31to60 = existing.d31to60.add(bal);
      } else if (daysPastDue <= 90) {
        d61to90Amount = d61to90Amount.add(bal);
        d61to90Count++;
        existing.d61to90 = existing.d61to90.add(bal);
      } else {
        d90PlusAmount = d90PlusAmount.add(bal);
        d90PlusCount++;
        existing.d90Plus = existing.d90Plus.add(bal);
      }
    }

    const totalCentsNum = totalRec.toCentavosNumber();
    const calcPct = (m: Money) =>
      totalCentsNum > 0 ? Math.round((m.toCentavosNumber() / totalCentsNum) * 10000) / 100 : 0;

    const summary: AgingReportSummary = {
      asOfDate: asOfDateStr,
      totalReceivable: totalRec.format(),
      current: {
        amount: curAmount.format(),
        count: curCount,
        percentage: calcPct(curAmount),
      },
      days1to30: {
        amount: d1to30Amount.format(),
        count: d1to30Count,
        percentage: calcPct(d1to30Amount),
      },
      days31to60: {
        amount: d31to60Amount.format(),
        count: d31to60Count,
        percentage: calcPct(d31to60Amount),
      },
      days61to90: {
        amount: d61to90Amount.format(),
        count: d61to90Count,
        percentage: calcPct(d61to90Amount),
      },
      days90Plus: {
        amount: d90PlusAmount.format(),
        count: d90PlusCount,
        percentage: calcPct(d90PlusAmount),
      },
    };

    // Filter subscribers by search query if provided
    let subList = Array.from(subMap.values());
    if (params.search) {
      const st = params.search.toLowerCase();
      subList = subList.filter(
        (s) =>
          s.displayName.toLowerCase().includes(st) ||
          s.accountNumber.toLowerCase().includes(st) ||
          (s.mobile && s.mobile.toLowerCase().includes(st))
      );
    }

    // Sort by largest total overdue balance descending
    subList.sort((a, b) => b.total.toCentavosNumber() - a.total.toCentavosNumber());

    const totalSubscribers = subList.length;
    const paginatedSubs = subList.slice(offset, offset + limit);

    const subscribersData: SubscriberAgingRow[] = paginatedSubs.map((s) => ({
      subscriberId: s.subscriberId,
      subscriberAccountNumber: s.accountNumber,
      displayName: s.displayName,
      mobileNumber: s.mobile,
      activeAccountsCount: 1,
      currentAmount: s.cur.format(),
      days1to30Amount: s.d1to30.format(),
      days31to60Amount: s.d31to60.format(),
      days61to90Amount: s.d61to90.format(),
      days90PlusAmount: s.d90Plus.format(),
      totalDue: s.total.format(),
      oldestDueDate: s.oldestDue,
      maxDaysOverdue: s.maxDays,
      hasSuspendedService: s.hasSuspended,
    }));

    return {
      summary,
      subscribers: subscribersData,
      pagination: {
        page,
        limit,
        total: totalSubscribers,
        totalPages: Math.ceil(totalSubscribers / limit) || 1,
      },
    };
  }

  /**
   * 4. Suspension Candidates Screener
   * Identifies ACTIVE accounts exceeding policy thresholds (grace period, overdue amount, or overdue days).
   */
  static async getSuspensionCandidates(params: {
    collectionAreaId?: string;
    collectorId?: string;
    search?: string;
    asOfDate?: string;
    page?: number;
    limit?: number;
  }) {
    const asOfDateStr = params.asOfDate || new Date().toISOString().slice(0, 10);
    const asOfDateObj = new Date(asOfDateStr);
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const graceDays = parseInt(await this.getSetting("grace_period_days", "5"), 10) || 5;
    const thresholdAmount = parseFloat(await this.getSetting("suspension_threshold_amount", "1500.00")) || 1500.0;
    const thresholdDays = parseInt(await this.getSetting("suspension_threshold_overdue_days", "30"), 10) || 30;

    // Cutoff for grace period
    const graceCutoff = new Date(asOfDateObj);
    graceCutoff.setDate(graceCutoff.getDate() - graceDays);
    const graceCutoffStr = graceCutoff.toISOString().slice(0, 10);

    // Find all ACTIVE service accounts
    const activeAccounts = await db
      .select({
        serviceAccountId: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        accountStatus: serviceAccounts.status,
        subscriberId: subscribers.id,
        subscriberAccountNumber: subscribers.accountNumber,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        subscriberMobile: subscribers.primaryContactNumber,
        servicePlanName: servicePlans.name,
        collectionAreaId: serviceAccounts.collectionAreaId,
        collectionAreaName: collectionAreas.name,
        collectorId: serviceAccounts.collectorId,
        collectorName: collectors.name,
      })
      .from(serviceAccounts)
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .innerJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
      .leftJoin(collectionAreas, eq(serviceAccounts.collectionAreaId, collectionAreas.id))
      .leftJoin(collectors, eq(serviceAccounts.collectorId, collectors.id))
      .where(eq(serviceAccounts.status, "ACTIVE"));

    // Find unpaid invoices for these accounts
    const openInvoices = await db
      .select({
        id: invoices.id,
        serviceAccountId: invoices.serviceAccountId,
        balanceDue: invoices.balanceDueCache,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .where(
        and(
          sql`${invoices.balanceDueCache} > 0`,
          inArray(invoices.status, ["UNPAID", "PARTIALLY_PAID", "OVERDUE"])
        )
      );

    // Group invoices by service account
    const saInvoiceMap = new Map<string, typeof openInvoices>();
    for (const inv of openInvoices) {
      const list = saInvoiceMap.get(inv.serviceAccountId) || [];
      list.push(inv);
      saInvoiceMap.set(inv.serviceAccountId, list);
    }

    const candidates: SuspensionCandidate[] = [];

    for (const sa of activeAccounts) {
      if (params.collectionAreaId && sa.collectionAreaId !== params.collectionAreaId) continue;
      if (params.collectorId && sa.collectorId !== params.collectorId) continue;

      const displayName = computeSubscriberDisplayName({
        firstName: sa.subscriberFirstName,
        lastName: sa.subscriberLastName,
        businessName: sa.subscriberBusinessName,
      });

      if (params.search) {
        const q = params.search.toLowerCase();
        if (
          !sa.serviceAccountNumber.toLowerCase().includes(q) &&
          !displayName.toLowerCase().includes(q) &&
          !sa.subscriberAccountNumber.toLowerCase().includes(q)
        ) {
          continue;
        }
      }

      const invList = saInvoiceMap.get(sa.serviceAccountId) || [];
      if (invList.length === 0) continue;

      let totalBalance = Money.zero();
      let overdueBalance = Money.zero();
      let overdueCount = 0;
      let oldestDue: string | null = null;
      let maxDaysOverdue = 0;

      for (const inv of invList) {
        const bal = Money.fromDecimal(inv.balanceDue);
        totalBalance = totalBalance.add(bal);

        const dueObj = new Date(inv.dueDate);
        const diffMs = asOfDateObj.getTime() - dueObj.getTime();
        const daysPastDue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (inv.dueDate <= graceCutoffStr) {
          overdueBalance = overdueBalance.add(bal);
          overdueCount++;
          if (!oldestDue || inv.dueDate < oldestDue) {
            oldestDue = inv.dueDate;
          }
          if (daysPastDue > maxDaysOverdue) {
            maxDaysOverdue = daysPastDue;
          }
        }
      }

      const overdueAmountFloat = overdueBalance.toCentavosNumber() / 100;
      const reasons: string[] = [];

      if (overdueAmountFloat >= thresholdAmount) {
        reasons.push(
          `Overdue balance of ${overdueBalance.format()} exceeds threshold (₱${thresholdAmount.toFixed(2)})`
        );
      }
      if (maxDaysOverdue >= thresholdDays) {
        reasons.push(
          `Delinquent for ${maxDaysOverdue} days (threshold: ${thresholdDays} days)`
        );
      }
      if (overdueCount >= 2) {
        reasons.push(`${overdueCount} consecutive billing cycles remain unpaid`);
      }

      if (reasons.length > 0) {
        candidates.push({
          serviceAccountId: sa.serviceAccountId,
          serviceAccountNumber: sa.serviceAccountNumber,
          subscriberId: sa.subscriberId,
          subscriberAccountNumber: sa.subscriberAccountNumber,
          subscriberDisplayName: displayName,
          subscriberMobile: sa.subscriberMobile,
          servicePlanName: sa.servicePlanName,
          collectionAreaName: sa.collectionAreaName,
          collectorName: sa.collectorName,
          accountStatus: sa.accountStatus,
          totalBalanceDue: totalBalance.format(),
          overdueBalance: overdueBalance.format(),
          overdueInvoicesCount: overdueCount,
          oldestDueDate: oldestDue || "",
          daysOverdue: maxDaysOverdue,
          candidateReasons: reasons,
        });
      }
    }

    // Sort by highest overdue balance
    candidates.sort(
      (a, b) =>
        parseFloat(b.overdueBalance.replace(/,/g, "")) -
        parseFloat(a.overdueBalance.replace(/,/g, ""))
    );

    const total = candidates.length;
    const paginated = candidates.slice(offset, offset + limit);

    return {
      data: paginated,
      thresholds: {
        gracePeriodDays: graceDays,
        suspensionThresholdAmount: thresholdAmount.toFixed(2),
        suspensionThresholdOverdueDays: thresholdDays,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 5. Suspend Service Account
   * Transitions ACTIVE account to SUSPENDED, writes suspension_records, writes status history, and audit log.
   */
  static async suspendServiceAccount(
    serviceAccountId: string,
    payload: {
      reason: string;
      notes?: string;
      effectiveDate?: string;
    },
    actorUserId: string
  ) {
    if (!payload.reason || payload.reason.trim().length < 5) {
      throw new Error("A valid suspension reason (minimum 5 characters) is required.");
    }

    const [sa] = await db
      .select()
      .from(serviceAccounts)
      .where(eq(serviceAccounts.id, serviceAccountId))
      .limit(1);

    if (!sa) {
      throw new Error("Service account not found.");
    }

    if (sa.status === "SUSPENDED") {
      throw new Error("Service account is already suspended.");
    }
    if (sa.status === "TERMINATED" || sa.status === "DISCONNECTED") {
      throw new Error(`Cannot suspend account with status ${sa.status}.`);
    }

    const effectiveDateStr = payload.effectiveDate || new Date().toISOString().slice(0, 10);

    const result = await db.transaction(async (tx) => {
      // 1. Insert suspension record
      const [suspension] = await tx
        .insert(suspensionRecords)
        .values({
          serviceAccountId,
          reason: payload.reason.trim(),
          effectiveDate: effectiveDateStr,
          approvedBy: actorUserId,
          notes: payload.notes?.trim() || null,
          completedAt: new Date(),
        })
        .returning();

      if (!suspension) {
        throw new Error("Failed to insert suspension record.");
      }

      // 2. Insert status history transition
      await tx.insert(serviceAccountStatusHistory).values({
        serviceAccountId,
        fromStatus: sa.status,
        toStatus: "SUSPENDED",
        reason: payload.reason.trim(),
        actorUserId,
        notes: payload.notes?.trim() || null,
      });

      // 3. Update service account status
      const [updatedSa] = await tx
        .update(serviceAccounts)
        .set({
          status: "SUSPENDED",
          updatedAt: new Date(),
        })
        .where(eq(serviceAccounts.id, serviceAccountId))
        .returning();

      // 4. Log immutable audit entry
      await tx.insert(auditLogs).values({
        actorUserId,
        action: "SERVICE_SUSPENDED",
        entityType: "service_account",
        entityId: serviceAccountId,
        reason: payload.reason.trim(),
        oldValues: { status: sa.status },
        newValues: { status: "SUSPENDED" },
        metadata: {
          suspensionRecordId: suspension.id,
          effectiveDate: effectiveDateStr,
          notes: payload.notes || null,
        },
      });

      return {
        serviceAccount: updatedSa,
        suspension,
      };
    });

    return {
      message: "Service account successfully suspended.",
      ...result,
    };
  }

  /**
   * 6. Request / Execute Reconnection
   * Generates BCIS-RECON-YYYY-NNNN. Can be immediate or scheduled for technician dispatch.
   */
  static async requestReconnection(
    serviceAccountId: string,
    payload: {
      fee?: string;
      technicianUserId?: string;
      scheduledAt?: string;
      notes?: string;
      immediate?: boolean;
    },
    actorUserId: string
  ) {
    const [sa] = await db
      .select({
        id: serviceAccounts.id,
        status: serviceAccounts.status,
        servicePlanId: serviceAccounts.servicePlanId,
      })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.id, serviceAccountId))
      .limit(1);

    if (!sa) {
      throw new Error("Service account not found.");
    }

    if (sa.status !== "SUSPENDED") {
      throw new Error(`Only suspended accounts can be reconnected. Current status: ${sa.status}`);
    }

    // Default fee lookup
    let feeStr = payload.fee;
    if (!feeStr) {
      const [plan] = await db
        .select({ reconnectionFee: servicePlans.reconnectionFee })
        .from(servicePlans)
        .where(eq(servicePlans.id, sa.servicePlanId))
        .limit(1);
      feeStr = plan?.reconnectionFee || (await this.getSetting("default_reconnection_fee", "300.00"));
    }

    const reconnectionNumber = await getNextDocumentNumber("BCIS-RECON");
    const todayStr = new Date().toISOString().slice(0, 10);
    const isImmediate = payload.immediate === true;

    const status = isImmediate ? "COMPLETED" : payload.scheduledAt ? "SCHEDULED" : "REQUESTED";

    const result = await db.transaction(async (tx) => {
      // 1. Create reconnection record
      const [reconnection] = await tx
        .insert(reconnectionRecords)
        .values({
          reconnectionNumber,
          serviceAccountId,
          requestDate: todayStr,
          fee: feeStr || "0.00",
          technicianUserId: payload.technicianUserId || null,
          scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
          completedAt: isImmediate ? new Date() : null,
          approvedBy: actorUserId,
          notes: payload.notes?.trim() || null,
          status,
        })
        .returning();

      if (!reconnection) {
        throw new Error("Failed to create reconnection record.");
      }

      // If immediate, restore account to ACTIVE now
      if (isImmediate) {
        await tx.insert(serviceAccountStatusHistory).values({
          serviceAccountId,
          fromStatus: "SUSPENDED",
          toStatus: "ACTIVE",
          reason: payload.notes?.trim() || "Immediate service reconnection authorized.",
          actorUserId,
          notes: `Reconnection order: ${reconnectionNumber}`,
        });

        await tx
          .update(serviceAccounts)
          .set({
            status: "ACTIVE",
            updatedAt: new Date(),
          })
          .where(eq(serviceAccounts.id, serviceAccountId));
      }

      // Audit entry
      await tx.insert(auditLogs).values({
        actorUserId,
        action: isImmediate ? "SERVICE_RECONNECTED_IMMEDIATE" : "RECONNECTION_REQUESTED",
        entityType: "reconnection_record",
        entityId: reconnection.id,
        reason: payload.notes || (isImmediate ? "Immediate reconnection" : "Reconnection requested"),
        metadata: {
          reconnectionNumber,
          serviceAccountId,
          fee: feeStr,
          status,
        },
      });

      return reconnection;
    });

    return {
      message: isImmediate
        ? "Service reconnected successfully and restored to ACTIVE."
        : "Reconnection work order created successfully.",
      reconnection: result,
      reconnectedImmediately: isImmediate,
    };
  }

  /**
   * 7. Complete Reconnection Work Order
   * Technician completes reconnection, restoring account to ACTIVE status.
   */
  static async completeReconnection(
    reconnectionId: string,
    payload: {
      notes?: string;
    },
    actorUserId: string
  ) {
    const [rec] = await db
      .select()
      .from(reconnectionRecords)
      .where(eq(reconnectionRecords.id, reconnectionId))
      .limit(1);

    if (!rec) {
      throw new Error("Reconnection record not found.");
    }

    if (rec.status === "COMPLETED") {
      throw new Error("Reconnection is already completed.");
    }
    if (rec.status === "CANCELLED") {
      throw new Error("Cannot complete a cancelled reconnection work order.");
    }

    const [sa] = await db
      .select()
      .from(serviceAccounts)
      .where(eq(serviceAccounts.id, rec.serviceAccountId))
      .limit(1);

    if (!sa) {
      throw new Error("Associated service account not found.");
    }

    const result = await db.transaction(async (tx) => {
      // 1. Update reconnection record
      const [updatedRec] = await tx
        .update(reconnectionRecords)
        .set({
          status: "COMPLETED",
          completedAt: new Date(),
          notes: payload.notes ? `${rec.notes || ""}\nCompletion: ${payload.notes.trim()}`.trim() : rec.notes,
          updatedAt: new Date(),
        })
        .where(eq(reconnectionRecords.id, reconnectionId))
        .returning();

      // 2. Update service account status to ACTIVE
      const [updatedSa] = await tx
        .update(serviceAccounts)
        .set({
          status: "ACTIVE",
          updatedAt: new Date(),
        })
        .where(eq(serviceAccounts.id, rec.serviceAccountId))
        .returning();

      // 3. Status history entry
      await tx.insert(serviceAccountStatusHistory).values({
        serviceAccountId: rec.serviceAccountId,
        fromStatus: sa.status,
        toStatus: "ACTIVE",
        reason: payload.notes?.trim() || `Reconnection order ${rec.reconnectionNumber} completed by technician.`,
        actorUserId,
        notes: `Reconnection work order: ${rec.reconnectionNumber}`,
      });

      // 4. Audit entry
      await tx.insert(auditLogs).values({
        actorUserId,
        action: "RECONNECTION_COMPLETED",
        entityType: "reconnection_record",
        entityId: reconnectionId,
        metadata: {
          reconnectionNumber: rec.reconnectionNumber,
          serviceAccountId: rec.serviceAccountId,
          completionNotes: payload.notes || null,
        },
      });

      return {
        reconnection: updatedRec,
        serviceAccount: updatedSa,
      };
    });

    return {
      message: `Reconnection order ${rec.reconnectionNumber} completed. Service account restored to ACTIVE.`,
      ...result,
    };
  }

  /**
   * 8. Unified Service Control & Status History
   */
  static async getServiceControlHistory(serviceAccountId: string): Promise<ServiceHistoryEvent[]> {
    // 1. Status history transitions
    const statusHistory = await db
      .select({
        id: serviceAccountStatusHistory.id,
        fromStatus: serviceAccountStatusHistory.fromStatus,
        toStatus: serviceAccountStatusHistory.toStatus,
        reason: serviceAccountStatusHistory.reason,
        effectiveAt: serviceAccountStatusHistory.effectiveAt,
        notes: serviceAccountStatusHistory.notes,
        actorName: users.displayName,
      })
      .from(serviceAccountStatusHistory)
      .leftJoin(users, eq(serviceAccountStatusHistory.actorUserId, users.id))
      .where(eq(serviceAccountStatusHistory.serviceAccountId, serviceAccountId));

    // 2. Suspensions
    const suspensions = await db
      .select({
        id: suspensionRecords.id,
        reason: suspensionRecords.reason,
        effectiveDate: suspensionRecords.effectiveDate,
        createdAt: suspensionRecords.createdAt,
        completedAt: suspensionRecords.completedAt,
        notes: suspensionRecords.notes,
        actorName: users.displayName,
      })
      .from(suspensionRecords)
      .leftJoin(users, eq(suspensionRecords.approvedBy, users.id))
      .where(eq(suspensionRecords.serviceAccountId, serviceAccountId));

    // 3. Reconnections
    const reconnections = await db
      .select({
        id: reconnectionRecords.id,
        reconnectionNumber: reconnectionRecords.reconnectionNumber,
        requestDate: reconnectionRecords.requestDate,
        fee: reconnectionRecords.fee,
        status: reconnectionRecords.status,
        scheduledAt: reconnectionRecords.scheduledAt,
        completedAt: reconnectionRecords.completedAt,
        createdAt: reconnectionRecords.createdAt,
        notes: reconnectionRecords.notes,
        actorName: users.displayName,
      })
      .from(reconnectionRecords)
      .leftJoin(users, eq(reconnectionRecords.approvedBy, users.id))
      .where(eq(reconnectionRecords.serviceAccountId, serviceAccountId));

    const events: ServiceHistoryEvent[] = [];

    for (const sh of statusHistory) {
      events.push({
        id: sh.id,
        eventType: "STATUS_CHANGE",
        occurredAt: sh.effectiveAt.toISOString(),
        title: `Status: ${sh.fromStatus} → ${sh.toStatus}`,
        description: sh.reason + (sh.notes ? ` (${sh.notes})` : ""),
        actorName: sh.actorName,
      });
    }

    for (const s of suspensions) {
      events.push({
        id: s.id,
        eventType: "SUSPENSION",
        occurredAt: s.createdAt.toISOString(),
        title: `Service Suspended (Effective: ${s.effectiveDate})`,
        description: `Reason: ${s.reason}` + (s.notes ? ` — ${s.notes}` : ""),
        actorName: s.actorName,
      });
    }

    for (const r of reconnections) {
      events.push({
        id: r.id,
        eventType: "RECONNECTION",
        occurredAt: (r.completedAt || r.createdAt).toISOString(),
        title: `Reconnection Order: ${r.reconnectionNumber} (${r.status})`,
        description: `Fee: ₱${parseFloat(r.fee).toFixed(2)}` + (r.notes ? ` — ${r.notes}` : ""),
        actorName: r.actorName,
        metadata: {
          reconnectionNumber: r.reconnectionNumber,
          fee: r.fee,
          status: r.status,
        },
      });
    }

    // Sort descending by event timestamp
    events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return events;
  }

  /**
   * 9. List Reconnection Work Orders
   */
  static async listReconnections(params: {
    status?: string;
    technicianUserId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (params.status && params.status !== "ALL") {
      conditions.push(eq(reconnectionRecords.status, params.status));
    }
    if (params.technicianUserId) {
      conditions.push(eq(reconnectionRecords.technicianUserId, params.technicianUserId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reconnectionRecords)
      .where(whereClause);

    const total = countResult?.count || 0;

    const rows = await db
      .select({
        id: reconnectionRecords.id,
        reconnectionNumber: reconnectionRecords.reconnectionNumber,
        serviceAccountId: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        subscriberId: subscribers.id,
        subscriberAccountNumber: subscribers.accountNumber,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        subscriberMobile: subscribers.primaryContactNumber,
        servicePlanName: servicePlans.name,
        requestDate: reconnectionRecords.requestDate,
        fee: reconnectionRecords.fee,
        status: reconnectionRecords.status,
        scheduledAt: reconnectionRecords.scheduledAt,
        completedAt: reconnectionRecords.completedAt,
        notes: reconnectionRecords.notes,
        technicianUserId: reconnectionRecords.technicianUserId,
        createdAt: reconnectionRecords.createdAt,
      })
      .from(reconnectionRecords)
      .innerJoin(serviceAccounts, eq(reconnectionRecords.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .innerJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
      .where(whereClause)
      .orderBy(desc(reconnectionRecords.createdAt))
      .limit(limit)
      .offset(offset);

    const data = rows.map((r) => ({
      id: r.id,
      reconnectionNumber: r.reconnectionNumber,
      serviceAccountId: r.serviceAccountId,
      serviceAccountNumber: r.serviceAccountNumber,
      subscriberId: r.subscriberId,
      subscriberAccountNumber: r.subscriberAccountNumber,
      subscriberDisplayName: computeSubscriberDisplayName({
        firstName: r.subscriberFirstName,
        lastName: r.subscriberLastName,
        businessName: r.subscriberBusinessName,
      }),
      subscriberMobile: r.subscriberMobile,
      servicePlanName: r.servicePlanName,
      requestDate: r.requestDate,
      fee: r.fee,
      status: r.status,
      scheduledAt: r.scheduledAt,
      completedAt: r.completedAt,
      notes: r.notes,
      technicianUserId: r.technicianUserId,
      createdAt: r.createdAt,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 10. List Technicians Available for Work Order Assignment
   */
  static async listTechnicians() {
    const techUsers = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        username: users.username,
      })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.displayName));

    return techUsers;
  }
}
