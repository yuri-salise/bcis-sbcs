import { eq, and, sql, desc, asc, or, ilike, inArray } from "drizzle-orm";
import { db } from "../../db/db.js";
import {
  payments,
  paymentAllocations,
  invoices,
  billingCycles,
  ledgerEntries,
  subscribers,
  serviceAccounts,
  servicePlans,
  collectors,
  users,
} from "../../db/schema/index.js";
import { Money } from "../../shared/money/money.js";
import { getNextDocumentNumber } from "../../db/sequences.js";

export interface PreviewPaymentAllocationParams {
  subscriberId: string;
  serviceAccountId?: string;
  amount: string;
}

export interface InvoiceAllocationPreview {
  invoiceId: string;
  invoiceNumber: string;
  cycleCode: string;
  dueDate: string;
  currentBalance: string;
  allocatedAmount: string;
  remainingBalance: string;
  resultingStatus: "PAID" | "PARTIALLY_PAID";
}

export interface PaymentAllocationPreviewResult {
  totalPaymentAmount: string;
  totalAllocated: string;
  advanceCredit: string;
  invoiceAllocations: InvoiceAllocationPreview[];
}

export interface CreatePaymentPayload {
  subscriberId: string;
  serviceAccountId?: string;
  paymentDate?: string;
  paymentMethod: "CASH" | "GCASH" | "BANK_TRANSFER" | "CHECK" | "OTHER";
  referenceNumber?: string;
  amountPaid: string;
  tenderedAmount?: string;
  collectorId?: string;
  notes?: string;
}

export interface ListPaymentsParams {
  search?: string;
  status?: string;
  paymentMethod?: string;
  subscriberId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export class PaymentService {
  /**
   * Preview Oldest-First Payment Allocation (AT-01, AT-02, AT-03, AT-04)
   * 
   * Computes how an incoming payment distributes across unpaid invoices
   * strictly oldest-first (by dueDate, invoiceDate, createdAt) without mutating state.
   */
  public async previewPaymentAllocation(
    params: PreviewPaymentAllocationParams
  ): Promise<PaymentAllocationPreviewResult> {
    const paymentAmount = Money.fromDecimal(params.amount);
    if (paymentAmount.isNegative() || paymentAmount.isZero()) {
      throw new Error("Payment amount must be greater than zero");
    }

    // Find all active service accounts for subscriber
    const accounts = await db
      .select({ id: serviceAccounts.id })
      .from(serviceAccounts)
      .where(
        params.serviceAccountId
          ? and(
              eq(serviceAccounts.id, params.serviceAccountId),
              eq(serviceAccounts.subscriberId, params.subscriberId)
            )
          : eq(serviceAccounts.subscriberId, params.subscriberId)
      );

    if (accounts.length === 0) {
      return {
        totalPaymentAmount: paymentAmount.toDecimalString(),
        totalAllocated: "0.00",
        advanceCredit: paymentAmount.toDecimalString(),
        invoiceAllocations: [],
      };
    }

    const accountIds = accounts.map((a) => a.id);

    // Query unpaid/partially-paid invoices strictly OLDEST FIRST (AT-04)
    const unpaidInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        cycleCode: billingCycles.cycleCode,
        dueDate: invoices.dueDate,
        totalAmount: invoices.totalAmount,
        amountPaidCache: invoices.amountPaidCache,
        balanceDueCache: invoices.balanceDueCache,
      })
      .from(invoices)
      .innerJoin(billingCycles, eq(invoices.billingCycleId, billingCycles.id))
      .where(
        and(
          inArray(invoices.serviceAccountId, accountIds),
          or(eq(invoices.status, "UNPAID"), eq(invoices.status, "PARTIALLY_PAID"), eq(invoices.status, "OVERDUE"))
        )
      )
      .orderBy(asc(invoices.dueDate), asc(invoices.invoiceDate), asc(invoices.createdAt));

    let remainingToAllocate = paymentAmount;
    const allocationPreviews: InvoiceAllocationPreview[] = [];

