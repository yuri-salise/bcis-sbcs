import { eq, and, or, sql, desc, asc, ilike, inArray } from "drizzle-orm";
import { db } from "../../db/db.js";
import {
  collectionBatches,
  collectionBatchAccounts,
  collectorRemittances,
  collectors,
  collectionAreas,
  serviceAccounts,
  subscriberAddresses,
  subscribers,
  invoices,
  payments,
  users,
} from "../../db/schema/index.js";
import { Money } from "../../shared/money/money.js";
import { getNextDocumentNumber } from "../../db/sequences.js";
import { PaymentService } from "../payments/payment.service.js";
import { AppError } from "../../app/errors/app-error.js";

export interface ListBatchesParams {
  status?: string;
  collectorId?: string;
  collectionAreaId?: string;
  date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateBatchPayload {
  collectorId: string;
  collectionAreaId: string;
  collectionDate: string; // YYYY-MM-DD
  serviceAccountIds?: string[];
  notes?: string;
}

export interface RecordFieldCollectionPayload {
  batchAccountId: string;
  amount: string;
  paymentMethod: "CASH" | "GCASH" | "BANK_TRANSFER" | "CHECK" | "OTHER";
  referenceNumber?: string;
  notes?: string;
}

export interface RecordRemittancePayload {
  remittedCash: string;
  remittedGcash?: string;
  remittedBankTransfer?: string;
  otherNonCash?: string;
  notes?: string;
}

export class CollectionsService {
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
  }

