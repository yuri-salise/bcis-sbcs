/**
 * Official Fastify API Client for BCIS Desktop Client
 * 
 * Invariant: The frontend MUST NEVER connect directly to PostgreSQL.
 * All operations pass through this typed HTTP API client.
 */

export interface HealthResponse {
  status: "ok";
  timestamp: string;
  uptime: number;
}

export interface ReadyResponse {
  status: "ready" | "degraded";
  database: "connected" | "disconnected";
  timestamp: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
}

export interface LoginResponse {
  user: UserProfile;
  token: string;
  expiresAt: string;
  roles: string[];
  permissions: string[];
}

export interface MeResponse {
  user: UserProfile;
  roles: string[];
  permissions: string[];
}

export interface Address {
  id?: string;
  subscriberId?: string;
  label: string;
  line1: string;
  line2?: string | null;
  barangay: string;
  cityMunicipality: string;
  province: string;
  postalCode?: string;
  landmark?: string | null;
  isPrimary?: boolean;
}

export interface ServiceType {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

export interface ServicePlan {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  monthlyPrice: string;
  installationFee: string;
  reconnectionFee: string;
  speedMbps?: number | null;
  channelCount?: number | null;
  isActive: boolean;
  serviceType: ServiceType;
}

export interface CollectionArea {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
}

export interface Collector {
  id: string;
  collectorCode: string;
  name: string;
  contactNumber?: string | null;
  isActive: boolean;
}

export interface ServiceAccountStatusHistoryItem {
  id: string;
  serviceAccountId: string;
  fromStatus: string;
  toStatus: string;
  effectiveAt: string;
  reason: string;
  actorUserId?: string | null;
  actor?: {
    id: string;
    username: string;
    displayName: string;
  } | null;
  notes?: string | null;
}

export interface ServiceAccount {
  id: string;
  subscriberId: string;
  serviceAccountNumber: string;
  serviceTypeId: string;
  servicePlanId: string;
  installationAddressId: string;
  activationDate: string;
  billingStartDate: string;
  billingDay: number;
  dueDay: number;
  currentRate: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DISCONNECTED" | "TERMINATED";
  collectorId?: string | null;
  collectionAreaId?: string | null;
  cachedBalanceDue: string;
  lastBilledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  serviceType?: ServiceType;
  servicePlan?: ServicePlan;
  collectionArea?: CollectionArea;
  collector?: Collector;
  statusHistory?: ServiceAccountStatusHistoryItem[];
}

export interface Subscriber {
  id: string;
  accountNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  businessName?: string | null;
  primaryContactNumber: string;
  secondaryContactNumber?: string | null;
  email?: string | null;
  status: "ACTIVE" | "INACTIVE" | "TERMINATED" | "ARCHIVED";
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  primaryAddress?: Address | null;
  addresses?: Address[];
  serviceAccounts?: ServiceAccount[];
  serviceAccountsCount?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateSubscriberPayload {
  firstName: string;
  middleName?: string;
  lastName: string;
  businessName?: string;
  primaryContactNumber: string;
  secondaryContactNumber?: string;
  email?: string;
  notes?: string;
  address: {
    label?: string;
    line1: string;
    line2?: string;
    barangay: string;
    cityMunicipality?: string;
    province?: string;
    postalCode?: string;
    landmark?: string;
  };
}

export interface UpdateSubscriberPayload {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  businessName?: string;
  primaryContactNumber?: string;
  secondaryContactNumber?: string;
  email?: string;
  status?: string;
  notes?: string;
  address?: {
    label?: string;
    line1?: string;
    line2?: string;
    barangay?: string;
    cityMunicipality?: string;
    province?: string;
    postalCode?: string;
    landmark?: string;
  };
}

export interface CreateServiceAccountPayload {
  servicePlanId: string;
  installationAddressId?: string;
  activationDate?: string;
  billingStartDate?: string;
  billingDay?: number;
  dueDay?: number;
  collectorId?: string;
  collectionAreaId?: string;
  reason?: string;
  notes?: string;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:3001/api/v1";
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("bcis_auth_token");
    }
  }