    for (const inv of unpaidInvoices) {
      const balanceDue = Money.fromDecimal(inv.balanceDueCache);
      if (balanceDue.isZero()) continue;

      if (remainingToAllocate.isGreaterThan(Money.zero())) {
        const alloc = Money.min(remainingToAllocate, balanceDue);
        const remainingBal = balanceDue.minus(alloc);
        remainingToAllocate = remainingToAllocate.minus(alloc);

        allocationPreviews.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          cycleCode: inv.cycleCode,
          dueDate: inv.dueDate,
          currentBalance: balanceDue.toDecimalString(),
          allocatedAmount: alloc.toDecimalString(),
          remainingBalance: remainingBal.toDecimalString(),
          resultingStatus: remainingBal.isZero() ? "PAID" : "PARTIALLY_PAID",
        });
      }
    }

    const totalAllocated = paymentAmount.minus(remainingToAllocate);

    return {
      totalPaymentAmount: paymentAmount.toDecimalString(),
      totalAllocated: totalAllocated.toDecimalString(),
      advanceCredit: remainingToAllocate.toDecimalString(),
      invoiceAllocations: allocationPreviews,
    };
  }

  /**
   * Process & Post Payment Transaction
   * 
   * Atomically:
   * 1. Validates input and prevents duplicate references (AT-05).
   * 2. Mints authoritative receipt number (BCIS-REC-YYYY-NNNN).
   * 3. Allocates strictly oldest-first across unpaid invoices (AT-01, AT-02, AT-04).
   * 4. Updates invoice status, cached balances, and service account balance due.
   * 5. Captures any overpayment as advance credit (AT-03).
   * 6. Posts ledger credit in the subscriber's financial journal.
   */
  public async createPayment(payload: CreatePaymentPayload, cashierUserId: string, externalTx?: any) {
    const amountPaid = Money.fromDecimal(payload.amountPaid);
    if (amountPaid.isNegative() || amountPaid.isZero()) {
      throw new Error("Payment amount must be greater than zero");
    }

    // Tendered / change calculation for CASH
    let changeAmount: Money | null = null;
    let tenderedAmount: Money | null = null;
    if (payload.tenderedAmount !== undefined && payload.tenderedAmount !== null && payload.tenderedAmount !== "") {
      tenderedAmount = Money.fromDecimal(payload.tenderedAmount);
      if (tenderedAmount.isLessThan(amountPaid)) {
        throw new Error("Tendered cash amount cannot be less than the payment amount due");
      }
      changeAmount = tenderedAmount.minus(amountPaid);
    }

    // AT-05 Invariant: Duplicate GCash / Reference Protection
    const trimmedRef = payload.referenceNumber?.trim();
    if (trimmedRef) {
      const q = externalTx || db;
      const [existingRef] = await q
        .select({ id: payments.id, receiptNumber: payments.receiptNumber })
        .from(payments)
        .where(and(eq(payments.referenceNumber, trimmedRef), eq(payments.isReversed, false)))
        .limit(1);

      if (existingRef) {
        throw new Error(
          `Duplicate payment reference '${trimmedRef}'. A non-reversed payment with Receipt #${existingRef.receiptNumber} already exists with this reference.`
        );
      }
    }

    const todayStr: string = payload.paymentDate || (new Date().toISOString().split("T")[0] as string);

    const executeInTx = async (tx: any) => {
      // 1. Verify subscriber
      const [sub] = await tx
        .select()
        .from(subscribers)
        .where(eq(subscribers.id, payload.subscriberId))
        .limit(1);

      if (!sub) {
        throw new Error(`Subscriber with ID '${payload.subscriberId}' not found`);
      }

      // 2. Find eligible service accounts
      const accounts = await tx
        .select()
        .from(serviceAccounts)
        .where(
          payload.serviceAccountId
            ? and(
                eq(serviceAccounts.id, payload.serviceAccountId),
                eq(serviceAccounts.subscriberId, payload.subscriberId)
              )
            : eq(serviceAccounts.subscriberId, payload.subscriberId)
        );

      if (accounts.length === 0) {
        throw new Error("No service accounts found for payment allocation");
      }

      const accountIds = accounts.map((a: { id: string }) => a.id);

      // 3. Query unpaid/partially-paid invoices strictly OLDEST FIRST (AT-04)
      const unpaidInvoices = await tx
        .select()
        .from(invoices)
        .where(
          and(
            inArray(invoices.serviceAccountId, accountIds),
            or(eq(invoices.status, "UNPAID"), eq(invoices.status, "PARTIALLY_PAID"), eq(invoices.status, "OVERDUE"))
          )
        )
        .orderBy(asc(invoices.dueDate), asc(invoices.invoiceDate), asc(invoices.createdAt));

      // 4. Mint authoritative receipt number
      const receiptNumber = await getNextDocumentNumber("BCIS-REC", tx);

      // 5. Allocate payment oldest-first
      let remainingToAllocate = amountPaid;
      const createdAllocations: Array<{
        invoiceId: string;
        invoiceNumber: string;
        allocatedAmount: string;
        previousBalance: string;
        remainingBalance: string;
        status: string;
      }> = [];

      for (const inv of unpaidInvoices) {
        const balanceDue = Money.fromDecimal(inv.balanceDueCache);
        if (balanceDue.isZero()) continue;

        if (remainingToAllocate.isGreaterThan(Money.zero())) {
          const alloc = Money.min(remainingToAllocate, balanceDue);
          const newBal = balanceDue.minus(alloc);
          const newPaid = Money.fromDecimal(inv.amountPaidCache).plus(alloc);
          const newStatus = newBal.isZero() ? "PAID" : "PARTIALLY_PAID";

          // Update invoice
          await tx
            .update(invoices)
            .set({
              amountPaidCache: newPaid.toDecimalString(),
              balanceDueCache: newBal.toDecimalString(),
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, inv.id));

          // Decrement service account cached balance due
          const currentSa = accounts.find((a: { id: string; cachedBalanceDue: string }) => a.id === inv.serviceAccountId);
          if (currentSa) {
            const currentSaBal = Money.fromDecimal(currentSa.cachedBalanceDue);
            const updatedSaBal = Money.max(Money.zero(), currentSaBal.minus(alloc));
            currentSa.cachedBalanceDue = updatedSaBal.toDecimalString();
            await tx
              .update(serviceAccounts)
              .set({
                cachedBalanceDue: updatedSaBal.toDecimalString(),
                updatedAt: new Date(),
              })
              .where(eq(serviceAccounts.id, currentSa.id));
          }

          remainingToAllocate = remainingToAllocate.minus(alloc);

          createdAllocations.push({
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            allocatedAmount: alloc.toDecimalString(),
            previousBalance: balanceDue.toDecimalString(),
            remainingBalance: newBal.toDecimalString(),
            status: newStatus,
          });
        }
      }

      const totalAllocated = amountPaid.minus(remainingToAllocate);
      const advanceAmount = remainingToAllocate;

      // 6. Insert payments record
      const [payment] = await tx
        .insert(payments)
        .values({
          receiptNumber,
          subscriberId: payload.subscriberId,
          serviceAccountId: payload.serviceAccountId || (accounts.length === 1 ? accounts[0]!.id : null),
          paymentDate: todayStr,
          paymentMethod: payload.paymentMethod,
          referenceNumber: trimmedRef || null,
          amountPaid: amountPaid.toDecimalString(),
          tenderedAmount: tenderedAmount ? tenderedAmount.toDecimalString() : null,
          changeAmount: changeAmount ? changeAmount.toDecimalString() : null,
          allocatedAmount: totalAllocated.toDecimalString(),
          advanceAmount: advanceAmount.toDecimalString(),
          status: "POSTED",
          cashierId: cashierUserId,
          collectorId: payload.collectorId || null,
          notes: payload.notes?.trim() || null,
        })
        .returning();

      if (!payment) {
        throw new Error("Failed to create payment record");
      }

      // 7. Insert payment_allocations records
      for (const a of createdAllocations) {
        await tx.insert(paymentAllocations).values({
          paymentId: payment.id,
          invoiceId: a.invoiceId,
          allocatedAmount: a.allocatedAmount,
          previousInvoiceBalance: a.previousBalance,
          remainingInvoiceBalance: a.remainingBalance,
        });
      }

      // 8. Post Ledger Credit
      const targetServiceAccountId: string | null =
        payload.serviceAccountId || (accounts.length > 0 ? accounts[0]!.id : null);

      if (targetServiceAccountId) {
        const targetSaId = targetServiceAccountId;
        const [maxEntry] = await tx
          .select({ maxNo: sql<number>`COALESCE(MAX(${ledgerEntries.entryNo}), 0)` })
          .from(ledgerEntries)
          .where(eq(ledgerEntries.serviceAccountId, targetSaId));

        const nextEntryNo = (maxEntry?.maxNo || 0) + 1;

        await tx.insert(ledgerEntries).values({
          serviceAccountId: targetSaId,
          entryNo: nextEntryNo,
          entryDate: todayStr,
          referenceType: "PAYMENT",
          referenceId: payment.id,
          description: `Official Receipt ${receiptNumber} (${payload.paymentMethod}${
            trimmedRef ? ` Ref #${trimmedRef}` : ""
          })`,
          debitAmount: "0.00",
          creditAmount: amountPaid.toDecimalString(),
          currency: "PHP",
          createdBy: cashierUserId,
        });
      }

      return {
        payment,
        allocations: createdAllocations,
        advanceCredit: advanceAmount.toDecimalString(),
        message: `Payment of ₱${amountPaid.toDecimalString()} posted successfully. Receipt #${receiptNumber} generated.`,
      };
    };

    if (externalTx) {
      return await executeInTx(externalTx);
    }
    return await db.transaction(executeInTx);
  }

  /**
   * Reverse Payment (AT-06)
   * 
   * Authorized reversal workflow:
   * 1. Re-opens all previously allocated invoices (restores UNPAID/PARTIALLY_PAID status and balances).
   * 2. Restores service accounts cached balance due.
   * 3. Marks payment as REVERSED with audit timestamp, actor, and reason.
   * 4. Posts an offsetting DEBIT to the immutable ledger.
   */
  public async reversePayment(paymentId: string, reason: string, actorUserId: string) {
    if (!reason || reason.trim().length < 5) {
      throw new Error("A valid operational reason (min 5 characters) is required to reverse a payment");
    }

    return await db.transaction(async (tx) => {
      // 1. Fetch payment
      const [pmt] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);

      if (!pmt) {
        throw new Error(`Payment with ID '${paymentId}' not found`);
      }

      if (pmt.isReversed) {
        throw new Error(`Payment Receipt #${pmt.receiptNumber} has already been reversed`);
      }

      // 2. Fetch linked allocations
      const allocations = await tx
        .select()
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, paymentId));

      // 3. Restore invoice balances and statuses
      for (const alloc of allocations) {
        const [inv] = await tx
          .select()
          .from(invoices)
          .where(eq(invoices.id, alloc.invoiceId))
          .limit(1);

        if (inv) {
          const allocAmt = Money.fromDecimal(alloc.allocatedAmount);
          const currentPaid = Money.fromDecimal(inv.amountPaidCache);
          const currentBal = Money.fromDecimal(inv.balanceDueCache);
          const totalAmt = Money.fromDecimal(inv.totalAmount);

          const restoredPaid = Money.max(Money.zero(), currentPaid.minus(allocAmt));
          const restoredBal = currentBal.plus(allocAmt);
          const restoredStatus = restoredBal.equals(totalAmt) ? "UNPAID" : "PARTIALLY_PAID";

          await tx
            .update(invoices)
            .set({
              amountPaidCache: restoredPaid.toDecimalString(),
              balanceDueCache: restoredBal.toDecimalString(),
              status: restoredStatus,
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, inv.id));

          // Restore service account cached balance due
          const [sa] = await tx
            .select()
            .from(serviceAccounts)
            .where(eq(serviceAccounts.id, inv.serviceAccountId))
            .limit(1);

          if (sa) {
            const restoredSaBal = Money.fromDecimal(sa.cachedBalanceDue).plus(allocAmt);
            await tx
              .update(serviceAccounts)
              .set({
                cachedBalanceDue: restoredSaBal.toDecimalString(),
                updatedAt: new Date(),
              })
              .where(eq(serviceAccounts.id, sa.id));
          }
        }
      }

      // 4. Mark payment as reversed
      const now = new Date();
      const [updatedPayment] = await tx
        .update(payments)
        .set({
          isReversed: true,
          status: "REVERSED",
          reversedAt: now,
          reversedBy: actorUserId,
          reversalReason: reason.trim(),
          updatedAt: now,
        })
        .where(eq(payments.id, paymentId))
        .returning();

      // 5. Post Compensatory Debit to Ledger
      const targetServiceAccountId = pmt.serviceAccountId;
      if (targetServiceAccountId) {
        const targetSaId = targetServiceAccountId;
        const [maxEntry] = await tx
          .select({ maxNo: sql<number>`COALESCE(MAX(${ledgerEntries.entryNo}), 0)` })
          .from(ledgerEntries)
          .where(eq(ledgerEntries.serviceAccountId, targetSaId));

        const nextEntryNo = (maxEntry?.maxNo || 0) + 1;

        await tx.insert(ledgerEntries).values({
          serviceAccountId: targetSaId,
          entryNo: nextEntryNo,
          entryDate: (now.toISOString().split("T")[0] as string),
          referenceType: "REVERSAL",
          referenceId: pmt.id,
          description: `Payment Reversal for ${pmt.receiptNumber}: ${reason.trim()}`,
          debitAmount: pmt.amountPaid,
          creditAmount: "0.00",
          currency: "PHP",
          createdBy: actorUserId,
        });
      }

      return {
        payment: updatedPayment,
        message: `Payment Receipt #${pmt.receiptNumber} successfully reversed. Invoices restored.`,
      };
    });
  }

  /**
   * List Payments with Search, Filter & Pagination
   */
  public async listPayments(params: ListPaymentsParams) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 15));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (params.status) {
      conditions.push(eq(payments.status, params.status));
    }

    if (params.paymentMethod) {
      conditions.push(eq(payments.paymentMethod, params.paymentMethod));
    }

    if (params.subscriberId) {
      conditions.push(eq(payments.subscriberId, params.subscriberId));
    }

    if (params.startDate) {
      conditions.push(sql`${payments.paymentDate} >= ${params.startDate}`);
    }

    if (params.endDate) {
      conditions.push(sql`${payments.paymentDate} <= ${params.endDate}`);
    }

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(payments.receiptNumber, q),
          ilike(payments.referenceNumber, q),
          ilike(subscribers.accountNumber, q),
          ilike(subscribers.firstName, q),
          ilike(subscribers.lastName, q),
          ilike(subscribers.businessName, q)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(payments)
      .innerJoin(subscribers, eq(payments.subscriberId, subscribers.id))
      .where(whereClause);

    const total = Number(countResult?.count || 0);

    const data = await db
      .select({
        payment: payments,
        subscriber: {
          id: subscribers.id,
          accountNumber: subscribers.accountNumber,
          firstName: subscribers.firstName,
          lastName: subscribers.lastName,
          businessName: subscribers.businessName,
          primaryContactNumber: subscribers.primaryContactNumber,
        },
        cashier: {
          id: users.id,
          displayName: users.displayName,
          username: users.username,
        },
        collector: {
          id: collectors.id,
          collectorCode: collectors.collectorCode,
          name: collectors.name,
        },
      })
      .from(payments)
      .innerJoin(subscribers, eq(payments.subscriberId, subscribers.id))
      .innerJoin(users, eq(payments.cashierId, users.id))
      .leftJoin(collectors, eq(payments.collectorId, collectors.id))
      .where(whereClause)
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: data.map((d) => ({
        ...d.payment,
        subscriber: d.subscriber,
        cashier: d.cashier,
        collector: d.collector,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get Single Payment by ID (for receipt display and audit)
   */
  public async getPaymentById(id: string) {
    const [row] = await db
      .select({
        payment: payments,
        subscriber: {
          id: subscribers.id,
          accountNumber: subscribers.accountNumber,
          firstName: subscribers.firstName,
          middleName: subscribers.middleName,
          lastName: subscribers.lastName,
          businessName: subscribers.businessName,
          primaryContactNumber: subscribers.primaryContactNumber,
          email: subscribers.email,
        },
        cashier: {
          id: users.id,
          displayName: users.displayName,
          username: users.username,
        },
        collector: {
          id: collectors.id,
          collectorCode: collectors.collectorCode,
          name: collectors.name,
        },
      })
      .from(payments)
      .innerJoin(subscribers, eq(payments.subscriberId, subscribers.id))
      .innerJoin(users, eq(payments.cashierId, users.id))
      .leftJoin(collectors, eq(payments.collectorId, collectors.id))
      .where(eq(payments.id, id))
      .limit(1);

    if (!row) {
      throw new Error(`Payment with ID '${id}' not found`);
    }

    // Hydrate allocations
    const allocations = await db
      .select({
        allocation: paymentAllocations,
        invoice: {
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          cycleCode: billingCycles.cycleCode,
          dueDate: invoices.dueDate,
          totalAmount: invoices.totalAmount,
          status: invoices.status,
          servicePlanName: servicePlans.name,
        },
      })
      .from(paymentAllocations)
      .innerJoin(invoices, eq(paymentAllocations.invoiceId, invoices.id))
      .innerJoin(billingCycles, eq(invoices.billingCycleId, billingCycles.id))
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(servicePlans, eq(serviceAccounts.servicePlanId, servicePlans.id))
      .where(eq(paymentAllocations.paymentId, id));

    return {
      ...row.payment,
      subscriber: row.subscriber,
      cashier: row.cashier,
      collector: row.collector,
      allocations: allocations.map((a) => ({
        ...a.allocation,
        invoice: a.invoice,
      })),
    };
  }
}

export const paymentService = new PaymentService();
