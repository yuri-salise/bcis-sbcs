import { eq, and, sql, desc, asc, inArray, gte, lte } from "drizzle-orm";
import { db } from "../../db/db.js";
import { invoices, billingCycles, ledgerEntries } from "../../db/schema/billing.js";
import { payments, paymentAllocations } from "../../db/schema/payments.js";
import { paymentProofs } from "../../db/schema/gcash.js";
import { collectionBatches } from "../../db/schema/collections.js";
import {
  subscribers,
  serviceAccounts,
  servicePlans,
  collectionAreas,
  collectors,
  subscriberAddresses,
} from "../../db/schema/subscribers.js";
import { auditLogs, applicationSettings } from "../../db/schema/system.js";
import { users } from "../../db/schema/auth.js";
import { Money } from "../../shared/money/money.js";

function getSubscriberDisplayName(s: {
  businessName: string | null;
  firstName: string;
  lastName: string;
}): string {
  if (s.businessName && s.businessName.trim().length > 0) {
    return `${s.businessName} (${s.lastName}, ${s.firstName})`;
  }
  return `${s.lastName}, ${s.firstName}`;
}

export class ReportsService {
  /**
   * 1. Executive Dashboard KPIs & Operational Supporting Trends (PRODUCT.md Section 14.1 & 24)
   */
  static async getDashboardMetrics() {
    const today = new Date().toISOString().slice(0, 10);
    const firstDayOfMonth = `${today.slice(0, 7)}-01`;

    // Grace period from settings
    const [graceSetting] = await db
      .select()
      .from(applicationSettings)
      .where(eq(applicationSettings.key, "grace_period_days"))
      .limit(1);
    const graceDays = graceSetting ? parseInt(graceSetting.value, 10) : 5;

    // 1. Current Receivable & 2. Overdue Receivable
    const openInvoices = await db
      .select({
        id: invoices.id,
        balanceDueCache: invoices.balanceDueCache,
        dueDate: invoices.dueDate,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        and(
          inArray(invoices.status, ["UNPAID", "PARTIALLY_PAID", "OVERDUE"]),
          sql`CAST(${invoices.balanceDueCache} AS numeric) > 0`
        )
      );

    let currentReceivableMoney = Money.zero();
    let overdueReceivableMoney = Money.zero();
    let overdueCount = 0;
    let daysOverdue30PlusCount = 0;

    const todayDateObj = new Date(today);

    for (const inv of openInvoices) {
      const balance = Money.fromDecimal(inv.balanceDueCache);
      const dueDateObj = new Date(inv.dueDate);
      const diffMs = todayDateObj.getTime() - dueDateObj.getTime();
      const daysPastDue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const daysOverdue = daysPastDue - graceDays;

      if (daysOverdue > 0) {
        overdueReceivableMoney = overdueReceivableMoney.add(balance);
        overdueCount++;
        if (daysOverdue >= 30) {
          daysOverdue30PlusCount++;
        }
      } else {
        currentReceivableMoney = currentReceivableMoney.add(balance);
      }
    }

    // 3. Today's Collections
    const todayPayments = await db
      .select({ amount: payments.amountPaid })
      .from(payments)
      .where(
        and(
          eq(payments.status, "POSTED"),
          sql`CAST(${payments.paymentDate} AS date) = CAST(${today} AS date)`
        )
      );

    let todayCollectionMoney = Money.zero();
    for (const p of todayPayments) {
      todayCollectionMoney = todayCollectionMoney.add(Money.fromDecimal(p.amount));
    }

    // 4. Current Billing (from latest OPEN billing cycle)
    const [latestOpenCycle] = await db
      .select()
      .from(billingCycles)
      .where(eq(billingCycles.status, "OPEN"))
      .orderBy(desc(billingCycles.periodStart))
      .limit(1);

    let currentBillingMoney = Money.zero();
    if (latestOpenCycle) {
      const cycleInvoices = await db
        .select({ totalAmount: invoices.totalAmount })
        .from(invoices)
        .where(eq(invoices.billingCycleId, latestOpenCycle.id));
      for (const inv of cycleInvoices) {
        currentBillingMoney = currentBillingMoney.add(Money.fromDecimal(inv.totalAmount));
      }
    }

    // 5. Pending GCash Verification
    const [pendingGcashRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentProofs)
      .where(inArray(paymentProofs.verificationStatus, ["PENDING", "FLAGGED"]));
    const pendingGcashCount = pendingGcashRes?.count || 0;

    // 6. Collector Reconciliation Exceptions (Unbalanced submitted/remitted batches)
    const [unbalancedBatchesRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(collectionBatches)
      .where(
        and(
          inArray(collectionBatches.status, ["SUBMITTED", "REMITTED"]),
          sql`CAST(${collectionBatches.difference} AS numeric) != 0`
        )
      );
    const reconciliationExceptionsCount = unbalancedBatchesRes?.count || 0;

    // Supporting: Billing vs Collection Trend (Last 6 billing cycles)
    const allCycles = await db
      .select()
      .from(billingCycles)
      .orderBy(desc(billingCycles.periodStart))
      .limit(6);

    const billingVsCollectionTrend = [];
    for (const cycle of allCycles.reverse()) {
      const cycleInvs = await db
        .select({ id: invoices.id, totalAmount: invoices.totalAmount })
        .from(invoices)
        .where(eq(invoices.billingCycleId, cycle.id));

      let billedMoney = Money.zero();
      for (const inv of cycleInvs) {
        billedMoney = billedMoney.add(Money.fromDecimal(inv.totalAmount));
      }

      let collectedMoney = Money.zero();
      if (cycleInvs.length > 0) {
        const invIds = cycleInvs.map((i) => i.id);
        const allocs = await db
          .select({ allocatedAmount: paymentAllocations.allocatedAmount })
          .from(paymentAllocations)
          .where(inArray(paymentAllocations.invoiceId, invIds));
        for (const a of allocs) {
          collectedMoney = collectedMoney.add(Money.fromDecimal(a.allocatedAmount));
        }
      }

      billingVsCollectionTrend.push({
        cycleId: cycle.id,
        cycleCode: cycle.cycleCode,
        period: `${cycle.periodStart} to ${cycle.periodEnd}`,
        billedAmount: billedMoney.format(),
        collectedAmount: collectedMoney.format(),
        billedNumber: billedMoney.toDecimal(),
        collectedNumber: collectedMoney.toDecimal(),
      });
    }

    // Supporting: Payment Method Breakdown (This month's posted payments)
    const monthPayments = await db
      .select({
        paymentMethod: payments.paymentMethod,
        amount: payments.amountPaid,
      })
      .from(payments)
      .where(
        and(
          eq(payments.status, "POSTED"),
          gte(sql`CAST(${payments.paymentDate} AS date)`, sql`CAST(${firstDayOfMonth} AS date)`)
        )
      );

    const methodSums: Record<string, { amount: Money; count: number }> = {
      CASH: { amount: Money.zero(), count: 0 },
      GCASH: { amount: Money.zero(), count: 0 },
      BANK_TRANSFER: { amount: Money.zero(), count: 0 },
      CHECK: { amount: Money.zero(), count: 0 },
    };

    let totalMonthCollected = Money.zero();
    for (const p of monthPayments) {
      const pAmt = Money.fromDecimal(p.amount);
      totalMonthCollected = totalMonthCollected.add(pAmt);
      const m = p.paymentMethod || "CASH";
      if (!methodSums[m]) methodSums[m] = { amount: Money.zero(), count: 0 };
      methodSums[m].amount = methodSums[m].amount.add(pAmt);
      methodSums[m].count += 1;
    }

    const paymentMethodBreakdown = Object.entries(methodSums).map(([method, data]) => {
      const pct = totalMonthCollected.toCentavosNumber() > 0
        ? Math.round((data.amount.toCentavosNumber() / totalMonthCollected.toCentavosNumber()) * 100)
        : 0;
      return {
        method,
        amount: data.amount.format(),
        count: data.count,
        percentage: pct,
      };
    });

    // Supporting: AR Aging 5-Bucket Distribution
    let currentBucket = Money.zero();
    let b1to30 = Money.zero();
    let b31to60 = Money.zero();
    let b61to90 = Money.zero();
    let b90Plus = Money.zero();

    for (const inv of openInvoices) {
      const balance = Money.fromDecimal(inv.balanceDueCache);
      const dueDateObj = new Date(inv.dueDate);
      const diffMs = todayDateObj.getTime() - dueDateObj.getTime();
      const daysPastDue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (daysPastDue <= 0) {
        currentBucket = currentBucket.add(balance);
      } else if (daysPastDue <= 30) {
        b1to30 = b1to30.add(balance);
      } else if (daysPastDue <= 60) {
        b31to60 = b31to60.add(balance);
      } else if (daysPastDue <= 90) {
        b61to90 = b61to90.add(balance);
      } else {
        b90Plus = b90Plus.add(balance);
      }
    }

    const totalArMoney = currentBucket.add(b1to30).add(b31to60).add(b61to90).add(b90Plus);

    const agingSummary = {
      totalReceivable: totalArMoney.format(),
      current: currentBucket.format(),
      days1to30: b1to30.format(),
      days31to60: b31to60.format(),
      days61to90: b61to90.format(),
      days90Plus: b90Plus.format(),
    };

    // Supporting: Top Collectors Performance
    const allCollectors = await db
      .select({
        id: collectors.id,
        name: collectors.name,
        collectorCode: collectors.collectorCode,
      })
      .from(collectors)
      .where(eq(collectors.isActive, true))
      .limit(5);

    const topCollectors = [];
    for (const col of allCollectors) {
      const batches = await db
        .select({
          collectedCash: collectionBatches.collectedCash,
          expectedCash: collectionBatches.expectedCash,
        })
        .from(collectionBatches)
        .where(
          and(
            eq(collectionBatches.collectorId, col.id),
            gte(sql`CAST(${collectionBatches.collectionDate} AS date)`, sql`CAST(${firstDayOfMonth} AS date)`)
          )
        );

      let collectedSum = Money.zero();
      let expectedSum = Money.zero();
      for (const b of batches) {
        collectedSum = collectedSum.add(Money.fromDecimal(b.collectedCash));
        expectedSum = expectedSum.add(Money.fromDecimal(b.expectedCash));
      }

      const efficiency = expectedSum.toCentavosNumber() > 0
        ? Math.round((collectedSum.toCentavosNumber() / expectedSum.toCentavosNumber()) * 100)
        : 100;

      topCollectors.push({
        id: col.id,
        name: col.name,
        code: col.collectorCode,
        areaName: "General Territory",
        collectedThisMonth: collectedSum.format(),
        batchesCount: batches.length,
        efficiencyPercentage: efficiency,
      });
    }

    // Supporting: Recent Payments (Last 8)
    const recentPaymentsRaw = await db
      .select({
        id: payments.id,
        receiptNumber: payments.receiptNumber,
        paymentDate: payments.paymentDate,
        amount: payments.amountPaid,
        paymentMethod: payments.paymentMethod,
        referenceNumber: payments.referenceNumber,
        createdAt: payments.createdAt,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        subscriberAccountNumber: subscribers.accountNumber,
      })
      .from(payments)
      .leftJoin(subscribers, eq(payments.subscriberId, subscribers.id))
      .where(eq(payments.status, "POSTED"))
      .orderBy(desc(payments.createdAt))
      .limit(8);

    const recentPayments = recentPaymentsRaw.map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      paymentNumber: p.receiptNumber,
      paymentDate: p.paymentDate,
      createdAt: p.createdAt.toISOString(),
      amount: Money.fromDecimal(p.amount).format(),
      paymentMethod: p.paymentMethod,
      referenceNumber: p.referenceNumber,
      subscriberAccountNumber: p.subscriberAccountNumber || "—",
      subscriberName: p.subscriberFirstName
        ? getSubscriberDisplayName({
            businessName: p.subscriberBusinessName,
            firstName: p.subscriberFirstName,
            lastName: p.subscriberLastName || "",
          })
        : "Unknown Subscriber",
    }));