  public setToken(token: string | null): void {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("bcis_auth_token", token);
      } else {
        localStorage.removeItem("bcis_auth_token");
      }
    }
  }

  public getToken(): string | null {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("bcis_auth_token");
      if (stored) return stored;
    }
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers = new Headers(options.headers);

    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    if (this.token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorBody: { message?: string; code?: string; details?: unknown } = {};
      try {
        errorBody = await response.json();
      } catch {
        // Response not JSON
      }

      throw new ApiError(
        errorBody.message || `Request failed with status ${response.status}`,
        response.status,
        errorBody.code || "REQUEST_FAILED",
        errorBody.details
      );
    }

    return response.json() as Promise<T>;
  }

  public async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/health");
  }

  public async getReadiness(): Promise<ReadyResponse> {
    const rootUrl = this.baseUrl.replace(/\/api\/v1\/?$/, "");
    const response = await fetch(`${rootUrl}/ready`);
    return response.json() as Promise<ReadyResponse>;
  }

  public async login(username: string, password: string): Promise<LoginResponse> {
    const result = await this.request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.setToken(result.token);
    return result;
  }

  public async logout(): Promise<void> {
    try {
      await this.request<{ status: string }>("/auth/logout", {
        method: "POST",
      });
    } finally {
      this.setToken(null);
    }
  }

  public async getMe(): Promise<MeResponse> {
    return this.request<MeResponse>("/auth/me");
  }

  public async checkAdminAudit(): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>("/admin/audit-check");
  }

  // --- Subscriber & Catalog Methods ---

  public async listSubscribers(params: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResult<Subscriber>> {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set("search", params.search);
    if (params.status) searchParams.set("status", params.status);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    const qs = searchParams.toString();
    return this.request<PaginatedResult<Subscriber>>(`/subscribers${qs ? `?${qs}` : ""}`);
  }

  public async getSubscriberById(id: string): Promise<Subscriber> {
    return this.request<Subscriber>(`/subscribers/${id}`);
  }

  public async createSubscriber(payload: CreateSubscriberPayload): Promise<Subscriber> {
    return this.request<Subscriber>("/subscribers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async updateSubscriber(id: string, payload: UpdateSubscriberPayload): Promise<Subscriber> {
    return this.request<Subscriber>(`/subscribers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  public async createServiceAccount(
    subscriberId: string,
    payload: CreateServiceAccountPayload
  ): Promise<ServiceAccount> {
    return this.request<ServiceAccount>(`/subscribers/${subscriberId}/service-accounts`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async updateServiceAccountStatus(
    serviceAccountId: string,
    payload: { toStatus: string; reason: string; notes?: string }
  ): Promise<ServiceAccount> {
    return this.request<ServiceAccount>(`/service-accounts/${serviceAccountId}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  public async listServicePlans(): Promise<ServicePlan[]> {
    return this.request<ServicePlan[]>("/service-plans");
  }

  public async listCollectionAreas(): Promise<CollectionArea[]> {
    return this.request<CollectionArea[]>("/collection-areas");
  }

  public async listCollectors(): Promise<Collector[]> {
    return this.request<Collector[]>("/collectors");
  }

  // --- Phase 3: Billing & Invoicing Methods ---

  public async listBillingCycles(): Promise<BillingCycle[]> {
    return this.request<BillingCycle[]>("/billing/cycles");
  }

  public async createBillingCycle(payload: {
    cycleCode: string;
    periodStart: string;
    periodEnd: string;
    billingDate: string;
    dueDate: string;
  }): Promise<BillingCycle> {
    return this.request<BillingCycle>("/billing/cycles", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async previewBillingGeneration(cycleCode: string): Promise<BillingPreviewResponse> {
    return this.request<BillingPreviewResponse>(
      `/billing/generate/preview?cycleCode=${encodeURIComponent(cycleCode)}`
    );
  }

  public async generateMonthlyBilling(cycleCode: string): Promise<GenerateBillingResponse> {
    return this.request<GenerateBillingResponse>("/billing/generate", {
      method: "POST",
      body: JSON.stringify({ cycleCode }),
    });
  }

  public async listInvoices(
    params: {
      cycleCode?: string;
      serviceAccountId?: string;
      subscriberId?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<PaginatedResult<Invoice>> {
    const searchParams = new URLSearchParams();
    if (params.cycleCode) searchParams.set("cycleCode", params.cycleCode);
    if (params.serviceAccountId) searchParams.set("serviceAccountId", params.serviceAccountId);
    if (params.subscriberId) searchParams.set("subscriberId", params.subscriberId);
    if (params.status) searchParams.set("status", params.status);
    if (params.search) searchParams.set("search", params.search);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    const qs = searchParams.toString();
    return this.request<PaginatedResult<Invoice>>(`/invoices${qs ? `?${qs}` : ""}`);
  }

  public async getInvoiceById(id: string): Promise<Invoice> {
    return this.request<Invoice>(`/invoices/${id}`);
  }

  public async getSubscriberLedger(subscriberId: string): Promise<SubscriberLedgerResponse> {
    return this.request<SubscriberLedgerResponse>(`/subscribers/${subscriberId}/ledger`);
  }

  // --- Payments Endpoints (Phase 4 - AT-01 to AT-06) ---

  public async previewPaymentAllocation(
    params: PreviewPaymentAllocationParams
  ): Promise<PaymentAllocationPreviewResult> {
    return this.request<PaymentAllocationPreviewResult>("/payments/preview", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  public async listPayments(params: ListPaymentsParams = {}): Promise<PaginatedResult<Payment>> {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set("search", params.search);
    if (params.status) searchParams.set("status", params.status);
    if (params.paymentMethod) searchParams.set("paymentMethod", params.paymentMethod);
    if (params.subscriberId) searchParams.set("subscriberId", params.subscriberId);
    if (params.startDate) searchParams.set("startDate", params.startDate);
    if (params.endDate) searchParams.set("endDate", params.endDate);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    const qs = searchParams.toString();
    return this.request<PaginatedResult<Payment>>(`/payments${qs ? `?${qs}` : ""}`);
  }

  public async getPaymentById(id: string): Promise<Payment> {
    return this.request<Payment>(`/payments/${id}`);
  }

  public async createPayment(payload: CreatePaymentPayload): Promise<CreatePaymentResponse> {
    return this.request<CreatePaymentResponse>("/payments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async reversePayment(
    id: string,
    reason: string
  ): Promise<{ payment: Payment; message: string }> {
    return this.request<{ payment: Payment; message: string }>(`/payments/${id}/reverse`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  // --- Phase 5: GCash Verification Methods ---

  public async listGcashQueue(params: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResult<GcashProofItem>> {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.set("status", params.status);
    if (params.search) searchParams.set("search", params.search);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    return this.request<PaginatedResult<GcashProofItem>>(`/gcash/verification-queue?${searchParams.toString()}`);
  }

  public async getGcashProof(id: string): Promise<GcashProofDetail> {
    return this.request<GcashProofDetail>(`/gcash/proofs/${id}`);
  }

  public getGcashProofFileUrl(id: string): string {
    return `${this.baseUrl}/gcash/proofs/${id}/file`;
  }

  public async getGcashProofFileBlob(id: string): Promise<Blob> {
    const url = `${this.baseUrl}/gcash/proofs/${id}/file`;
    const headers = new Headers();
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Failed to load proof file: ${res.statusText}`);
    }
    return await res.blob();
  }

  public async submitGcashProof(payload: SubmitGcashProofPayload): Promise<{
    proof: GcashProofItem;
    isFlagged: boolean;
    duplicateWarning?: string | null;
  }> {
    return this.request<{ proof: GcashProofItem; isFlagged: boolean; duplicateWarning?: string | null }>(
      "/gcash/submit",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  public async verifyGcashProof(
    id: string,
    payload: { notes?: string; serviceAccountId?: string } = {}
  ): Promise<VerifyGcashProofResponse> {
    return this.request<VerifyGcashProofResponse>(`/gcash/proofs/${id}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async rejectGcashProof(
    id: string,
    payload: { reason: string }
  ): Promise<{ proof: any; message: string }> {
    return this.request<{ proof: any; message: string }>(`/gcash/proofs/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

export interface BillingCycle {
  id: string;
  cycleCode: string;
  periodStart: string;
  periodEnd: string;
  billingDate: string;
  dueDate: string;
  status: "OPEN" | "GENERATING" | "GENERATED" | "LOCKED" | "CLOSED";
  createdAt: string;
  closedAt?: string | null;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  lineType: string;
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  sourceReference?: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  serviceAccountId: string;
  billingCycleId: string;
  invoiceDate: string;
  dueDate: string;
  status: "DRAFT" | "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID" | "CREDITED";
  subtotal: string;
  discountTotal: string;
  penaltyTotal: string;
  adjustmentTotal: string;
  totalAmount: string;
  amountPaidCache: string;
  balanceDueCache: string;
  finalizedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  createdAt: string;
  updatedAt: string;
  billingCycle?: BillingCycle;
  serviceAccount?: {
    id: string;
    serviceAccountNumber: string;
    currentRate: string;
    servicePlan?: ServicePlan;
  };
  subscriber?: {
    id: string;
    accountNumber: string;
    firstName: string;
    lastName: string;
    businessName?: string | null;
    primaryContactNumber: string;
    primaryAddress?: Address | null;
  };
  servicePlan?: ServicePlan;
  items?: InvoiceItem[];
}

export interface LedgerEntry {
  id: string;
  serviceAccountId: string;
  serviceAccountNumber?: string;
  entryNo: number;
  postedAt: string;
  entryDate: string;
  referenceType: string;
  referenceId: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
  currency: string;
  runningBalance: string;
  createdAt: string;
}

export interface SubscriberLedgerResponse {
  subscriber: Subscriber;
  serviceAccounts: ServiceAccount[];
  entries: LedgerEntry[];
  currentTotalBalance: string;
}

export interface BillingPreviewResponse {
  cycle: BillingCycle;
  totalActiveAccounts: number;
  alreadyBilledCount: number;
  billableCount: number;
  estimatedTotalSum: string;
  billableAccounts: Array<{
    serviceAccountId: string;
    serviceAccountNumber: string;
    subscriberName: string;
    planName: string;
    serviceType: string;
    monthlyRate: string;
  }>;
}

export interface GenerateBillingResponse {
  cycleCode: string;
  status: string;
  message: string;
  generatedCount: number;
  skippedCount: number;
  totalAmount: string;
  invoices: Invoice[];
}

// --- Payment Interfaces (Phase 4 - AT-01 to AT-06) ---

export type PaymentMethod = "CASH" | "GCASH" | "BANK_TRANSFER" | "CHECK" | "OTHER";
export type PaymentStatus = "POSTED" | "REVERSED" | "VOID";

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

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  allocatedAmount: string;
  previousInvoiceBalance: string;
  remainingInvoiceBalance: string;
  createdAt: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    cycleCode?: string;
    dueDate: string;
    totalAmount: string;
    status: string;
  };
}

export interface Payment {
  id: string;
  receiptNumber: string;
  subscriberId: string;
  serviceAccountId?: string | null;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  amountPaid: string;
  tenderedAmount?: string | null;
  changeAmount?: string | null;
  allocatedAmount: string;
  advanceAmount: string;
  status: PaymentStatus;
  cashierId: string;
  collectorId?: string | null;
  isReversed: boolean;
  reversedAt?: string | null;
  reversedBy?: string | null;
  reversalReason?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  subscriber?: {
    id: string;
    accountNumber: string;
    firstName: string;
    lastName: string;
    businessName?: string | null;
    primaryContactNumber: string;
  };
  serviceAccount?: {
    id: string;
    serviceAccountNumber: string;
    currentRate: string;
  };
  cashier?: {
    id: string;
    username: string;
    displayName: string;
  };
  collector?: {
    id: string;
    collectorCode: string;
    name: string;
  };
  allocations?: PaymentAllocation[];
}

export interface CreatePaymentPayload {
  subscriberId: string;
  serviceAccountId?: string;
  paymentDate?: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  amountPaid: string;
  tenderedAmount?: string;
  collectorId?: string;
  notes?: string;
}

export interface CreatePaymentResponse {
  payment: Payment;
  allocations: Array<{
    invoiceId: string;
    invoiceNumber: string;
    allocatedAmount: string;
    previousBalance: string;
    remainingBalance: string;
    status: string;
  }>;
  advanceCredit: string;
  message: string;
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

export type GcashVerificationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "FLAGGED";

export interface GcashProofItem {
  id: string;
  referenceNumber: string;
  amount: string;
  transactionDate: string;
  senderName?: string | null;
  senderMobile?: string | null;
  verificationStatus: GcashVerificationStatus;
  submittedAt: string;
  verifiedAt?: string | null;
  rejectionReason?: string | null;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  subscriberId: string;
  subscriberAccountNumber: string;
  subscriberFirstName: string;
  subscriberLastName: string;
  subscriberBusinessName?: string | null;
  subscriberDisplayName: string;
  serviceAccountId?: string | null;
  serviceAccountNumber?: string | null;
  paymentId?: string | null;
  receiptNumber?: string | null;
  duplicateDetected: boolean;
  duplicateWarning?: string | null;
}

export interface GcashProofDetail extends GcashProofItem {
  storageKey: string;
  notes?: string | null;
  subscriberEmail?: string | null;
  subscriberMobile?: string | null;
  servicePlanId?: string | null;
  paymentDate?: string | null;
  paymentStatus?: string | null;
  duplicateDetection: {
    isDuplicate: boolean;
    duplicateWarning?: string | null;
    matchedPayment?: {
      id: string;
      receiptNumber: string;
      amountPaid: string;
      paymentDate: string;
      status: string;
    } | null;
    matchedProof?: {
      id: string;
      verificationStatus: string;
      amount: string;
      submittedAt: string;
    } | null;
  };
}

export interface SubmitGcashProofPayload {
  subscriberId: string;
  serviceAccountId?: string;
  referenceNumber: string;
  senderName?: string;
  senderMobile?: string;
  amount: string;
  transactionDate: string;
  notes?: string;
  originalFilename: string;
  mimeType: string;
  fileBase64: string;
}

export interface VerifyGcashProofResponse {
  proof: any;
  payment: Payment;
  allocations: Array<{
    invoiceId: string;
    invoiceNumber: string;
    allocatedAmount: string;
    previousBalance: string;
    remainingBalance: string;
    status: string;
  }>;
  advanceCredit: string;
  receiptNumber: string;
  message: string;
}

export const api = new ApiClient();
