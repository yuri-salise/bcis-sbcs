import { eq, and, or, sql, desc, ilike, ne } from "drizzle-orm";
import { db } from "../../db/db.js";
import {
  paymentProofs,
  payments,
  subscribers,
  serviceAccounts,
} from "../../db/schema/index.js";
import { storageService } from "../../shared/storage/storage.service.js";
import { PaymentService } from "../payments/payment.service.js";
import { Money } from "../../shared/money/money.js";

export interface SubmitProofParams {
  subscriberId: string;
  serviceAccountId?: string;
  referenceNumber: string;
  senderName?: string;
  senderMobile?: string;
  amount: string;
  transactionDate: string; // YYYY-MM-DD
  notes?: string;
  fileBuffer: Buffer;
  originalFilename: string;
  mimeType: string;
  submittedByUserId?: string;
}

export interface VerificationQueueParams {
  status?: "PENDING" | "VERIFIED" | "REJECTED" | "FLAGGED" | "ALL";
  search?: string;
  page?: number;
  limit?: number;
}

export class GcashService {
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
  }

  /**
   * Submit GCash Payment Proof
   * Validates file, uploads to secure storage, checks for duplicate references, and creates PENDING record.
   */
  public async submitProof(params: SubmitProofParams) {
    // 1. Validate Subscriber
    const [sub] = await db
      .select({ id: subscribers.id, accountNumber: subscribers.accountNumber })
      .from(subscribers)
      .where(eq(subscribers.id, params.subscriberId))
      .limit(1);

    if (!sub) {
      throw new Error(`Subscriber with ID '${params.subscriberId}' not found`);
    }

    // 2. Validate Amount
    const amountVal = Money.fromDecimal(params.amount);
    if (amountVal.isNegative() || amountVal.isZero()) {
      throw new Error("Proof payment amount must be greater than zero");
    }

    const cleanRef = params.referenceNumber.trim();
    if (!cleanRef) {
      throw new Error("GCash reference number is required");
    }

    // 3. Save File Safely
    const storedFile = await storageService.saveProofFile(
      params.fileBuffer,
      params.originalFilename,
      params.mimeType
    );

    // 4. Duplicate Reference Detection (AT-05)
    // Check if reference number already exists in active/posted payments or verified proofs
    const [existingPayment] = await db
      .select({
        id: payments.id,
        receiptNumber: payments.receiptNumber,
        amountPaid: payments.amountPaid,
        paymentDate: payments.paymentDate,
      })
      .from(payments)
      .where(and(eq(payments.referenceNumber, cleanRef), eq(payments.isReversed, false)))
      .limit(1);

    const [existingVerifiedProof] = await db
      .select({
        id: paymentProofs.id,
        referenceNumber: paymentProofs.referenceNumber,
        amount: paymentProofs.amount,
        verifiedAt: paymentProofs.verifiedAt,
      })
      .from(paymentProofs)
      .where(and(eq(paymentProofs.referenceNumber, cleanRef), eq(paymentProofs.verificationStatus, "VERIFIED")))
      .limit(1);

    let initialStatus: "PENDING" | "FLAGGED" = "PENDING";
    let duplicateWarning: string | null = null;

    if (existingPayment) {
      initialStatus = "FLAGGED";
      duplicateWarning = `Reference '${cleanRef}' is already posted under Receipt #${existingPayment.receiptNumber} on ${existingPayment.paymentDate} for ₱${existingPayment.amountPaid}. Verification will be blocked unless duplicate is resolved.`;
    } else if (existingVerifiedProof) {
      initialStatus = "FLAGGED";
      duplicateWarning = `Reference '${cleanRef}' has already been verified under proof ID ${existingVerifiedProof.id}. Verification will be blocked.`;
    }

    // 5. Insert Record
    const [inserted] = await db
      .insert(paymentProofs)
      .values({
        subscriberId: params.subscriberId,
        serviceAccountId: params.serviceAccountId || null,
        referenceNumber: cleanRef,
        senderName: params.senderName?.trim() || null,
        senderMobile: params.senderMobile?.trim() || null,
        amount: amountVal.toDecimalString(),
        transactionDate: params.transactionDate,
        storageKey: storedFile.storageKey,
        originalFilename: storedFile.originalFilename,
        mimeType: storedFile.mimeType,
        fileSize: storedFile.fileSize,
        sha256: storedFile.sha256,
        verificationStatus: initialStatus,
        submittedBy: params.submittedByUserId || null,
        notes: params.notes?.trim() || null,
      })
      .returning();

    return {
      proof: inserted,
      isFlagged: initialStatus === "FLAGGED",
      duplicateWarning,
    };
  }

  /**
   * Get Verification Queue
   * Lists proofs with search, filters, pagination, and live duplicate indicator.
   */
  public async getVerificationQueue(params: VerificationQueueParams) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (params.status && params.status !== "ALL") {
      conditions.push(eq(paymentProofs.verificationStatus, params.status));
    }

    if (params.search && params.search.trim()) {
      const term = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(paymentProofs.referenceNumber, term),
          ilike(paymentProofs.senderName, term),
          ilike(paymentProofs.senderMobile, term),
          ilike(subscribers.accountNumber, term),
          ilike(subscribers.firstName, term),
          ilike(subscribers.lastName, term),
          ilike(subscribers.businessName, term)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentProofs)
      .leftJoin(subscribers, eq(paymentProofs.subscriberId, subscribers.id))
      .where(whereClause);

    const total = countResult?.count || 0;

    // Items
    const rows = await db
      .select({
        id: paymentProofs.id,
        referenceNumber: paymentProofs.referenceNumber,
        amount: paymentProofs.amount,
        transactionDate: paymentProofs.transactionDate,
        senderName: paymentProofs.senderName,
        senderMobile: paymentProofs.senderMobile,
        verificationStatus: paymentProofs.verificationStatus,
        submittedAt: paymentProofs.submittedAt,
        verifiedAt: paymentProofs.verifiedAt,
        rejectionReason: paymentProofs.rejectionReason,
        originalFilename: paymentProofs.originalFilename,
        mimeType: paymentProofs.mimeType,
        fileSize: paymentProofs.fileSize,
        sha256: paymentProofs.sha256,
        subscriberId: subscribers.id,
        subscriberAccountNumber: subscribers.accountNumber,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        serviceAccountId: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        paymentId: payments.id,
        receiptNumber: payments.receiptNumber,
      })
      .from(paymentProofs)
      .leftJoin(subscribers, eq(paymentProofs.subscriberId, subscribers.id))
      .leftJoin(serviceAccounts, eq(paymentProofs.serviceAccountId, serviceAccounts.id))
      .leftJoin(payments, eq(paymentProofs.paymentId, payments.id))
      .where(whereClause)
      .orderBy(desc(paymentProofs.submittedAt))
      .limit(limit)
      .offset(offset);

    // Check duplicate status for each row
    const enrichedItems = await Promise.all(
      rows.map(async (row) => {
        // Query if reference number exists on any active posted payment
        const [duplicatePayment] = await db
          .select({
            id: payments.id,
            receiptNumber: payments.receiptNumber,
            amountPaid: payments.amountPaid,
            paymentDate: payments.paymentDate,
          })
          .from(payments)
          .where(
            and(
              eq(payments.referenceNumber, row.referenceNumber),
              eq(payments.isReversed, false),
              row.paymentId ? ne(payments.id, row.paymentId) : undefined
            )
          )
          .limit(1);

        // Query if another proof exists with the same reference
        const [otherProof] = await db
          .select({
            id: paymentProofs.id,
            verificationStatus: paymentProofs.verificationStatus,
          })
          .from(paymentProofs)
          .where(
            and(
              eq(paymentProofs.referenceNumber, row.referenceNumber),
              ne(paymentProofs.id, row.id)
            )
          )
          .limit(1);

        const hasDuplicate = Boolean(duplicatePayment || (otherProof && otherProof.verificationStatus === "VERIFIED"));
        let duplicateMessage: string | null = null;
        if (duplicatePayment) {
          duplicateMessage = `Matches active Payment Receipt #${duplicatePayment.receiptNumber} (₱${duplicatePayment.amountPaid})`;
        } else if (otherProof && otherProof.verificationStatus === "VERIFIED") {
          duplicateMessage = `Matches verified proof ID ${otherProof.id}`;
        } else if (otherProof && otherProof.verificationStatus === "PENDING") {
          duplicateMessage = `Another pending proof shares reference #${row.referenceNumber}`;
        }

        const subscriberDisplayName =
          row.subscriberBusinessName ||
          `${row.subscriberFirstName || ""} ${row.subscriberLastName || ""}`.trim();

        return {
          ...row,
          subscriberDisplayName,
          duplicateDetected: hasDuplicate,
          duplicateWarning: duplicateMessage,
        };
      })
    );

    return {
      data: enrichedItems,
      items: enrichedItems,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get Single Proof by ID
   */
  public async getProofById(id: string) {
    const [row] = await db
      .select({
        id: paymentProofs.id,
        referenceNumber: paymentProofs.referenceNumber,
        amount: paymentProofs.amount,
        transactionDate: paymentProofs.transactionDate,
        senderName: paymentProofs.senderName,
        senderMobile: paymentProofs.senderMobile,
        storageKey: paymentProofs.storageKey,
        originalFilename: paymentProofs.originalFilename,
        mimeType: paymentProofs.mimeType,
        fileSize: paymentProofs.fileSize,
        sha256: paymentProofs.sha256,
        verificationStatus: paymentProofs.verificationStatus,
        submittedAt: paymentProofs.submittedAt,
        verifiedAt: paymentProofs.verifiedAt,
        rejectionReason: paymentProofs.rejectionReason,
        notes: paymentProofs.notes,
        subscriberId: subscribers.id,
        subscriberAccountNumber: subscribers.accountNumber,
        subscriberFirstName: subscribers.firstName,
        subscriberLastName: subscribers.lastName,
        subscriberBusinessName: subscribers.businessName,
        subscriberEmail: subscribers.email,
        subscriberMobile: subscribers.primaryContactNumber,
        serviceAccountId: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        servicePlanId: serviceAccounts.servicePlanId,
        paymentId: payments.id,
        receiptNumber: payments.receiptNumber,
        paymentDate: payments.paymentDate,
        paymentStatus: payments.status,
      })
      .from(paymentProofs)
      .leftJoin(subscribers, eq(paymentProofs.subscriberId, subscribers.id))
      .leftJoin(serviceAccounts, eq(paymentProofs.serviceAccountId, serviceAccounts.id))
      .leftJoin(payments, eq(paymentProofs.paymentId, payments.id))
      .where(eq(paymentProofs.id, id))
      .limit(1);

    if (!row) {
      throw new Error(`Payment proof with ID '${id}' not found`);
    }

    // Duplicate check
    const [duplicatePayment] = await db
      .select({
        id: payments.id,
        receiptNumber: payments.receiptNumber,
        amountPaid: payments.amountPaid,
        paymentDate: payments.paymentDate,
        status: payments.status,
      })
      .from(payments)
      .where(
        and(
          eq(payments.referenceNumber, row.referenceNumber),
          eq(payments.isReversed, false),
          row.paymentId ? ne(payments.id, row.paymentId) : undefined
        )
      )
      .limit(1);

    const [otherProof] = await db
      .select({
        id: paymentProofs.id,
        verificationStatus: paymentProofs.verificationStatus,
        amount: paymentProofs.amount,
        submittedAt: paymentProofs.submittedAt,
      })
      .from(paymentProofs)
      .where(
        and(
          eq(paymentProofs.referenceNumber, row.referenceNumber),
          ne(paymentProofs.id, row.id)
        )
      )
      .limit(1);

    const isDuplicate = Boolean(duplicatePayment || (otherProof && otherProof.verificationStatus === "VERIFIED"));
    let duplicateWarning: string | null = null;
    if (duplicatePayment) {
      duplicateWarning = `Warning: Reference number '${row.referenceNumber}' matches existing posted Receipt #${duplicatePayment.receiptNumber} (₱${duplicatePayment.amountPaid}) on ${duplicatePayment.paymentDate}.`;
    } else if (otherProof && otherProof.verificationStatus === "VERIFIED") {
      duplicateWarning = `Warning: Reference number '${row.referenceNumber}' has already been verified under proof ID ${otherProof.id}.`;
    } else if (otherProof && otherProof.verificationStatus === "PENDING") {
      duplicateWarning = `Notice: Another pending proof (ID ${otherProof.id}) has the same reference number.`;
    }

    const subscriberDisplayName =
      row.subscriberBusinessName ||
      `${row.subscriberFirstName || ""} ${row.subscriberLastName || ""}`.trim();

    return {
      ...row,
      subscriberDisplayName,
      duplicateDetection: {
        isDuplicate,
        duplicateWarning,
        matchedPayment: duplicatePayment || null,
        matchedProof: otherProof || null,
      },
    };
  }

  /**
   * Verify GCash Payment Proof (AT-05)
   * 
   * Atomically:
   * 1. Validates proof is in PENDING or FLAGGED status.
   * 2. Strictly prevents double-posting if reference already exists on a posted payment (AT-05).
   * 3. Creates authoritative payment with oldest-first allocation and mints BCIS-REC-YYYY-NNNN.
   * 4. Marks proof as VERIFIED, associates payment_id, records verified_by and verified_at.
   */
  public async verifyProof(params: {
    proofId: string;
    verifiedByUserId: string;
    serviceAccountId?: string;
    notes?: string;
  }) {
    return await db.transaction(async (tx) => {
      // 1. Fetch proof
      const [proof] = await tx
        .select()
        .from(paymentProofs)
        .where(eq(paymentProofs.id, params.proofId))
        .limit(1);

      if (!proof) {
        throw new Error(`Payment proof with ID '${params.proofId}' not found`);
      }

      if (proof.verificationStatus === "VERIFIED") {
        throw new Error(`Proof '${params.proofId}' is already verified.`);
      }

      if (proof.verificationStatus === "REJECTED") {
        throw new Error(`Proof '${params.proofId}' was previously rejected. A rejected proof cannot be verified.`);
      }

      // 2. AT-05 Strict Protection: Prevent Double Posting
      const cleanRef = proof.referenceNumber.trim();
      const [existingPayment] = await tx
        .select({ id: payments.id, receiptNumber: payments.receiptNumber })
        .from(payments)
        .where(and(eq(payments.referenceNumber, cleanRef), eq(payments.isReversed, false)))
        .limit(1);

      if (existingPayment) {
        throw new Error(
          `Cannot verify proof: GCash reference number '${cleanRef}' has already been posted to active Receipt #${existingPayment.receiptNumber}. Double-posting is strictly prohibited (AT-05).`
        );
      }

      const [otherVerifiedProof] = await tx
        .select({ id: paymentProofs.id })
        .from(paymentProofs)
        .where(
          and(
            eq(paymentProofs.referenceNumber, cleanRef),
            eq(paymentProofs.verificationStatus, "VERIFIED"),
            ne(paymentProofs.id, proof.id)
          )
        )
        .limit(1);

      if (otherVerifiedProof) {
        throw new Error(
          `Cannot verify proof: GCash reference number '${cleanRef}' has already been verified under proof ID ${otherVerifiedProof.id}.`
        );
      }

      // 3. Delegate to PaymentService.createPayment within this exact transaction
      const targetServiceAccountId = params.serviceAccountId || proof.serviceAccountId || undefined;

      const paymentResult = await this.paymentService.createPayment(
        {
          subscriberId: proof.subscriberId,
          serviceAccountId: targetServiceAccountId,
          paymentDate: proof.transactionDate,
          paymentMethod: "GCASH",
          referenceNumber: cleanRef,
          amountPaid: proof.amount,
          notes: `Verified GCash submission [Proof ID: ${proof.id}]${params.notes ? ` - ${params.notes.trim()}` : ""}`,
        },
        params.verifiedByUserId,
        tx
      );

      // 4. Update Payment Proof record
      const [updatedProof] = await tx
        .update(paymentProofs)
        .set({
          paymentId: paymentResult.payment.id,
          verificationStatus: "VERIFIED",
          verifiedBy: params.verifiedByUserId,
          verifiedAt: new Date(),
          notes: params.notes ? `${proof.notes ? proof.notes + " | " : ""}${params.notes.trim()}` : proof.notes,
          updatedAt: new Date(),
        })
        .where(eq(paymentProofs.id, proof.id))
        .returning();

      return {
        proof: updatedProof,
        payment: paymentResult.payment,
        allocations: paymentResult.allocations,
        advanceCredit: paymentResult.advanceCredit,
        receiptNumber: paymentResult.payment.receiptNumber,
        message: `GCash proof verified successfully. Official Receipt #${paymentResult.payment.receiptNumber} issued.`,
      };
    });
  }

  /**
   * Reject GCash Payment Proof
   * Requires non-empty rejection reason. Preserves proof and audit metadata without touching invoices or ledger.
   */
  public async rejectProof(params: {
    proofId: string;
    verifiedByUserId: string;
    reason: string;
  }) {
    if (!params.reason || params.reason.trim().length < 5) {
      throw new Error("A valid rejection reason (minimum 5 characters) is required.");
    }

    const [proof] = await db
      .select()
      .from(paymentProofs)
      .where(eq(paymentProofs.id, params.proofId))
      .limit(1);

    if (!proof) {
      throw new Error(`Payment proof with ID '${params.proofId}' not found`);
    }

    if (proof.verificationStatus === "VERIFIED") {
      throw new Error("Cannot reject an already verified proof. Reverse the linked payment instead.");
    }

    const [updatedProof] = await db
      .update(paymentProofs)
      .set({
        verificationStatus: "REJECTED",
        verifiedBy: params.verifiedByUserId,
        verifiedAt: new Date(),
        rejectionReason: params.reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(paymentProofs.id, params.proofId))
      .returning();

    return {
      proof: updatedProof,
      message: "GCash proof rejected. Evidence preserved for auditing.",
    };
  }

  /**
   * Read Proof File
   */
  public async getProofFile(proofId: string) {
    const [proof] = await db
      .select({
        storageKey: paymentProofs.storageKey,
        originalFilename: paymentProofs.originalFilename,
        mimeType: paymentProofs.mimeType,
      })
      .from(paymentProofs)
      .where(eq(paymentProofs.id, proofId))
      .limit(1);

    if (!proof) {
      throw new Error(`Payment proof with ID '${proofId}' not found`);
    }

    const buffer = await storageService.readFile(proof.storageKey);
    return {
      buffer,
      originalFilename: proof.originalFilename,
      mimeType: proof.mimeType,
    };
  }
}

export const gcashService = new GcashService();