    return {
      kpis: {
        currentReceivable: currentReceivableMoney.format(),
        overdueReceivable: overdueReceivableMoney.format(),
        todayCollection: todayCollectionMoney.format(),
        currentBilling: currentBillingMoney.format(),
        pendingGcashCount,
        reconciliationExceptionsCount,
      },
      supporting: {
        billingVsCollectionTrend,
        paymentMethodBreakdown,
        agingSummary,
        topCollectors,
        delinquencyAlerts: {
          overdueInvoicesCount: overdueCount,
          daysOverdue30PlusCount,
        },
        recentPayments,
      },
      asOfDate: today,
    };
  }

  /**
   * 2. Daily Collection Report (PRODUCT.md Section 24)
   * Reconciles exactly against source transactions: SUM(payments.amount_paid) for POSTED on date.
   */
  static async getDailyCollectionReport(params: {
    date?: string;
    collectionAreaId?: string;
    paymentMethod?: string;
    cashierUserId?: string;
  } = {}) {
    const reportDate = params.date || new Date().toISOString().slice(0, 10);

    const conditions = [
      eq(payments.status, "POSTED"),
      sql`CAST(${payments.paymentDate} AS date) = CAST(${reportDate} AS date)`,
    ];

    if (params.paymentMethod) {
      conditions.push(eq(payments.paymentMethod, params.paymentMethod));
    }
    if (params.cashierUserId) {
      conditions.push(eq(payments.cashierId, params.cashierUserId));
    }

    const rawPayments = await db
      .select({
        id: payments.id,
        receiptNumber: payments.receiptNumber,
        paymentDate: payments.paymentDate,
        amount: payments.amountPaid,
        paymentMethod: payments.paymentMethod,
        referenceNumber: payments.referenceNumber,
        createdAt: payments.createdAt,
        notes: payments.notes,
        subscriberId: subscribers.id,
        subscriberAccountNumber: subscribers.accountNumber,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        cashierId: users.id,
        cashierDisplayName: users.displayName,
        collectorId: collectors.id,
        collectorName: collectors.name,
      })
      .from(payments)
      .leftJoin(subscribers, eq(payments.subscriberId, subscribers.id))
      .leftJoin(users, eq(payments.cashierId, users.id))
      .leftJoin(collectors, eq(payments.collectorId, collectors.id))
      .where(and(...conditions))
      .orderBy(asc(payments.createdAt));

    let totalCollected = Money.zero();
    const methodMap: Record<string, { amount: Money; count: number }> = {
      CASH: { amount: Money.zero(), count: 0 },
      GCASH: { amount: Money.zero(), count: 0 },
      BANK_TRANSFER: { amount: Money.zero(), count: 0 },
      CHECK: { amount: Money.zero(), count: 0 },
    };
    const cashierMap = new Map<string, { name: string; amount: Money; count: number }>();
    const collectorMap = new Map<string, { name: string; amount: Money; count: number }>();

    const items = [];

    for (const p of rawPayments) {
      const pAmt = Money.fromDecimal(p.amount);
      totalCollected = totalCollected.add(pAmt);

      // Method breakdown
      const m = p.paymentMethod || "CASH";
      if (!methodMap[m]) methodMap[m] = { amount: Money.zero(), count: 0 };
      methodMap[m].amount = methodMap[m].amount.add(pAmt);
      methodMap[m].count += 1;

      // Cashier breakdown
      const cId = p.cashierId || "unassigned";
      const cName = p.cashierDisplayName || "System / Automated";
      const cEntry = cashierMap.get(cId) || { name: cName, amount: Money.zero(), count: 0 };
      cEntry.amount = cEntry.amount.add(pAmt);
      cEntry.count += 1;
      cashierMap.set(cId, cEntry);

      // Collector breakdown
      if (p.collectorId) {
        const colEntry = collectorMap.get(p.collectorId) || {
          name: p.collectorName || "Unknown Collector",
          amount: Money.zero(),
          count: 0,
        };
        colEntry.amount = colEntry.amount.add(pAmt);
        colEntry.count += 1;
        collectorMap.set(p.collectorId, colEntry);
      }

      const subscriberDisplayName = p.subscriberFirstName
        ? getSubscriberDisplayName({
            businessName: p.subscriberBusinessName,
            firstName: p.subscriberFirstName,
            lastName: p.subscriberLastName || "",
          })
        : "Direct Cashier Customer";

      items.push({
        id: p.id,
        receiptNumber: p.receiptNumber,
        paymentNumber: p.receiptNumber,
        paymentDate: p.paymentDate,
        createdAt: p.createdAt.toISOString(),
        subscriberAccountNumber: p.subscriberAccountNumber || "—",
        subscriberDisplayName,
        paymentMethod: p.paymentMethod,
        referenceNumber: p.referenceNumber || "—",
        amount: pAmt.format(),
        rawAmount: p.amount,
        cashierName: p.cashierDisplayName || "System",
        collectorName: p.collectorName || "Direct / Office",
        batchNumber: "—",
        notes: p.notes || "",
      });
    }

    const byPaymentMethod = Object.entries(methodMap).map(([method, data]) => ({
      method,
      amount: data.amount.format(),
      count: data.count,
      percentage: totalCollected.toCentavosNumber() > 0
        ? Math.round((data.amount.toCentavosNumber() / totalCollected.toCentavosNumber()) * 100)
        : 0,
    }));

    const byCashier = Array.from(cashierMap.entries()).map(([id, data]) => ({
      cashierId: id,
      cashierName: data.name,
      amount: data.amount.format(),
      count: data.count,
    }));

    const byCollector = Array.from(collectorMap.entries()).map(([id, data]) => ({
      collectorId: id,
      collectorName: data.name,
      amount: data.amount.format(),
      count: data.count,
    }));

    return {
      reportType: "DAILY_COLLECTION",
      date: reportDate,
      totalCollected: totalCollected.format(),
      rawTotalCollected: totalCollected.toDecimal(),
      totalTransactions: items.length,
      byPaymentMethod,
      byCashier,
      byCollector,
      items,
    };
  }

  /**
   * 3. Monthly Collection Report (PRODUCT.md Section 24)
   */
  static async getMonthlyCollectionReport(params: { yearMonth?: string; collectionAreaId?: string } = {}) {
    const currentYm = new Date().toISOString().slice(0, 7);
    const ym = params.yearMonth || currentYm;
    const [yearStr, monthStr] = ym.split("-");
    const year = parseInt(yearStr || "2026", 10);
    const month = parseInt(monthStr || "1", 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    const startDate = `${ym}-01`;
    const endDate = `${ym}-${String(daysInMonth).padStart(2, "0")}`;

    const monthPayments = await db
      .select({
        paymentDate: payments.paymentDate,
        amount: payments.amountPaid,
        paymentMethod: payments.paymentMethod,
      })
      .from(payments)
      .where(
        and(
          eq(payments.status, "POSTED"),
          gte(sql`CAST(${payments.paymentDate} AS date)`, sql`CAST(${startDate} AS date)`),
          lte(sql`CAST(${payments.paymentDate} AS date)`, sql`CAST(${endDate} AS date)`)
        )
      )
      .orderBy(asc(payments.paymentDate));

    // Daily breakdown map
    const dailyMap = new Map<string, { total: Money; count: number; cash: Money; nonCash: Money }>();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${ym}-${String(day).padStart(2, "0")}`;
      dailyMap.set(dateStr, {
        total: Money.zero(),
        count: 0,
        cash: Money.zero(),
        nonCash: Money.zero(),
      });
    }

    let totalCollected = Money.zero();
    const methodMap: Record<string, { amount: Money; count: number }> = {};

    for (const p of monthPayments) {
      const pAmt = Money.fromDecimal(p.amount);
      totalCollected = totalCollected.add(pAmt);

      const dStr = p.paymentDate.slice(0, 10);
      const dayData = dailyMap.get(dStr);
      if (dayData) {
        dayData.total = dayData.total.add(pAmt);
        dayData.count += 1;
        if (p.paymentMethod === "CASH") {
          dayData.cash = dayData.cash.add(pAmt);
        } else {
          dayData.nonCash = dayData.nonCash.add(pAmt);
        }
      }

      const m = p.paymentMethod || "CASH";
      if (!methodMap[m]) methodMap[m] = { amount: Money.zero(), count: 0 };
      methodMap[m].amount = methodMap[m].amount.add(pAmt);
      methodMap[m].count += 1;
    }

    let cumulative = Money.zero();
    let highestDay = { date: "", amount: Money.zero() };

    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${ym}-${String(day).padStart(2, "0")}`;
      const data = dailyMap.get(dateStr)!;
      cumulative = cumulative.add(data.total);

      if (data.total.toCentavosNumber() > highestDay.amount.toCentavosNumber()) {
        highestDay = { date: dateStr, amount: data.total };
      }

      days.push({
        dayNumber: day,
        date: dateStr,
        totalAmount: data.total.format(),
        rawTotalAmount: data.total.toDecimal(),
        transactionCount: data.count,
        cashAmount: data.cash.format(),
        nonCashAmount: data.nonCash.format(),
        cumulativeAmount: cumulative.format(),
      });
    }

    const activeDays = days.filter((d) => d.transactionCount > 0).length || 1;
    const dailyAverageCentavos = Math.round(totalCollected.toCentavosNumber() / activeDays);
    const dailyAverage = Money.fromCentavos(dailyAverageCentavos);

    const byPaymentMethod = Object.entries(methodMap).map(([method, data]) => ({
      method,
      amount: data.amount.format(),
      count: data.count,
      percentage: totalCollected.toCentavosNumber() > 0
        ? Math.round((data.amount.toCentavosNumber() / totalCollected.toCentavosNumber()) * 100)
        : 0,
    }));

    return {
      reportType: "MONTHLY_COLLECTION",
      yearMonth: ym,
      startDate,
      endDate,
      totalCollected: totalCollected.format(),
      rawTotalCollected: totalCollected.toDecimal(),
      totalTransactions: monthPayments.length,
      dailyAverage: dailyAverage.format(),
      highestDay: {
        date: highestDay.date || startDate,
        amount: highestDay.amount.format(),
      },
      byPaymentMethod,
      days,
    };
  }

  /**
   * 4. Billing vs Collection Report (PRODUCT.md Section 24)
   * Reconciles exactly against source transactions:
   * Total Billed = SUM(invoices.total_amount) in cycle
   * Total Collected = SUM(payment_allocations.amount) applied to invoices in cycle
   */
  static async getBillingVsCollectionReport(params: { year?: number } = {}) {
    const allCycles = await db
      .select()
      .from(billingCycles)
      .orderBy(desc(billingCycles.periodStart));

    let grandBilled = Money.zero();
    let grandCollected = Money.zero();
    let grandInvoicesCount = 0;
    let grandPaidInvoicesCount = 0;

    const cycles = [];

    for (const cycle of allCycles) {
      if (params.year) {
        const cycleYear = new Date(cycle.periodStart).getFullYear();
        if (cycleYear !== params.year) continue;
      }

      const cycleInvoices = await db
        .select({
          id: invoices.id,
          totalAmount: invoices.totalAmount,
          balanceDueCache: invoices.balanceDueCache,
          status: invoices.status,
        })
        .from(invoices)
        .where(eq(invoices.billingCycleId, cycle.id));

      let cycleBilled = Money.zero();
      let paidCount = 0;

      for (const inv of cycleInvoices) {
        cycleBilled = cycleBilled.add(Money.fromDecimal(inv.totalAmount));
        if (inv.status === "PAID") {
          paidCount += 1;
        }
      }

      let cycleCollected = Money.zero();
      if (cycleInvoices.length > 0) {
        const invoiceIds = cycleInvoices.map((i) => i.id);
        const allocations = await db
          .select({ allocatedAmount: paymentAllocations.allocatedAmount })
          .from(paymentAllocations)
          .where(inArray(paymentAllocations.invoiceId, invoiceIds));

        for (const alloc of allocations) {
          cycleCollected = cycleCollected.add(Money.fromDecimal(alloc.allocatedAmount));
        }
      }

      const cycleOutstanding = cycleBilled.subtract(cycleCollected);
      const efficiency = cycleBilled.toCentavosNumber() > 0
        ? Math.round((cycleCollected.toCentavosNumber() / cycleBilled.toCentavosNumber()) * 10000) / 100
        : 0;

      grandBilled = grandBilled.add(cycleBilled);
      grandCollected = grandCollected.add(cycleCollected);
      grandInvoicesCount += cycleInvoices.length;
      grandPaidInvoicesCount += paidCount;

      cycles.push({
        cycleId: cycle.id,
        cycleCode: cycle.cycleCode,
        startDate: cycle.periodStart,
        endDate: cycle.periodEnd,
        dueDate: cycle.dueDate,
        status: cycle.status,
        invoicesCount: cycleInvoices.length,
        paidInvoicesCount: paidCount,
        totalBilled: cycleBilled.format(),
        rawTotalBilled: cycleBilled.toDecimal(),
        totalCollected: cycleCollected.format(),
        rawTotalCollected: cycleCollected.toDecimal(),
        outstandingBalance: cycleOutstanding.format(),
        rawOutstandingBalance: cycleOutstanding.toDecimal(),
        collectionEfficiency: efficiency,
      });
    }

    const grandOutstanding = grandBilled.subtract(grandCollected);
    const overallEfficiency = grandBilled.toCentavosNumber() > 0
      ? Math.round((grandCollected.toCentavosNumber() / grandBilled.toCentavosNumber()) * 10000) / 100
      : 0;

    return {
      reportType: "BILLING_VS_COLLECTION",
      year: params.year || "ALL",
      overall: {
        totalBilled: grandBilled.format(),
        rawTotalBilled: grandBilled.toDecimal(),
        totalCollected: grandCollected.format(),
        rawTotalCollected: grandCollected.toDecimal(),
        outstandingBalance: grandOutstanding.format(),
        rawOutstandingBalance: grandOutstanding.toDecimal(),
        collectionEfficiency: overallEfficiency,
        invoicesCount: grandInvoicesCount,
        paidInvoicesCount: grandPaidInvoicesCount,
      },
      cycles,
    };
  }

  /**
   * 5. AR Aging Report Summary (PRODUCT.md Section 24 & Section 8.9)
   * 5 buckets relative to asOfDate. Grouped by collection area.
   */
  static async getAgingReport(params: { asOfDate?: string; collectionAreaId?: string } = {}) {
    const asOfDate = params.asOfDate || new Date().toISOString().slice(0, 10);
    const asOfDateObj = new Date(asOfDate);

    // Query open invoices by joining serviceAccounts & subscribers
    const openInvs = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        totalAmount: invoices.totalAmount,
        balanceDueCache: invoices.balanceDueCache,
        dueDate: invoices.dueDate,
        status: invoices.status,
        subscriberId: serviceAccounts.subscriberId,
        subscriberAccountNumber: subscribers.accountNumber,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        subscriberMobile: subscribers.primaryContactNumber,
        serviceAccountId: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        areaId: collectionAreas.id,
        areaName: collectionAreas.name,
        collectorId: collectors.id,
        collectorName: collectors.name,
      })
      .from(invoices)
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .leftJoin(collectionAreas, eq(serviceAccounts.collectionAreaId, collectionAreas.id))
      .leftJoin(collectors, eq(serviceAccounts.collectorId, collectors.id))
      .where(
        and(
          inArray(invoices.status, ["UNPAID", "PARTIALLY_PAID", "OVERDUE"]),
          sql`CAST(${invoices.balanceDueCache} AS numeric) > 0`,
          params.collectionAreaId ? eq(serviceAccounts.collectionAreaId, params.collectionAreaId) : undefined
        )
      )
      .orderBy(asc(invoices.dueDate));

    let currentSum = Money.zero();
    let b1to30Sum = Money.zero();
    let b31to60Sum = Money.zero();
    let b61to90Sum = Money.zero();
    let b90PlusSum = Money.zero();

    let currentCount = 0;
    let b1to30Count = 0;
    let b31to60Count = 0;
    let b61to90Count = 0;
    let b90PlusCount = 0;

    const areaMap = new Map<string, {
      name: string;
      current: Money;
      d1to30: Money;
      d31to60: Money;
      d61to90: Money;
      d90Plus: Money;
      total: Money;
    }>();

    const subMap = new Map<string, {
      subscriberId: string;
      subscriberAccountNumber: string;
      displayName: string;
      mobile: string;
      areaName: string;
      current: Money;
      d1to30: Money;
      d31to60: Money;
      d61to90: Money;
      d90Plus: Money;
      total: Money;
      maxDaysPastDue: number;
    }>();

    for (const inv of openInvs) {
      const balance = Money.fromDecimal(inv.balanceDueCache);
      const dueDateObj = new Date(inv.dueDate);
      const diffMs = asOfDateObj.getTime() - dueDateObj.getTime();
      const daysPastDue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      // 5-bucket categorization
      if (daysPastDue <= 0) {
        currentSum = currentSum.add(balance);
        currentCount++;
      } else if (daysPastDue <= 30) {
        b1to30Sum = b1to30Sum.add(balance);
        b1to30Count++;
      } else if (daysPastDue <= 60) {
        b31to60Sum = b31to60Sum.add(balance);
        b31to60Count++;
      } else if (daysPastDue <= 90) {
        b61to90Sum = b61to90Sum.add(balance);
        b61to90Count++;
      } else {
        b90PlusSum = b90PlusSum.add(balance);
        b90PlusCount++;
      }

      // Group by Area
      const aId = inv.areaId || "unassigned";
      const aName = inv.areaName || "Unassigned Area";
      const aData = areaMap.get(aId) || {
        name: aName,
        current: Money.zero(),
        d1to30: Money.zero(),
        d31to60: Money.zero(),
        d61to90: Money.zero(),
        d90Plus: Money.zero(),
        total: Money.zero(),
      };
      if (daysPastDue <= 0) aData.current = aData.current.add(balance);
      else if (daysPastDue <= 30) aData.d1to30 = aData.d1to30.add(balance);
      else if (daysPastDue <= 60) aData.d31to60 = aData.d31to60.add(balance);
      else if (daysPastDue <= 90) aData.d61to90 = aData.d61to90.add(balance);
      else aData.d90Plus = aData.d90Plus.add(balance);
      aData.total = aData.total.add(balance);
      areaMap.set(aId, aData);

      // Group by Subscriber
      const sId = inv.subscriberId || "unknown";
      const sData = subMap.get(sId) || {
        subscriberId: sId,
        subscriberAccountNumber: inv.subscriberAccountNumber || "—",
        displayName: inv.subscriberFirstName
          ? getSubscriberDisplayName({
              businessName: inv.subscriberBusinessName,
              firstName: inv.subscriberFirstName,
              lastName: inv.subscriberLastName || "",
            })
          : "Unknown",
        mobile: inv.subscriberMobile || "—",
        areaName: inv.areaName || "—",
        current: Money.zero(),
        d1to30: Money.zero(),
        d31to60: Money.zero(),
        d61to90: Money.zero(),
        d90Plus: Money.zero(),
        total: Money.zero(),
        maxDaysPastDue: 0,
      };

      if (daysPastDue <= 0) sData.current = sData.current.add(balance);
      else if (daysPastDue <= 30) sData.d1to30 = sData.d1to30.add(balance);
      else if (daysPastDue <= 60) sData.d31to60 = sData.d31to60.add(balance);
      else if (daysPastDue <= 90) sData.d61to90 = sData.d61to90.add(balance);
      else sData.d90Plus = sData.d90Plus.add(balance);
      sData.total = sData.total.add(balance);
      if (daysPastDue > sData.maxDaysPastDue) sData.maxDaysPastDue = daysPastDue;
      subMap.set(sId, sData);
    }

    const totalReceivable = currentSum.add(b1to30Sum).add(b31to60Sum).add(b61to90Sum).add(b90PlusSum);
    const totalCentavos = totalReceivable.toCentavosNumber();

    const calcPct = (m: Money) =>
      totalCentavos > 0 ? Math.round((m.toCentavosNumber() / totalCentavos) * 1000) / 10 : 0;

    const summary = {
      totalReceivable: totalReceivable.format(),
      rawTotalReceivable: totalReceivable.toDecimal(),
      current: { amount: currentSum.format(), count: currentCount, percentage: calcPct(currentSum) },
      days1to30: { amount: b1to30Sum.format(), count: b1to30Count, percentage: calcPct(b1to30Sum) },
      days31to60: { amount: b31to60Sum.format(), count: b31to60Count, percentage: calcPct(b31to60Sum) },
      days61to90: { amount: b61to90Sum.format(), count: b61to90Count, percentage: calcPct(b61to90Sum) },
      days90Plus: { amount: b90PlusSum.format(), count: b90PlusCount, percentage: calcPct(b90PlusSum) },
    };

    const byArea = Array.from(areaMap.entries()).map(([id, d]) => ({
      areaId: id,
      areaName: d.name,
      current: d.current.format(),
      days1to30: d.d1to30.format(),
      days31to60: d.d31to60.format(),
      days61to90: d.d61to90.format(),
      days90Plus: d.d90Plus.format(),
      total: d.total.format(),
    }));

    const subscribersAging = Array.from(subMap.values()).map((s) => ({
      subscriberId: s.subscriberId,
      subscriberAccountNumber: s.subscriberAccountNumber,
      displayName: s.displayName,
      mobile: s.mobile,
      areaName: s.areaName,
      current: s.current.format(),
      days1to30: s.d1to30.format(),
      days31to60: s.d31to60.format(),
      days61to90: s.d61to90.format(),
      days90Plus: s.d90Plus.format(),
      totalDue: s.total.format(),
      maxDaysPastDue: s.maxDaysPastDue,
    }));

    return {
      reportType: "AR_AGING",
      asOfDate,
      summary,
      byArea,
      subscribers: subscribersAging,
    };
  }

  /**
   * 6. Subscriber Statement of Account (SOA) (PRODUCT.md Section 24)
   * Comprehensive printable/exportable official statement.
   */
  static async getSubscriberSOA(subscriberId: string, asOfDate?: string) {
    const reportDate = asOfDate || new Date().toISOString().slice(0, 10);
    const reportDateObj = new Date(reportDate);

    // 1. Fetch Subscriber
    const [subscriber] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.id, subscriberId))
      .limit(1);

    if (!subscriber) {
      throw new Error(`Subscriber with ID ${subscriberId} not found.`);
    }

    // 2. Fetch Primary Address
    const [primaryAddress] = await db
      .select()
      .from(subscriberAddresses)
      .where(and(eq(subscriberAddresses.subscriberId, subscriberId), eq(subscriberAddresses.isPrimary, true)))
      .limit(1);

    // 3. Fetch Service Accounts with Service Plans
    const accounts = await db
      .select({
        id: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        status: serviceAccounts.status,
        planName: servicePlans.name,
        planCode: servicePlans.code,
        monthlyPrice: servicePlans.monthlyPrice,
        areaName: collectionAreas.name,
        collectorName: collectors.name,
      })
      .from(serviceAccounts)
      .leftJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
      .leftJoin(collectionAreas, eq(serviceAccounts.collectionAreaId, collectionAreas.id))
      .leftJoin(collectors, eq(serviceAccounts.collectorId, collectors.id))
      .where(eq(serviceAccounts.subscriberId, subscriberId));

    // 4. Fetch Invoices for these service accounts
    const accountIds = accounts.map((a) => a.id);
    let subInvoices: any[] = [];
    if (accountIds.length > 0) {
      subInvoices = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          invoiceDate: invoices.invoiceDate,
          dueDate: invoices.dueDate,
          subtotal: invoices.subtotal,
          discountTotal: invoices.discountTotal,
          penaltyTotal: invoices.penaltyTotal,
          adjustmentTotal: invoices.adjustmentTotal,
          totalAmount: invoices.totalAmount,
          amountPaidCache: invoices.amountPaidCache,
          balanceDueCache: invoices.balanceDueCache,
          status: invoices.status,
          cycleCode: billingCycles.cycleCode,
          serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        })
        .from(invoices)
        .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
        .leftJoin(billingCycles, eq(invoices.billingCycleId, billingCycles.id))
        .where(inArray(invoices.serviceAccountId, accountIds))
        .orderBy(desc(invoices.invoiceDate));
    }

    // 5. Fetch Payments
    const subPayments = await db
      .select({
        id: payments.id,
        receiptNumber: payments.receiptNumber,
        paymentDate: payments.paymentDate,
        amount: payments.amountPaid,
        paymentMethod: payments.paymentMethod,
        referenceNumber: payments.referenceNumber,
        status: payments.status,
      })
      .from(payments)
      .where(and(eq(payments.subscriberId, subscriberId), eq(payments.status, "POSTED")))
      .orderBy(desc(payments.paymentDate))
      .limit(10);

    // 6. Fetch Running Ledger Entries
    let ledger: any[] = [];
    if (accountIds.length > 0) {
      const rawEntries = await db
        .select()
        .from(ledgerEntries)
        .where(inArray(ledgerEntries.serviceAccountId, accountIds))
        .orderBy(asc(ledgerEntries.postedAt))
        .limit(20);

      let running = Money.zero();
      ledger = rawEntries.map((e) => {
        const debit = Money.fromDecimal(e.debitAmount || "0.00");
        const credit = Money.fromDecimal(e.creditAmount || "0.00");
        running = running.add(debit).subtract(credit);
        return {
          entryNo: e.entryNo,
          postedAt: e.postedAt ? e.postedAt.toISOString().slice(0, 10) : e.entryDate,
          referenceType: e.referenceType,
          description: e.description,
          debitAmount: debit.format(),
          creditAmount: credit.format(),
          runningBalance: running.format(),
        };
      });
    }

    // 7. Calculate Financial Statement Breakdown & Aging
    let totalBalanceDue = Money.zero();
    let currentBucket = Money.zero();
    let d1to30 = Money.zero();
    let d31to60 = Money.zero();
    let d61to90 = Money.zero();
    let d90Plus = Money.zero();

    for (const inv of subInvoices) {
      if (inv.status !== "PAID" && inv.status !== "VOID") {
        const bal = Money.fromDecimal(inv.balanceDueCache);
        totalBalanceDue = totalBalanceDue.add(bal);

        const diffMs = reportDateObj.getTime() - new Date(inv.dueDate).getTime();
        const daysPastDue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (daysPastDue <= 0) currentBucket = currentBucket.add(bal);
        else if (daysPastDue <= 30) d1to30 = d1to30.add(bal);
        else if (daysPastDue <= 60) d31to60 = d31to60.add(bal);
        else if (daysPastDue <= 90) d61to90 = d61to90.add(bal);
        else d90Plus = d90Plus.add(bal);
      }
    }

    const latestInvoice = subInvoices[0];
    const currentCharges = latestInvoice ? Money.fromDecimal(latestInvoice.totalAmount) : Money.zero();
    const previousBalance = totalBalanceDue.subtract(currentCharges);

    const formattedAddress = primaryAddress
      ? `${primaryAddress.line1}, ${primaryAddress.barangay}, ${primaryAddress.cityMunicipality}, ${primaryAddress.province}`
      : "No physical address registered";

    return {
      statementNumber: `SOA-${subscriber.accountNumber}-${reportDate.replace(/-/g, "")}`,
      statementDate: reportDate,
      company: {
        name: "BUKIDNON CABLE & INTERNET SERVICES",
        address: "Fortich Street, Poblacion, Malaybalay City, Bukidnon, Philippines",
        contactNumber: "(088) 813-1234 / 0917-888-BCIS",
        email: "billing@bcis.local",
        tin: "452-987-654-000",
      },
      subscriber: {
        id: subscriber.id,
        accountNumber: subscriber.accountNumber,
        displayName: getSubscriberDisplayName(subscriber),
        address: formattedAddress,
        mobileNumber: subscriber.primaryContactNumber,
        email: subscriber.email,
        status: subscriber.status,
      },
      serviceAccounts: accounts.map((a) => ({
        id: a.id,
        serviceAccountNumber: a.serviceAccountNumber,
        planName: a.planName || "Standard Plan",
        monthlyRate: a.monthlyPrice ? Money.fromDecimal(a.monthlyPrice).format() : "₱0.00",
        area: a.areaName || "General Area",
        collector: a.collectorName || "Office Collector",
        status: a.status,
      })),
      financialSummary: {
        previousBalance: previousBalance.toCentavosNumber() > 0 ? previousBalance.format() : "₱0.00",
        currentCharges: currentCharges.format(),
        totalAmountDue: totalBalanceDue.format(),
        rawTotalAmountDue: totalBalanceDue.toDecimal(),
        dueDate: latestInvoice ? latestInvoice.dueDate : reportDate,
        aging: {
          current: currentBucket.format(),
          days1to30: d1to30.format(),
          days31to60: d31to60.format(),
          days61to90: d61to90.format(),
          days90Plus: d90Plus.format(),
        },
      },
      invoices: subInvoices.slice(0, 6).map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        cycleCode: inv.cycleCode || "—",
        serviceAccountNumber: inv.serviceAccountNumber || "—",
        totalAmount: Money.fromDecimal(inv.totalAmount).format(),
        amountPaid: Money.fromDecimal(inv.amountPaidCache).format(),
        balanceDue: Money.fromDecimal(inv.balanceDueCache).format(),
        status: inv.status,
      })),
      payments: subPayments.map((p) => ({
        receiptNumber: p.receiptNumber,
        paymentDate: p.paymentDate,
        amount: Money.fromDecimal(p.amount).format(),
        paymentMethod: p.paymentMethod,
        referenceNumber: p.referenceNumber || "—",
      })),
      ledger,
    };
  }

  /**
   * 7. Collector Performance & Remittance Report (PRODUCT.md Section 24)
   */
  static async getCollectorPerformanceReport(params: {
    startDate?: string;
    endDate?: string;
    collectorId?: string;
  } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = params.startDate || `${today.slice(0, 7)}-01`;
    const endDate = params.endDate || today;

    const allCols = await db
      .select({
        id: collectors.id,
        collectorCode: collectors.collectorCode,
        name: collectors.name,
      })
      .from(collectors)
      .where(params.collectorId ? eq(collectors.id, params.collectorId) : undefined);

    let grandExpected = Money.zero();
    let grandCollected = Money.zero();
    let grandRemitted = Money.zero();
    let grandShortage = Money.zero();
    let grandOverage = Money.zero();
    let grandBatchesCount = 0;

    const collectorStats = [];

    for (const col of allCols) {
      const batches = await db
        .select({
          id: collectionBatches.id,
          batchNumber: collectionBatches.batchNumber,
          collectionDate: collectionBatches.collectionDate,
          status: collectionBatches.status,
          expectedCash: collectionBatches.expectedCash,
          collectedCash: collectionBatches.collectedCash,
          remittedCash: collectionBatches.remittedCash,
          difference: collectionBatches.difference,
          shortageAmount: collectionBatches.shortageAmount,
          overageAmount: collectionBatches.overageAmount,
        })
        .from(collectionBatches)
        .where(
          and(
            eq(collectionBatches.collectorId, col.id),
            gte(sql`CAST(${collectionBatches.collectionDate} AS date)`, sql`CAST(${startDate} AS date)`),
            lte(sql`CAST(${collectionBatches.collectionDate} AS date)`, sql`CAST(${endDate} AS date)`)
          )
        );

      let colExpected = Money.zero();
      let colCollected = Money.zero();
      let colRemitted = Money.zero();
      let colShortage = Money.zero();
      let colOverage = Money.zero();
      let reconciledCount = 0;

      for (const b of batches) {
        colExpected = colExpected.add(Money.fromDecimal(b.expectedCash));
        colCollected = colCollected.add(Money.fromDecimal(b.collectedCash));
        colRemitted = colRemitted.add(Money.fromDecimal(b.remittedCash));
        colShortage = colShortage.add(Money.fromDecimal(b.shortageAmount));
        colOverage = colOverage.add(Money.fromDecimal(b.overageAmount));
        if (b.status === "RECONCILED" || b.status === "CLOSED") {
          reconciledCount++;
        }
      }

      grandExpected = grandExpected.add(colExpected);
      grandCollected = grandCollected.add(colCollected);
      grandRemitted = grandRemitted.add(colRemitted);
      grandShortage = grandShortage.add(colShortage);
      grandOverage = grandOverage.add(colOverage);
      grandBatchesCount += batches.length;

      const efficiency = colExpected.toCentavosNumber() > 0
        ? Math.round((colCollected.toCentavosNumber() / colExpected.toCentavosNumber()) * 10000) / 100
        : 100;

      const accuracy = colCollected.toCentavosNumber() > 0
        ? Math.round((colRemitted.toCentavosNumber() / colCollected.toCentavosNumber()) * 10000) / 100
        : 100;

      collectorStats.push({
        collectorId: col.id,
        collectorCode: col.collectorCode,
        name: col.name,
        assignedArea: "General Area",
        batchesCount: batches.length,
        reconciledBatchesCount: reconciledCount,
        expectedCash: colExpected.format(),
        rawExpectedCash: colExpected.toDecimal(),
        collectedCash: colCollected.format(),
        rawCollectedCash: colCollected.toDecimal(),
        remittedCash: colRemitted.format(),
        rawRemittedCash: colRemitted.toDecimal(),
        shortageAmount: colShortage.format(),
        overageAmount: colOverage.format(),
        collectionEfficiency: efficiency,
        remittanceAccuracy: accuracy,
        batches: batches.map((b) => ({
          batchNumber: b.batchNumber,
          date: b.collectionDate,
          status: b.status,
          collected: Money.fromDecimal(b.collectedCash).format(),
          remitted: Money.fromDecimal(b.remittedCash).format(),
          difference: Money.fromDecimal(b.difference).format(),
        })),
      });
    }

    return {
      reportType: "COLLECTOR_PERFORMANCE",
      startDate,
      endDate,
      overall: {
        totalBatches: grandBatchesCount,
        totalExpected: grandExpected.format(),
        rawTotalExpected: grandExpected.toDecimal(),
        totalCollected: grandCollected.format(),
        rawTotalCollected: grandCollected.toDecimal(),
        totalRemitted: grandRemitted.format(),
        rawTotalRemitted: grandRemitted.toDecimal(),
        totalShortage: grandShortage.format(),
        totalOverage: grandOverage.format(),
        overallEfficiency: grandExpected.toCentavosNumber() > 0
          ? Math.round((grandCollected.toCentavosNumber() / grandExpected.toCentavosNumber()) * 10000) / 100
          : 100,
      },
      collectors: collectorStats,
    };
  }

  /**
   * 8. Payment Method Summary (PRODUCT.md Section 24)
   */
  static async getPaymentMethodSummary(params: { startDate?: string; endDate?: string } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = params.startDate || `${today.slice(0, 7)}-01`;
    const endDate = params.endDate || today;

    const filteredPayments = await db
      .select({
        paymentMethod: payments.paymentMethod,
        amount: payments.amountPaid,
      })
      .from(payments)
      .where(
        and(
          eq(payments.status, "POSTED"),
          gte(sql`CAST(${payments.paymentDate} AS date)`, sql`CAST(${startDate} AS date)`),
          lte(sql`CAST(${payments.paymentDate} AS date)`, sql`CAST(${endDate} AS date)`)
        )
      );

    const methodsMap: Record<string, { amount: Money; count: number }> = {
      CASH: { amount: Money.zero(), count: 0 },
      GCASH: { amount: Money.zero(), count: 0 },
      BANK_TRANSFER: { amount: Money.zero(), count: 0 },
      CHECK: { amount: Money.zero(), count: 0 },
    };

    let grandTotal = Money.zero();

    for (const p of filteredPayments) {
      const pAmt = Money.fromDecimal(p.amount);
      grandTotal = grandTotal.add(pAmt);
      const m = p.paymentMethod || "CASH";
      if (!methodsMap[m]) methodsMap[m] = { amount: Money.zero(), count: 0 };
      methodsMap[m].amount = methodsMap[m].amount.add(pAmt);
      methodsMap[m].count += 1;
    }

    const items = Object.entries(methodsMap).map(([method, data]) => {
      const pct = grandTotal.toCentavosNumber() > 0
        ? Math.round((data.amount.toCentavosNumber() / grandTotal.toCentavosNumber()) * 10000) / 100
        : 0;
      const avg = data.count > 0
        ? Money.fromCentavos(Math.round(data.amount.toCentavosNumber() / data.count))
        : Money.zero();
      return {
        method,
        amount: data.amount.format(),
        rawAmount: data.amount.toDecimal(),
        count: data.count,
        percentage: pct,
        averageAmount: avg.format(),
      };
    });

    return {
      reportType: "PAYMENT_METHOD_SUMMARY",
      startDate,
      endDate,
      totalAmount: grandTotal.format(),
      rawTotalAmount: grandTotal.toDecimal(),
      totalTransactions: filteredPayments.length,
      methods: items,
    };
  }

  /**
   * 9. Subscriber Master List Report (PRODUCT.md Section 24)
   */
  static async getSubscriberMasterList(params: {
    status?: string;
    collectionAreaId?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 50;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (params.status) {
      conditions.push(eq(subscribers.status, params.status));
    }
    if (params.search) {
      const term = `%${params.search}%`;
      conditions.push(
        sql`(${subscribers.accountNumber} ILIKE ${term} OR ${subscribers.lastName} ILIKE ${term} OR ${subscribers.firstName} ILIKE ${term} OR ${subscribers.businessName} ILIKE ${term})`
      );
    }

    const [totalCountRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    const total = totalCountRes?.count || 0;

    const subRows = await db
      .select({
        id: subscribers.id,
        accountNumber: subscribers.accountNumber,
        firstName: subscribers.firstName,
        lastName: subscribers.lastName,
        businessName: subscribers.businessName,
        contactNumber: subscribers.primaryContactNumber,
        status: subscribers.status,
        createdAt: subscribers.createdAt,
      })
      .from(subscribers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(subscribers.lastName), asc(subscribers.firstName))
      .limit(limit)
      .offset(offset);

    const items = [];
    let grandBalance = Money.zero();

    for (const s of subRows) {
      const saRows = await db
        .select({
          id: serviceAccounts.id,
          planName: servicePlans.name,
          areaName: collectionAreas.name,
        })
        .from(serviceAccounts)
        .leftJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
        .leftJoin(collectionAreas, eq(serviceAccounts.collectionAreaId, collectionAreas.id))
        .where(eq(serviceAccounts.subscriberId, s.id));

      const accountIds = saRows.map((a) => a.id);
      let subBalance = Money.zero();
      if (accountIds.length > 0) {
        const invs = await db
          .select({ balanceDueCache: invoices.balanceDueCache })
          .from(invoices)
          .where(
            and(
              inArray(invoices.serviceAccountId, accountIds),
              inArray(invoices.status, ["UNPAID", "PARTIALLY_PAID", "OVERDUE"])
            )
          );

        for (const inv of invs) {
          subBalance = subBalance.add(Money.fromDecimal(inv.balanceDueCache));
        }
      }
      grandBalance = grandBalance.add(subBalance);

      items.push({
        id: s.id,
        accountNumber: s.accountNumber,
        displayName: getSubscriberDisplayName(s),
        contactNumber: s.contactNumber || "—",
        primaryArea: saRows[0]?.areaName || "Unassigned",
        primaryPlan: saRows[0]?.planName || "No Plan",
        serviceAccountsCount: saRows.length,
        balanceDue: subBalance.format(),
        rawBalanceDue: subBalance.toDecimal(),
        status: s.status,
        registeredDate: s.createdAt.toISOString().slice(0, 10),
      });
    }

    return {
      reportType: "SUBSCRIBER_MASTER_LIST",
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      items,
    };
  }

  /**
   * 10. Payment Reversal / Void Report (PRODUCT.md Section 24)
   * Lists all reversed payments with supervisor audit explanations.
   */
  static async getPaymentReversalsReport(params: { startDate?: string; endDate?: string } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = params.startDate || `${today.slice(0, 7)}-01`;
    const endDate = params.endDate || today;

    const reversedPayments = await db
      .select({
        id: payments.id,
        receiptNumber: payments.receiptNumber,
        paymentDate: payments.paymentDate,
        amount: payments.amountPaid,
        paymentMethod: payments.paymentMethod,
        referenceNumber: payments.referenceNumber,
        reversalReason: payments.reversalReason,
        reversedAt: payments.reversedAt,
        reversedById: payments.reversedBy,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        subscriberAccountNumber: subscribers.accountNumber,
        reversedByName: users.displayName,
      })
      .from(payments)
      .leftJoin(subscribers, eq(payments.subscriberId, subscribers.id))
      .leftJoin(users, eq(payments.reversedBy, users.id))
      .where(
        and(
          eq(payments.status, "REVERSED"),
          gte(sql`CAST(${payments.paymentDate} AS date)`, sql`CAST(${startDate} AS date)`),
          lte(sql`CAST(${payments.paymentDate} AS date)`, sql`CAST(${endDate} AS date)`)
        )
      )
      .orderBy(desc(payments.reversedAt));

    let totalReversed = Money.zero();
    const items = [];

    for (const p of reversedPayments) {
      const pAmt = Money.fromDecimal(p.amount);
      totalReversed = totalReversed.add(pAmt);

      items.push({
        id: p.id,
        paymentNumber: p.receiptNumber,
        receiptNumber: p.receiptNumber,
        paymentDate: p.paymentDate,
        amount: pAmt.format(),
        rawAmount: p.amount,
        paymentMethod: p.paymentMethod,
        referenceNumber: p.referenceNumber || "—",
        subscriberAccountNumber: p.subscriberAccountNumber || "—",
        subscriberDisplayName: p.subscriberFirstName
          ? getSubscriberDisplayName({
              businessName: p.subscriberBusinessName,
              firstName: p.subscriberFirstName,
              lastName: p.subscriberLastName || "",
            })
          : "Unknown",
        reversedAt: p.reversedAt ? p.reversedAt.toISOString() : "—",
        reversedByName: p.reversedByName || "Supervisor",
        reversalReason: p.reversalReason || "No explanation recorded",
      });
    }

    return {
      reportType: "PAYMENT_REVERSALS",
      startDate,
      endDate,
      totalReversedAmount: totalReversed.format(),
      rawTotalReversedAmount: totalReversed.toDecimal(),
      totalCount: items.length,
      items,
    };
  }

  /**
   * 11. Audit Activity Trail Report (PRODUCT.md Section 8.11 & 24)
   * Immutable activity logging query.
   */
  static async getAuditActivityReport(params: {
    startDate?: string;
    endDate?: string;
    actorUserId?: string;
    entityType?: string;
    action?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 50;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (params.startDate) {
      conditions.push(gte(sql`CAST(${auditLogs.occurredAt} AS date)`, sql`CAST(${params.startDate} AS date)`));
    }
    if (params.endDate) {
      conditions.push(lte(sql`CAST(${auditLogs.occurredAt} AS date)`, sql`CAST(${params.endDate} AS date)`));
    }
    if (params.actorUserId) {
      conditions.push(eq(auditLogs.actorUserId, params.actorUserId));
    }
    if (params.entityType) {
      conditions.push(eq(auditLogs.entityType, params.entityType));
    }
    if (params.action) {
      conditions.push(eq(auditLogs.action, params.action));
    }

    const [totalCountRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    const total = totalCountRes?.count || 0;

    const rows = await db
      .select({
        id: auditLogs.id,
        occurredAt: auditLogs.occurredAt,
        actorUserId: auditLogs.actorUserId,
        actorDisplayName: users.displayName,
        actorUsername: users.username,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        requestId: auditLogs.requestId,
        reason: auditLogs.reason,
        ipAddress: auditLogs.ipAddress,
        metadata: auditLogs.metadata,
        oldValues: auditLogs.oldValues,
        newValues: auditLogs.newValues,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.occurredAt))
      .limit(limit)
      .offset(offset);

    const items = rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt.toISOString(),
      actorUserId: r.actorUserId,
      actorName: r.actorDisplayName || "System / Automated",
      actorUsername: r.actorUsername || "system",
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      requestId: r.requestId,
      reason: r.reason || "—",
      ipAddress: r.ipAddress || "—",
      metadata: r.metadata,
      oldValues: r.oldValues,
      newValues: r.newValues,
    }));

    return {
      reportType: "AUDIT_ACTIVITY",
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      items,
    };
  }
}