  /**
   * List Collection Batches
   */
  public async listBatches(params: ListBatchesParams = {}) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (params.status && params.status !== "ALL") {
      conditions.push(eq(collectionBatches.status, params.status));
    }
    if (params.collectorId) {
      conditions.push(eq(collectionBatches.collectorId, params.collectorId));
    }
    if (params.collectionAreaId) {
      conditions.push(eq(collectionBatches.collectionAreaId, params.collectionAreaId));
    }
    if (params.date) {
      conditions.push(eq(collectionBatches.collectionDate, params.date));
    }
    if (params.search && params.search.trim()) {
      const term = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(collectionBatches.batchNumber, term),
          ilike(collectors.name, term),
          ilike(collectionAreas.name, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(collectionBatches)
      .leftJoin(collectors, eq(collectionBatches.collectorId, collectors.id))
      .leftJoin(collectionAreas, eq(collectionBatches.collectionAreaId, collectionAreas.id))
      .where(whereClause);

    const total = countResult?.count || 0;

    const rows = await db
      .select({
        id: collectionBatches.id,
        batchNumber: collectionBatches.batchNumber,
        collectionDate: collectionBatches.collectionDate,
        status: collectionBatches.status,
        expectedCash: collectionBatches.expectedCash,
        expectedNonCash: collectionBatches.expectedNonCash,
        expectedTotal: collectionBatches.expectedTotal,
        collectedCash: collectionBatches.collectedCash,
        collectedNonCash: collectionBatches.collectedNonCash,
        collectedTotal: collectionBatches.collectedTotal,
        remittedCash: collectionBatches.remittedCash,
        difference: collectionBatches.difference,
        shortageAmount: collectionBatches.shortageAmount,
        overageAmount: collectionBatches.overageAmount,
        submittedAt: collectionBatches.submittedAt,
        reconciledAt: collectionBatches.reconciledAt,
        closedAt: collectionBatches.closedAt,
        notes: collectionBatches.notes,
        createdAt: collectionBatches.createdAt,
        collectorId: collectors.id,
        collectorCode: collectors.collectorCode,
        collectorName: collectors.name,
        collectionAreaId: collectionAreas.id,
        collectionAreaCode: collectionAreas.code,
        collectionAreaName: collectionAreas.name,
        openedByUsername: users.username,
        openedByDisplayName: users.displayName,
      })
      .from(collectionBatches)
      .leftJoin(collectors, eq(collectionBatches.collectorId, collectors.id))
      .leftJoin(collectionAreas, eq(collectionBatches.collectionAreaId, collectionAreas.id))
      .leftJoin(users, eq(collectionBatches.openedBy, users.id))
      .where(whereClause)
      .orderBy(desc(collectionBatches.collectionDate), desc(collectionBatches.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows,
      items: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Create New Field Collection Batch
   */
  public async createBatch(payload: CreateBatchPayload, openedByUserId: string) {
    // 1. Validate Collector
    const [collector] = await db
      .select()
      .from(collectors)
      .where(and(eq(collectors.id, payload.collectorId), eq(collectors.isActive, true)))
      .limit(1);

    if (!collector) {
      throw new Error("Designated collector not found or is currently inactive.");
    }

    // 2. Validate Area
    const [area] = await db
      .select()
      .from(collectionAreas)
      .where(eq(collectionAreas.id, payload.collectionAreaId))
      .limit(1);

    if (!area) {
      throw new Error("Specified collection area does not exist.");
    }

    // 3. Find candidate service accounts with outstanding invoices/balances in this area
    const candidateQuery = db
      .select({
        id: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        subscriberId: serviceAccounts.subscriberId,
        cachedBalanceDue: serviceAccounts.cachedBalanceDue,
      })
      .from(serviceAccounts)
      .where(
        payload.serviceAccountIds && payload.serviceAccountIds.length > 0
          ? and(
              inArray(serviceAccounts.id, payload.serviceAccountIds),
              eq(serviceAccounts.collectionAreaId, payload.collectionAreaId)
            )
          : and(
              eq(serviceAccounts.collectionAreaId, payload.collectionAreaId),
              or(eq(serviceAccounts.status, "ACTIVE"), eq(serviceAccounts.status, "SUSPENDED"))
            )
      );

    const eligibleAccounts = await candidateQuery;

    return await db.transaction(async (tx) => {
      // Mint authoritative batch number
      const batchNumber = await getNextDocumentNumber("BCIS-BATCH", tx);

      let expectedCash = Money.zero();

      // Find latest unpaid invoices for these accounts
      const batchAccountInserts = [];

      for (const sa of eligibleAccounts) {
        const balDue = Money.fromDecimal(sa.cachedBalanceDue);
        // Only include accounts with outstanding balance due
        if (balDue.isGreaterThan(Money.zero())) {
          // Find latest unpaid invoice
          const [unpaidInv] = await tx
            .select({ id: invoices.id })
            .from(invoices)
            .where(
              and(
                eq(invoices.serviceAccountId, sa.id),
                or(eq(invoices.status, "UNPAID"), eq(invoices.status, "PARTIALLY_PAID"), eq(invoices.status, "OVERDUE"))
              )
            )
            .orderBy(asc(invoices.dueDate))
            .limit(1);

          expectedCash = expectedCash.plus(balDue);
          batchAccountInserts.push({
            serviceAccountId: sa.id,
            invoiceId: unpaidInv?.id || null,
            expectedAmount: balDue.toDecimalString(),
          });
        }
      }

      const [batch] = await tx
        .insert(collectionBatches)
        .values({
          batchNumber,
          collectorId: payload.collectorId,
          collectionAreaId: payload.collectionAreaId,
          collectionDate: payload.collectionDate,
          status: "OPEN",
          expectedCash: expectedCash.toDecimalString(),
          expectedNonCash: "0.00",
          expectedTotal: expectedCash.toDecimalString(),
          openedBy: openedByUserId,
          notes: payload.notes?.trim() || null,
        })
        .returning();

      if (!batch) {
        throw new AppError("Failed to create collection batch", 500, "BATCH_CREATION_FAILED");
      }

      let insertedAccounts: any[] = [];
      if (batchAccountInserts.length > 0) {
        insertedAccounts = await tx
          .insert(collectionBatchAccounts)
          .values(
            batchAccountInserts.map((bai) => ({
              collectionBatchId: batch.id,
              serviceAccountId: bai.serviceAccountId,
              invoiceId: bai.invoiceId,
              expectedAmount: bai.expectedAmount,
              collectedAmount: "0.00",
              status: "UNPAID",
            }))
          )
          .returning();
      }

      return {
        batch,
        accounts: insertedAccounts,
        accountsCount: batchAccountInserts.length,
        expectedTotal: expectedCash.toDecimalString(),
        message: `Collection Batch #${batchNumber} created with ${batchAccountInserts.length} route accounts.`,
      };
    });
  }

  /**
   * Get Batch Details by ID
   */
  public async getBatchById(id: string) {
    const [batch] = await db
      .select({
        id: collectionBatches.id,
        batchNumber: collectionBatches.batchNumber,
        collectionDate: collectionBatches.collectionDate,
        status: collectionBatches.status,
        expectedCash: collectionBatches.expectedCash,
        expectedNonCash: collectionBatches.expectedNonCash,
        expectedTotal: collectionBatches.expectedTotal,
        collectedCash: collectionBatches.collectedCash,
        collectedNonCash: collectionBatches.collectedNonCash,
        collectedTotal: collectionBatches.collectedTotal,
        remittedCash: collectionBatches.remittedCash,
        difference: collectionBatches.difference,
        shortageAmount: collectionBatches.shortageAmount,
        overageAmount: collectionBatches.overageAmount,
        submittedAt: collectionBatches.submittedAt,
        reconciledAt: collectionBatches.reconciledAt,
        closedAt: collectionBatches.closedAt,
        notes: collectionBatches.notes,
        createdAt: collectionBatches.createdAt,
        collectorId: collectors.id,
        collectorCode: collectors.collectorCode,
        collectorName: collectors.name,
        collectorContact: collectors.contactNumber,
        collectionAreaId: collectionAreas.id,
        collectionAreaCode: collectionAreas.code,
        collectionAreaName: collectionAreas.name,
        openedByUsername: users.username,
        openedByDisplayName: users.displayName,
      })
      .from(collectionBatches)
      .leftJoin(collectors, eq(collectionBatches.collectorId, collectors.id))
      .leftJoin(collectionAreas, eq(collectionBatches.collectionAreaId, collectionAreas.id))
      .leftJoin(users, eq(collectionBatches.openedBy, users.id))
      .where(eq(collectionBatches.id, id))
      .limit(1);

    if (!batch) {
      throw new Error(`Collection batch with ID '${id}' not found`);
    }

    // Fetch batch accounts with subscriber info
    const accounts = await db
      .select({
        id: collectionBatchAccounts.id,
        collectionBatchId: collectionBatchAccounts.collectionBatchId,
        serviceAccountId: collectionBatchAccounts.serviceAccountId,
        invoiceId: collectionBatchAccounts.invoiceId,
        expectedAmount: collectionBatchAccounts.expectedAmount,
        collectedAmount: collectionBatchAccounts.collectedAmount,
        paymentId: collectionBatchAccounts.paymentId,
        status: collectionBatchAccounts.status,
        notes: collectionBatchAccounts.notes,
        collectedAt: collectionBatchAccounts.collectedAt,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        serviceStatus: serviceAccounts.status,
        subscriberId: subscribers.id,
        subscriberAccountNumber: subscribers.accountNumber,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        subscriberContact: subscribers.primaryContactNumber,
        addressLine1: subscriberAddresses.line1,
        addressBarangay: subscriberAddresses.barangay,
        paymentReceiptNumber: payments.receiptNumber,
      })
      .from(collectionBatchAccounts)
      .leftJoin(serviceAccounts, eq(collectionBatchAccounts.serviceAccountId, serviceAccounts.id))
      .leftJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id))
      .leftJoin(subscriberAddresses, eq(serviceAccounts.installationAddressId, subscriberAddresses.id))
      .leftJoin(payments, eq(collectionBatchAccounts.paymentId, payments.id))
      .where(eq(collectionBatchAccounts.collectionBatchId, id))
      .orderBy(asc(subscribers.lastName), asc(subscribers.firstName));

    // Fetch remittances for this batch
    const remittances = await db
      .select({
        id: collectorRemittances.id,
        remittanceNumber: collectorRemittances.remittanceNumber,
        remittedCash: collectorRemittances.remittedCash,
        remittedGcash: collectorRemittances.remittedGcash,
        remittedBankTransfer: collectorRemittances.remittedBankTransfer,
        otherNonCash: collectorRemittances.otherNonCash,
        totalRemitted: collectorRemittances.totalRemitted,
        expectedCash: collectorRemittances.expectedCash,
        shortageAmount: collectorRemittances.shortageAmount,
        overageAmount: collectorRemittances.overageAmount,
        receivedAt: collectorRemittances.receivedAt,
        notes: collectorRemittances.notes,
        receivedByUsername: users.username,
        receivedByDisplayName: users.displayName,
      })
      .from(collectorRemittances)
      .leftJoin(users, eq(collectorRemittances.receivedBy, users.id))
      .where(eq(collectorRemittances.collectionBatchId, id))
      .orderBy(desc(collectorRemittances.receivedAt));

    const enrichedAccounts = accounts.map((acc) => ({
      ...acc,
      subscriberDisplayName:
        acc.subscriberBusinessName ||
        `${acc.subscriberFirstName || ""} ${acc.subscriberLastName || ""}`.trim(),
    }));

    return {
      batch,
      accounts: enrichedAccounts,
      remittances,
    };
  }

  /**
   * Record Field Collection for a Batch Account
   * Mints Official Receipt, updates invoices, credits ledger, and advances batch collected totals.
   */
  public async recordFieldCollection(
    batchId: string,
    payload: RecordFieldCollectionPayload,
    collectorUserId: string
  ) {
    const amountVal = Money.fromDecimal(payload.amount);
    if (amountVal.isNegative() || amountVal.isZero()) {
      throw new Error("Collection amount must be greater than zero");
    }

    return await db.transaction(async (tx) => {
      // 1. Fetch batch
      const [batch] = await tx
        .select()
        .from(collectionBatches)
        .where(eq(collectionBatches.id, batchId))
        .limit(1);

      if (!batch) {
        throw new Error(`Collection batch with ID '${batchId}' not found`);
      }

      if (["REMITTED", "RECONCILED", "CLOSED"].includes(batch.status)) {
        throw new Error(`Cannot record collections on a batch in '${batch.status}' status.`);
      }

      // 2. Fetch batch account
      const [batchAccount] = await tx
        .select()
        .from(collectionBatchAccounts)
        .where(
          and(
            eq(collectionBatchAccounts.id, payload.batchAccountId),
            eq(collectionBatchAccounts.collectionBatchId, batchId)
          )
        )
        .limit(1);

      if (!batchAccount) {
        throw new Error("Batch account entry not found.");
      }

      if (batchAccount.status === "COLLECTED") {
        throw new Error("Collection has already been posted for this account in this batch.");
      }

      // 3. Find service account & subscriber
      const [sa] = await tx
        .select()
        .from(serviceAccounts)
        .where(eq(serviceAccounts.id, batchAccount.serviceAccountId))
        .limit(1);

      if (!sa) {
        throw new Error("Associated service account not found.");
      }

      // 4. Create authoritative payment with oldest-first allocation & receipt
      const paymentResult = await this.paymentService.createPayment(
        {
          subscriberId: sa.subscriberId,
          serviceAccountId: sa.id,
          paymentDate: batch.collectionDate,
          paymentMethod: payload.paymentMethod,
          referenceNumber: payload.referenceNumber,
          amountPaid: amountVal.toDecimalString(),
          collectorId: batch.collectorId,
          notes: `Batch #${batch.batchNumber} field collection${payload.notes ? ` - ${payload.notes.trim()}` : ""}`,
        },
        collectorUserId,
        tx
      );

      // 5. Update batch account status & collected amount
      const expectedAmountVal = Money.fromDecimal(batchAccount.expectedAmount);
      const resultingStatus = amountVal.isGreaterThanOrEqual(expectedAmountVal) ? "COLLECTED" : "PARTIAL";

      const [updatedAccount] = await tx
        .update(collectionBatchAccounts)
        .set({
          collectedAmount: amountVal.toDecimalString(),
          paymentId: paymentResult.payment.id,
          status: resultingStatus,
          collectedAt: new Date(),
          notes: payload.notes ? payload.notes.trim() : null,
          updatedAt: new Date(),
        })
        .where(eq(collectionBatchAccounts.id, batchAccount.id))
        .returning();

      // 6. Update batch totals
      const isCash = payload.paymentMethod === "CASH";
      const currentCash = Money.fromDecimal(batch.collectedCash);
      const currentNonCash = Money.fromDecimal(batch.collectedNonCash);
      const currentTotal = Money.fromDecimal(batch.collectedTotal);

      const newCash = isCash ? currentCash.plus(amountVal) : currentCash;
      const newNonCash = !isCash ? currentNonCash.plus(amountVal) : currentNonCash;
      const newTotal = currentTotal.plus(amountVal);

      const [updatedBatch] = await tx
        .update(collectionBatches)
        .set({
          status: "IN_PROGRESS",
          collectedCash: newCash.toDecimalString(),
          collectedNonCash: newNonCash.toDecimalString(),
          collectedTotal: newTotal.toDecimalString(),
          updatedAt: new Date(),
        })
        .where(eq(collectionBatches.id, batch.id))
        .returning();

      if (!updatedAccount || !updatedBatch) {
        throw new AppError("Failed to record collection", 500, "COLLECTION_FAILED");
      }

      return {
        batch: updatedBatch,
        account: updatedAccount,
        payment: paymentResult.payment,
        receiptNumber: paymentResult.payment.receiptNumber,
        paymentReceiptNumber: paymentResult.payment.receiptNumber,
        allocations: paymentResult.allocations,
        advanceCredit: paymentResult.advanceCredit,
        message: `Collected ₱${amountVal.toDecimalString()} from account. Official Receipt #${paymentResult.payment.receiptNumber} issued.`,
      };
    });
  }

  /**
   * Submit Batch (Route Run Completed)
   */
  public async submitBatch(batchId: string) {
    const [batch] = await db
      .select()
      .from(collectionBatches)
      .where(eq(collectionBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new AppError(`Collection batch with ID '${batchId}' not found`, 404, "BATCH_NOT_FOUND");
    }

    if (["SUBMITTED", "REMITTED", "RECONCILED", "CLOSED"].includes(batch.status)) {
      throw new AppError(`Batch has already been submitted or closed (current status: ${batch.status})`, 400, "INVALID_BATCH_STATUS");
    }

    const [updated] = await db
      .update(collectionBatches)
      .set({
        status: "SUBMITTED",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(collectionBatches.id, batchId))
      .returning();

    if (!updated) {
      throw new AppError("Failed to submit collection batch", 500, "BATCH_UPDATE_FAILED");
    }

    return {
      batch: updated,
      status: updated.status,
      message: `Batch #${batch.batchNumber} marked as submitted. Ready for remittance handover.`,
    };
  }

  /**
   * Record Collector Cash/Non-Cash Remittance (AT-07 & AT-08)
   * 
   * Atomically:
   * 1. Compares physical cash remitted against cash collected.
   * 2. Computes difference:
   *    - Difference = remittedCash - expectedCash (collectedCash).
   *    - If difference == 0 -> Balanced batch (AT-07).
   *    - If difference < 0 -> Shortage explicitly recorded (AT-08).
   *    - If difference > 0 -> Overage explicitly recorded.
   * 3. Mints authoritative remittance number (BCIS-REMIT-YYYY-NNNN).
   * 4. Updates batch status to REMITTED.
   */
  public async recordRemittance(
    batchId: string,
    payload: RecordRemittancePayload,
    receivedByUserId: string
  ) {
    const cashRemitted = Money.fromDecimal(payload.remittedCash);
    if (cashRemitted.isNegative()) {
      throw new Error("Remitted cash cannot be negative");
    }

    const gcashRemitted = Money.fromDecimal(payload.remittedGcash || "0.00");
    const bankRemitted = Money.fromDecimal(payload.remittedBankTransfer || "0.00");
    const otherRemitted = Money.fromDecimal(payload.otherNonCash || "0.00");
    const totalRemitted = cashRemitted.plus(gcashRemitted).plus(bankRemitted).plus(otherRemitted);

    return await db.transaction(async (tx) => {
      const [batch] = await tx
        .select()
        .from(collectionBatches)
        .where(eq(collectionBatches.id, batchId))
        .limit(1);

      if (!batch) {
        throw new Error(`Collection batch with ID '${batchId}' not found`);
      }

      if (["RECONCILED", "CLOSED"].includes(batch.status)) {
        throw new Error(`Cannot record remittance on a batch that is already '${batch.status}'`);
      }

      // Compute variance
      const cashCollected = Money.fromDecimal(batch.collectedCash);
      const diff = cashRemitted.minus(cashCollected);

      let shortage = Money.zero();
      let overage = Money.zero();

      if (diff.isNegative()) {
        shortage = diff.abs();
      } else if (diff.isGreaterThan(Money.zero())) {
        overage = diff;
      }

      const remittanceNumber = await getNextDocumentNumber("BCIS-REMIT", tx);

      const [remittance] = await tx
        .insert(collectorRemittances)
        .values({
          collectionBatchId: batch.id,
          remittanceNumber,
          remittedCash: cashRemitted.toDecimalString(),
          remittedGcash: gcashRemitted.toDecimalString(),
          remittedBankTransfer: bankRemitted.toDecimalString(),
          otherNonCash: otherRemitted.toDecimalString(),
          totalRemitted: totalRemitted.toDecimalString(),
          expectedCash: cashCollected.toDecimalString(),
          shortageAmount: shortage.toDecimalString(),
          overageAmount: overage.toDecimalString(),
          receivedBy: receivedByUserId,
          notes: payload.notes?.trim() || null,
        })
        .returning();

      const [updatedBatch] = await tx
        .update(collectionBatches)
        .set({
          status: "REMITTED",
          remittedCash: cashRemitted.toDecimalString(),
          difference: diff.toDecimalString(),
          shortageAmount: shortage.toDecimalString(),
          overageAmount: overage.toDecimalString(),
          updatedAt: new Date(),
        })
        .where(eq(collectionBatches.id, batch.id))
        .returning();

      if (!remittance || !updatedBatch) {
        throw new AppError("Failed to record remittance", 500, "REMITTANCE_FAILED");
      }

      return {
        batch: updatedBatch,
        remittance,
        remittanceNumber: remittance.remittanceNumber,
        remittedCash: remittance.remittedCash,
        isBalanced: diff.isZero(),
        difference: diff.toDecimalString(),
        shortageAmount: shortage.toDecimalString(),
        overageAmount: overage.toDecimalString(),
        batchStatus: updatedBatch.status,
        message: diff.isZero()
          ? `Remittance recorded. Batch is balanced (₱${cashRemitted.toDecimalString()} received).`
          : diff.isNegative()
          ? `Remittance recorded with a SHORTAGE of ₱${shortage.toDecimalString()}.`
          : `Remittance recorded with an OVERAGE of ₱${overage.toDecimalString()}.`,
      };
    });
  }

  /**
   * Reconcile Collection Batch
   */
  public async reconcileBatch(batchId: string, reconciledByUserId: string, notes?: string) {
    const [batch] = await db
      .select()
      .from(collectionBatches)
      .where(eq(collectionBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new AppError(`Collection batch with ID '${batchId}' not found`, 404, "BATCH_NOT_FOUND");
    }

    if (batch.status !== "REMITTED") {
      throw new AppError(`Batch must be in REMITTED status before reconciliation (current status: ${batch.status})`, 400, "INVALID_BATCH_STATUS");
    }

    const [updated] = await db
      .update(collectionBatches)
      .set({
        status: "RECONCILED",
        reconciledAt: new Date(),
        reconciledBy: reconciledByUserId,
        notes: notes ? `${batch.notes ? batch.notes + " | " : ""}${notes.trim()}` : batch.notes,
        updatedAt: new Date(),
      })
      .where(eq(collectionBatches.id, batchId))
      .returning();

    if (!updated) {
      throw new AppError("Failed to reconcile collection batch", 500, "BATCH_UPDATE_FAILED");
    }

    return {
      batch: updated,
      status: updated.status,
      message: `Batch #${batch.batchNumber} reconciled successfully.`,
    };
  }

  /**
   * Close Collection Batch (AT-08 Invariant)
   * 
   * Closing Rule:
   * - Balanced batch: closes smoothly.
   * - Shortage / Overage: cannot silently close as balanced.
   *   Requires explicit operational reason / supervisor acknowledgment.
   */
  public async closeBatch(batchId: string, closedByUserId: string, reason?: string) {
    const [batch] = await db
      .select()
      .from(collectionBatches)
      .where(eq(collectionBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new AppError(`Collection batch with ID '${batchId}' not found`, 404, "BATCH_NOT_FOUND");
    }

    if (batch.status === "CLOSED") {
      throw new AppError(`Batch #${batch.batchNumber} is already closed.`, 400, "BATCH_ALREADY_CLOSED");
    }

    if (!["RECONCILED", "REMITTED"].includes(batch.status)) {
      throw new AppError(`Batch must be remitted or reconciled before it can be closed.`, 400, "INVALID_BATCH_STATUS");
    }

    // AT-08 Invariant: Prevention of silent balanced closing when unbalanced
    const diff = Money.fromDecimal(batch.difference);
    if (!diff.isZero()) {
      if (!reason || reason.trim().length < 5) {
        throw new AppError(
          `Supervisor reason is strictly required to close an unbalanced batch (minimum 5 characters). Shortage/Overage: ₱${diff.abs().toDecimalString()}`,
          422,
          "REASON_REQUIRED_FOR_UNBALANCED_BATCH"
        );
      }
    }

    const [closedBatch] = await db
      .update(collectionBatches)
      .set({
        status: "CLOSED",
        closedAt: new Date(),
        closedBy: closedByUserId,
        notes: reason
          ? `${batch.notes ? batch.notes + " | " : ""}Closed Reason: ${reason.trim()}`
          : batch.notes,
        updatedAt: new Date(),
      })
      .where(eq(collectionBatches.id, batchId))
      .returning();

    if (!closedBatch) {
      throw new AppError("Failed to close collection batch", 500, "BATCH_UPDATE_FAILED");
    }

    return {
      batch: closedBatch,
      status: closedBatch.status,
      message: `Collection Batch #${batch.batchNumber} closed successfully.`,
    };
  }

  /**
   * Helper: List Collectors
   */
  public async listCollectors() {
    return await db
      .select()
      .from(collectors)
      .where(eq(collectors.isActive, true))
      .orderBy(asc(collectors.name));
  }

  /**
   * Helper: List Collection Areas
   */
  public async listCollectionAreas() {
    return await db
      .select()
      .from(collectionAreas)
      .where(eq(collectionAreas.isActive, true))
      .orderBy(asc(collectionAreas.name));
  }
}

export const collectionsService = new CollectionsService();
