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
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl?: string) {
    const saved = typeof window !== "undefined" ? localStorage.getItem("bcis_api_base_url") : null;
    this.baseUrl = baseUrl || saved || (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:3001/api/v1";
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("bcis_auth_token");
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.trim().replace(/\/+$/, "");
    if (typeof window !== "undefined") {
      localStorage.setItem("bcis_api_base_url", this.baseUrl);
    }
  }

  public resetBaseUrl(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem("bcis_api_base_url");
    }
    this.baseUrl = (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:3001/api/v1";
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

  // --- Phase 6: Collections, Batches & Remittances Methods ---

  public async listBatches(params: ListBatchesParams = {}): Promise<PaginatedResult<CollectionBatch>> {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.set("status", params.status);
    if (params.collectorId) searchParams.set("collectorId", params.collectorId);
    if (params.collectionAreaId) searchParams.set("collectionAreaId", params.collectionAreaId);
    if (params.date) searchParams.set("date", params.date);
    if (params.search) searchParams.set("search", params.search);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    return this.request<PaginatedResult<CollectionBatch>>(`/collections/batches?${searchParams.toString()}`);
  }

  public async getBatchById(id: string): Promise<CollectionBatchDetail> {
    return this.request<CollectionBatchDetail>(`/collections/batches/${id}`);
  }

  public async createBatch(payload: CreateBatchPayload): Promise<{ data: CollectionBatch; message: string }> {
    return this.request<{ data: CollectionBatch; message: string }>("/collections/batches", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async recordFieldCollection(
    batchId: string,
    payload: RecordFieldCollectionPayload
  ): Promise<{
    batch: CollectionBatch;
    account: CollectionBatchAccount;
    payment: Payment;
    receiptNumber: string;
    message: string;
  }> {
    return this.request(`/collections/batches/${batchId}/collections`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async submitBatch(batchId: string): Promise<{ batch: CollectionBatch; status: string; message: string }> {
    return this.request<{ batch: CollectionBatch; status: string; message: string }>(`/collections/batches/${batchId}/submit`, {
      method: "POST",
    });
  }

  public async recordRemittance(
    batchId: string,
    payload: RecordRemittancePayload
  ): Promise<{
    batch: CollectionBatch;
    remittance: CollectorRemittance;
    remittanceNumber: string;
    remittedCash: string;
    isBalanced: boolean;
    difference: string;
    shortageAmount: string;
    overageAmount: string;
    batchStatus: string;
    message: string;
  }> {
    return this.request(`/collections/batches/${batchId}/remit`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async reconcileBatch(
    batchId: string,
    payload: { notes?: string } = {}
  ): Promise<{ batch: CollectionBatch; status: string; message: string }> {
    return this.request<{ batch: CollectionBatch; status: string; message: string }>(`/collections/batches/${batchId}/reconcile`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async closeBatch(
    batchId: string,
    payload: { reason?: string } = {}
  ): Promise<{ batch: CollectionBatch; status: string; message: string }> {
    return this.request<{ batch: CollectionBatch; status: string; message: string }>(`/collections/batches/${batchId}/close`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // --- Phase 7: Receivables, AR Aging & Service Control Methods ---

  public async getOutstandingReceivables(params: {
    search?: string;
    subscriberId?: string;
    serviceAccountId?: string;
    collectionAreaId?: string;
    collectorId?: string;
    status?: string;
    asOfDate?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<OutstandingReceivablesResponse> {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set("search", params.search);
    if (params.subscriberId) searchParams.set("subscriberId", params.subscriberId);
    if (params.serviceAccountId) searchParams.set("serviceAccountId", params.serviceAccountId);
    if (params.collectionAreaId) searchParams.set("collectionAreaId", params.collectionAreaId);
    if (params.collectorId) searchParams.set("collectorId", params.collectorId);
    if (params.status) searchParams.set("status", params.status);
    if (params.asOfDate) searchParams.set("asOfDate", params.asOfDate);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    return this.request<OutstandingReceivablesResponse>(`/receivables/outstanding?${searchParams.toString()}`);
  }

  public async getOverdueReceivables(params: {
    search?: string;
    collectionAreaId?: string;
    collectorId?: string;
    asOfDate?: string;
    includeGracePeriod?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<OverdueReceivablesResponse> {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set("search", params.search);
    if (params.collectionAreaId) searchParams.set("collectionAreaId", params.collectionAreaId);
    if (params.collectorId) searchParams.set("collectorId", params.collectorId);
    if (params.asOfDate) searchParams.set("asOfDate", params.asOfDate);
    if (params.includeGracePeriod !== undefined) searchParams.set("includeGracePeriod", params.includeGracePeriod.toString());
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    return this.request<OverdueReceivablesResponse>(`/receivables/overdue?${searchParams.toString()}`);
  }

  public async getAgingReport(params: {
    asOfDate?: string;
    collectionAreaId?: string;
    collectorId?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<AgingReportResponse> {
    const searchParams = new URLSearchParams();
    if (params.asOfDate) searchParams.set("asOfDate", params.asOfDate);
    if (params.collectionAreaId) searchParams.set("collectionAreaId", params.collectionAreaId);
    if (params.collectorId) searchParams.set("collectorId", params.collectorId);
    if (params.search) searchParams.set("search", params.search);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    return this.request<AgingReportResponse>(`/receivables/aging?${searchParams.toString()}`);
  }

  public async getSuspensionCandidates(params: {
    collectionAreaId?: string;
    collectorId?: string;
    search?: string;
    asOfDate?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<SuspensionCandidatesResponse> {
    const searchParams = new URLSearchParams();
    if (params.collectionAreaId) searchParams.set("collectionAreaId", params.collectionAreaId);
    if (params.collectorId) searchParams.set("collectorId", params.collectorId);
    if (params.search) searchParams.set("search", params.search);
    if (params.asOfDate) searchParams.set("asOfDate", params.asOfDate);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    return this.request<SuspensionCandidatesResponse>(`/receivables/suspension-candidates?${searchParams.toString()}`);
  }

  public async suspendServiceAccount(
    serviceAccountId: string,
    payload: { reason: string; notes?: string; effectiveDate?: string }
  ): Promise<{ message: string; serviceAccount: any; suspension: any }> {
    return this.request<{ message: string; serviceAccount: any; suspension: any }>(
      `/service-accounts/${serviceAccountId}/suspend`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  public async requestReconnection(
    serviceAccountId: string,
    payload: {
      fee?: string;
      technicianUserId?: string;
      scheduledAt?: string;
      notes?: string;
      immediate?: boolean;
    } = {}
  ): Promise<{ message: string; reconnection: any; reconnectedImmediately: boolean }> {
    return this.request<{ message: string; reconnection: any; reconnectedImmediately: boolean }>(
      `/service-accounts/${serviceAccountId}/reconnect`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  public async completeReconnection(
    reconnectionId: string,
    payload: { notes?: string } = {}
  ): Promise<{ message: string; reconnection: any; serviceAccount: any }> {
    return this.request<{ message: string; reconnection: any; serviceAccount: any }>(
      `/receivables/reconnections/${reconnectionId}/complete`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  public async getServiceControlHistory(serviceAccountId: string): Promise<{ events: ServiceHistoryEvent[] }> {
    return this.request<{ events: ServiceHistoryEvent[] }>(`/service-accounts/${serviceAccountId}/service-history`);
  }

  public async listReconnections(params: {
    status?: string;
    technicianUserId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResult<ReconnectionWorkOrder>> {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.set("status", params.status);
    if (params.technicianUserId) searchParams.set("technicianUserId", params.technicianUserId);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    return this.request<PaginatedResult<ReconnectionWorkOrder>>(`/receivables/reconnections?${searchParams.toString()}`);
  }

  public async listTechnicians(): Promise<{ data: TechnicianUser[] }> {
    return this.request<{ data: TechnicianUser[] }>(`/receivables/technicians`);
  }

  // --- Phase 8: Reports, General Ledger, Audit Trails & Compliance ---

  public async getDashboardMetrics(): Promise<DashboardMetrics> {
    return this.request<DashboardMetrics>("/reports/dashboard");
  }

  public async getDailyCollectionReport(params: {
    date?: string;
    collectionAreaId?: string;
    paymentMethod?: string;
    cashierUserId?: string;
  } = {}): Promise<DailyCollectionReport> {
    const searchParams = new URLSearchParams();
    if (params.date) searchParams.set("date", params.date);
    if (params.collectionAreaId) searchParams.set("collectionAreaId", params.collectionAreaId);
    if (params.paymentMethod) searchParams.set("paymentMethod", params.paymentMethod);
    if (params.cashierUserId) searchParams.set("cashierUserId", params.cashierUserId);
    return this.request<DailyCollectionReport>(`/reports/daily-collection?${searchParams.toString()}`);
  }

  public async getMonthlyCollectionReport(params: {
    yearMonth?: string;
    collectionAreaId?: string;
  } = {}): Promise<MonthlyCollectionReport> {
    const searchParams = new URLSearchParams();
    if (params.yearMonth) searchParams.set("yearMonth", params.yearMonth);
    if (params.collectionAreaId) searchParams.set("collectionAreaId", params.collectionAreaId);
    return this.request<MonthlyCollectionReport>(`/reports/monthly-collection?${searchParams.toString()}`);
  }

  public async getBillingVsCollectionReport(params: {
    year?: string | number;
  } = {}): Promise<BillingVsCollectionReport> {
    const searchParams = new URLSearchParams();
    if (params.year) searchParams.set("year", params.year.toString());
    return this.request<BillingVsCollectionReport>(`/reports/billing-vs-collection?${searchParams.toString()}`);
  }

  public async getFullAgingReport(params: {
    asOfDate?: string;
    collectionAreaId?: string;
  } = {}): Promise<FullAgingReport> {
    const searchParams = new URLSearchParams();
    if (params.asOfDate) searchParams.set("asOfDate", params.asOfDate);
    if (params.collectionAreaId) searchParams.set("collectionAreaId", params.collectionAreaId);
    return this.request<FullAgingReport>(`/reports/aging?${searchParams.toString()}`);
  }

  public async getSubscriberSOA(subscriberId: string, asOfDate?: string): Promise<SubscriberSOA> {
    const searchParams = new URLSearchParams();
    if (asOfDate) searchParams.set("asOfDate", asOfDate);
    return this.request<SubscriberSOA>(`/reports/soa/${subscriberId}?${searchParams.toString()}`);
  }

  public async getCollectorPerformanceReport(params: {
    startDate?: string;
    endDate?: string;
    collectorId?: string;
  } = {}): Promise<CollectorPerformanceReport> {
    const searchParams = new URLSearchParams();
    if (params.startDate) searchParams.set("startDate", params.startDate);
    if (params.endDate) searchParams.set("endDate", params.endDate);
    if (params.collectorId) searchParams.set("collectorId", params.collectorId);
    return this.request<CollectorPerformanceReport>(`/reports/collector-performance?${searchParams.toString()}`);
  }

  public async getPaymentMethodSummary(params: {
    startDate?: string;
    endDate?: string;
  } = {}): Promise<PaymentMethodSummaryReport> {
    const searchParams = new URLSearchParams();
    if (params.startDate) searchParams.set("startDate", params.startDate);
    if (params.endDate) searchParams.set("endDate", params.endDate);
    return this.request<PaymentMethodSummaryReport>(`/reports/payment-methods?${searchParams.toString()}`);
  }

  public async getSubscriberMasterList(params: {
    status?: string;
    collectionAreaId?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<SubscriberMasterListReport> {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.set("status", params.status);
    if (params.collectionAreaId) searchParams.set("collectionAreaId", params.collectionAreaId);
    if (params.search) searchParams.set("search", params.search);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());
    return this.request<SubscriberMasterListReport>(`/reports/subscribers-master?${searchParams.toString()}`);
  }

  public async getPaymentReversalsReport(params: {
    startDate?: string;
    endDate?: string;
  } = {}): Promise<PaymentReversalsReport> {
    const searchParams = new URLSearchParams();
    if (params.startDate) searchParams.set("startDate", params.startDate);
    if (params.endDate) searchParams.set("endDate", params.endDate);
    return this.request<PaymentReversalsReport>(`/reports/payment-reversals?${searchParams.toString()}`);
  }

  public async getAuditActivityReport(params: {
    startDate?: string;
    endDate?: string;
    actorUserId?: string;
    entityType?: string;
    action?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<AuditActivityReport> {
    const searchParams = new URLSearchParams();
    if (params.startDate) searchParams.set("startDate", params.startDate);
    if (params.endDate) searchParams.set("endDate", params.endDate);
    if (params.actorUserId) searchParams.set("actorUserId", params.actorUserId);
    if (params.entityType) searchParams.set("entityType", params.entityType);
    if (params.action) searchParams.set("action", params.action);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());
    return this.request<AuditActivityReport>(`/reports/audit-activity?${searchParams.toString()}`);
  }

  public async downloadReportFile(
    reportType: string,
    format: "xlsx" | "pdf" | "csv",
    params: Record<string, any> = {}
  ): Promise<void> {
    let endpoint = "";
    const searchParams = new URLSearchParams();
    searchParams.set("format", format);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && key !== "subscriberId") {
        searchParams.set(key, String(value));
      }
    }

    switch (reportType) {
      case "DAILY_COLLECTION":
        endpoint = `/reports/daily-collection/export?${searchParams.toString()}`;
        break;
      case "MONTHLY_COLLECTION":
        endpoint = `/reports/monthly-collection/export?${searchParams.toString()}`;
        break;
      case "BILLING_VS_COLLECTION":
        endpoint = `/reports/billing-vs-collection/export?${searchParams.toString()}`;
        break;
      case "AR_AGING":
        endpoint = `/reports/aging/export?${searchParams.toString()}`;
        break;
      case "SOA":
        endpoint = `/reports/soa/${params.subscriberId}/export?${searchParams.toString()}`;
        break;
      case "COLLECTOR_PERFORMANCE":
        endpoint = `/reports/collector-performance/export?${searchParams.toString()}`;
        break;
      case "PAYMENT_METHOD_SUMMARY":
        endpoint = `/reports/payment-methods/export?${searchParams.toString()}`;
        break;
      case "SUBSCRIBER_MASTER_LIST":
        endpoint = `/reports/subscribers-master/export?${searchParams.toString()}`;
        break;
      case "PAYMENT_REVERSALS":
        endpoint = `/reports/payment-reversals/export?${searchParams.toString()}`;
        break;
      case "AUDIT_ACTIVITY":
        endpoint = `/reports/audit-activity/export?${searchParams.toString()}`;
        break;
      default:
        throw new Error(`Unsupported export report type: ${reportType}`);
    }

    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers = new Headers();
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to download report: ${response.statusText}`);
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get("content-disposition");
    let filename = `BCIS-Report-${reportType}.${format}`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  }

  // --- System, Security & Backup Endpoints (Phase 9 - AT-12) ---

  public async listBackups(): Promise<BackupRecord[]> {
    const res = await this.request<{ data: BackupRecord[] }>("/system/backups");
    return res.data;
  }

  public async createBackup(params: {
    type?: "FULL" | "DATABASE_ONLY";
    notes?: string;
  } = {}): Promise<BackupRecord> {
    const res = await this.request<{ data: BackupRecord }>("/system/backups", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return res.data;
  }

  public async getBackupById(id: string): Promise<BackupRecord> {
    const res = await this.request<{ data: BackupRecord }>(`/system/backups/${id}`);
    return res.data;
  }

  public async verifyBackup(id: string): Promise<VerifyBackupResult> {
    const res = await this.request<{ data: VerifyBackupResult }>(`/system/backups/${id}/verify`, {
      method: "POST",
    });
    return res.data;
  }

  public async restoreBackup(id: string): Promise<RestoreBackupResult> {
    const res = await this.request<{ data: RestoreBackupResult }>(`/system/backups/${id}/restore`, {
      method: "POST",
    });
    return res.data;
  }

  public async checkDatabaseIntegrity(): Promise<DatabaseIntegrityReport> {
    const res = await this.request<{ data: DatabaseIntegrityReport }>("/system/database/integrity");
    return res.data;
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

// --- Phase 6: Collections Interfaces ---

export type CollectionBatchStatus = "OPEN" | "IN_PROGRESS" | "SUBMITTED" | "REMITTED" | "RECONCILED" | "CLOSED";
export type BatchAccountStatus = "UNPAID" | "PARTIAL" | "COLLECTED";

export interface CollectionBatch {
  id: string;
  batchNumber: string;
  collectorId: string;
  collectorCode?: string;
  collectorName?: string;
  collectorContact?: string | null;
  collectionAreaId: string;
  collectionAreaCode?: string;
  collectionAreaName?: string;
  collectionDate: string;
  status: CollectionBatchStatus;
  expectedCash: string;
  expectedNonCash: string;
  expectedTotal: string;
  collectedCash: string;
  collectedNonCash: string;
  collectedTotal: string;
  remittedCash: string;
  difference: string;
  shortageAmount: string;
  overageAmount: string;
  submittedAt?: string | null;
  reconciledAt?: string | null;
  closedAt?: string | null;
  notes?: string | null;
  openedBy?: string;
  openedByUsername?: string;
  openedByDisplayName?: string;
  createdAt: string;
}

export interface CollectionBatchAccount {
  id: string;
  collectionBatchId: string;
  serviceAccountId: string;
  serviceAccountNumber?: string;
  subscriberId?: string;
  subscriberAccountNumber?: string;
  subscriberFirstName?: string;
  subscriberLastName?: string;
  subscriberBusinessName?: string | null;
  subscriberDisplayName?: string;
  servicePlanName?: string;
  addressLine?: string;
  invoiceId: string;
  invoiceNumber?: string;
  expectedAmount: string;
  collectedAmount: string;
  status: BatchAccountStatus;
  collectedAt?: string | null;
  notes?: string | null;
}

export interface CollectorRemittance {
  id: string;
  collectionBatchId: string;
  remittanceNumber: string;
  remittedCash: string;
  remittedGcash: string;
  remittedBankTransfer: string;
  otherNonCash: string;
  totalRemitted: string;
  expectedCash: string;
  shortageAmount: string;
  overageAmount: string;
  receivedBy: string;
  receivedByUsername?: string;
  receivedByDisplayName?: string;
  receivedAt: string;
  notes?: string | null;
}

export interface CollectionBatchDetail extends CollectionBatch {
  accounts: CollectionBatchAccount[];
  remittances: CollectorRemittance[];
}

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
  collectionDate: string;
  serviceAccountIds?: string[];
  notes?: string;
}

export interface RecordFieldCollectionPayload {
  batchAccountId: string;
  amount: string;
  paymentMethod?: "CASH" | "GCASH" | "BANK_TRANSFER" | "CHECK" | "OTHER";
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

// Phase 7: Receivables, Aging, Suspension & Reconnection Interfaces

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

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface OutstandingReceivablesResponse {
  data: OutstandingReceivableItem[];
  totalOutstanding: string;
  pagination: PaginationInfo;
}

export interface OverdueReceivableItem extends OutstandingReceivableItem {
  daysOverdue: number;
  graceDaysConfigured: number;
  delinquencySeverity: string;
}

export interface OverdueReceivablesResponse {
  data: OverdueReceivableItem[];
  totalOverdue: string;
  gracePeriodDays: number;
  asOfDate: string;
  pagination: PaginationInfo;
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

export interface AgingReportResponse {
  summary: AgingReportSummary;
  subscribers: SubscriberAgingRow[];
  pagination: PaginationInfo;
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

export interface SuspensionCandidatesResponse {
  data: SuspensionCandidate[];
  thresholds: {
    gracePeriodDays: number;
    suspensionThresholdAmount: string;
    suspensionThresholdOverdueDays: number;
  };
  pagination: PaginationInfo;
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

export interface ReconnectionWorkOrder {
  id: string;
  reconnectionNumber: string;
  serviceAccountId: string;
  serviceAccountNumber: string;
  subscriberId: string;
  subscriberAccountNumber: string;
  subscriberDisplayName: string;
  subscriberMobile: string | null;
  servicePlanName: string;
  requestDate: string;
  fee: string;
  status: "REQUESTED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
  scheduledAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  technicianUserId?: string | null;
  createdAt: string;
}

export interface TechnicianUser {
  id: string;
  displayName: string;
  email: string;
  username: string;
}

// --- Phase 8: Reports, General Ledger, Audit Trails & Compliance Interfaces ---

export interface DashboardMetrics {
  kpis: {
    currentReceivable: string;
    overdueReceivable: string;
    todayCollection: string;
    currentBilling: string;
    pendingGcashCount: number;
    reconciliationExceptionsCount: number;
  };
  supporting: {
    billingVsCollectionTrend: Array<{
      cycleId: string;
      cycleCode: string;
      period: string;
      billedAmount: string;
      collectedAmount: string;
      billedNumber: string;
      collectedNumber: string;
    }>;
    paymentMethodBreakdown: Array<{
      method: string;
      amount: string;
      count: number;
      percentage: number;
    }>;
    agingSummary: {
      totalReceivable: string;
      current: { amount: string; count: number; percentage: number };
      days1to30: { amount: string; count: number; percentage: number };
      days31to60: { amount: string; count: number; percentage: number };
      days61to90: { amount: string; count: number; percentage: number };
      days90Plus: { amount: string; count: number; percentage: number };
    };
    topCollectors: Array<{
      id: string;
      name: string;
      code: string;
      areaName: string;
      collectedThisMonth: string;
      batchesCount: number;
      efficiencyPercentage: number;
    }>;
    delinquencyAlerts: {
      overdueInvoicesCount: number;
      daysOverdue30PlusCount: number;
    };
    recentPayments: Array<{
      id: string;
      receiptNumber: string;
      paymentDate: string;
      amount: string;
      paymentMethod: string;
      subscriberName: string;
      collectorName: string;
    }>;
  };
  asOfDate: string;
}

export interface DailyCollectionReport {
  reportType: "DAILY_COLLECTION";
  date: string;
  totalCollected: string;
  rawTotalCollected: string;
  totalTransactions: number;
  byPaymentMethod: Array<{
    method: string;
    amount: string;
    count: number;
    percentage: number;
  }>;
  byCashier: Array<{
    cashierId: string;
    cashierName: string;
    amount: string;
    count: number;
  }>;
  byCollector: Array<{
    collectorId: string;
    collectorName: string;
    amount: string;
    count: number;
  }>;
  items: Array<{
    id: string;
    receiptNumber: string;
    paymentDate: string;
    createdAt: string;
    subscriberAccountNumber: string;
    subscriberDisplayName: string;
    paymentMethod: string;
    referenceNumber: string;
    amount: string;
    rawAmount: string;
    cashierName: string;
    collectorName: string;
    batchNumber: string;
    notes: string;
  }>;
}

export interface MonthlyCollectionReport {
  reportType: "MONTHLY_COLLECTION";
  yearMonth: string;
  startDate: string;
  endDate: string;
  totalCollected: string;
  rawTotalCollected: string;
  totalTransactions: number;
  dailyAverage: string;
  highestDay: {
    date: string;
    amount: string;
  };
  byPaymentMethod: Array<{
    method: string;
    amount: string;
    count: number;
    percentage: number;
  }>;
  days: Array<{
    date: string;
    amount: string;
    rawAmount: string;
    transactionsCount: number;
  }>;
}

export interface BillingVsCollectionReport {
  reportType: "BILLING_VS_COLLECTION";
  year: string | number;
  overall: {
    totalBilled: string;
    rawTotalBilled: string;
    totalCollected: string;
    rawTotalCollected: string;
    outstandingBalance: string;
    rawOutstandingBalance: string;
    collectionEfficiency: number;
    invoicesCount: number;
    paidInvoicesCount: number;
  };
  cycles: Array<{
    cycleId: string;
    cycleCode: string;
    startDate: string;
    endDate: string;
    dueDate: string;
    status: string;
    invoicesCount: number;
    paidInvoicesCount: number;
    totalBilled: string;
    rawTotalBilled: string;
    totalCollected: string;
    rawTotalCollected: string;
    outstandingBalance: string;
    rawOutstandingBalance: string;
    collectionEfficiency: number;
  }>;
}

export interface FullAgingReport {
  reportType: "AR_AGING";
  asOfDate: string;
  summary: AgingReportSummary;
  byArea: Array<{
    areaId: string;
    areaName: string;
    current: string;
    days1to30: string;
    days31to60: string;
    days61to90: string;
    days90Plus: string;
    total: string;
  }>;
  subscribers: Array<{
    subscriberId: string;
    subscriberAccountNumber: string;
    displayName: string;
    mobile: string;
    areaName: string;
    current: string;
    days1to30: string;
    days31to60: string;
    days61to90: string;
    days90Plus: string;
    totalDue: string;
    maxDaysPastDue: number;
  }>;
}

export interface SubscriberSOA {
  statementNumber: string;
  statementDate: string;
  company: {
    name: string;
    address: string;
    contactNumber: string;
    email: string;
    tin: string;
  };
  subscriber: {
    id: string;
    accountNumber: string;
    displayName: string;
    address: string;
    mobileNumber: string;
    email: string | null;
    status: string;
  };
  serviceAccounts: Array<{
    id: string;
    serviceAccountNumber: string;
    planName: string;
    monthlyRate: string;
    area: string;
    collector: string;
    status: string;
  }>;
  financialSummary: {
    previousBalance: string;
    currentCharges: string;
    totalAmountDue: string;
    rawTotalAmountDue: string;
    dueDate: string;
    aging: {
      current: string;
      days1to30: string;
      days31to60: string;
      days61to90: string;
      days90Plus: string;
    };
  };
  invoices: Array<{
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    cycleCode: string;
    serviceAccountNumber: string;
    totalAmount: string;
    balanceDue: string;
    status: string;
  }>;
  payments: Array<{
    receiptNumber: string;
    paymentDate: string;
    amount: string;
    paymentMethod: string;
    referenceNumber: string;
  }>;
  ledger: Array<{
    entryNo: number;
    postedAt: string;
    referenceType: string;
    description: string;
    debitAmount: string;
    creditAmount: string;
    runningBalance: string;
  }>;
}

export interface CollectorPerformanceReport {
  reportType: "COLLECTOR_PERFORMANCE";
  startDate: string;
  endDate: string;
  overall: {
    totalBatches: number;
    totalExpected: string;
    rawTotalExpected: string;
    totalCollected: string;
    rawTotalCollected: string;
    totalRemitted: string;
    rawTotalRemitted: string;
    totalShortage: string;
    totalOverage: string;
    overallEfficiency: number;
  };
  collectors: Array<{
    collectorId: string;
    collectorCode: string;
    name: string;
    contactNumber: string;
    assignedArea: string;
    batchesCount: number;
    reconciledBatchesCount: number;
    expectedCash: string;
    rawExpectedCash: string;
    collectedCash: string;
    rawCollectedCash: string;
    remittedCash: string;
    rawRemittedCash: string;
    shortageAmount: string;
    overageAmount: string;
    collectionEfficiency: number;
    remittanceAccuracy: number;
    recentBatches: Array<{
      batchNumber: string;
      date: string;
      status: string;
      collected: string;
      remitted: string;
      difference: string;
    }>;
  }>;
}

export interface PaymentMethodSummaryReport {
  reportType: "PAYMENT_METHOD_SUMMARY";
  startDate: string;
  endDate: string;
  totalAmount: string;
  rawTotalAmount: string;
  totalTransactions: number;
  methods: Array<{
    method: string;
    amount: string;
    rawAmount: string;
    count: number;
    percentage: number;
    averageAmount: string;
  }>;
}

export interface SubscriberMasterListReport {
  reportType: "SUBSCRIBER_MASTER_LIST";
  pagination: PaginationInfo;
  items: Array<{
    id: string;
    accountNumber: string;
    displayName: string;
    contactNumber: string;
    primaryArea: string;
    primaryPlan: string;
    serviceAccountsCount: number;
    balanceDue: string;
    rawBalanceDue: string;
    status: string;
    registeredDate: string;
  }>;
}

export interface PaymentReversalsReport {
  reportType: "PAYMENT_REVERSALS";
  startDate: string;
  endDate: string;
  totalReversedAmount: string;
  rawTotalReversedAmount: string;
  totalCount: number;
  items: Array<{
    id: string;
    paymentNumber: string;
    receiptNumber: string;
    paymentDate: string;
    amount: string;
    rawAmount: string;
    paymentMethod: string;
    referenceNumber: string;
    subscriberAccountNumber: string;
    subscriberDisplayName: string;
    reversedAt: string;
    reversedByName: string;
    reversalReason: string;
  }>;
}

export interface AuditActivityReport {
  reportType: "AUDIT_ACTIVITY";
  pagination: PaginationInfo;
  items: Array<{
    id: string;
    occurredAt: string;
    actorUserId: string | null;
    actorName: string;
    actorUsername: string;
    action: string;
    entityType: string;
    entityId: string | null;
    requestId: string | null;
    reason: string;
    ipAddress: string;
    metadata: any;
    oldValues: any;
    newValues: any;
  }>;
}

export interface BackupRecord {
  id: string;
  backupType: "FULL" | "DATABASE_ONLY";
  fileName: string;
  filePath: string;
  startedAt: string;
  completedAt: string | null;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED" | "RESTORE_TESTED";
  fileSizeBytes: number | null;
  sha256: string | null;
  tableCounts: Record<string, number> | null;
  createdBy: string | null;
  verifiedAt: string | null;
  verificationStatus: "PENDING" | "VERIFIED" | "FAILED";
  verificationNotes: string | null;
  notes: string | null;
  createdAt: string;
}

export interface DatabaseIntegrityReport {
  isHealthy: boolean;
  issues: string[];
  stats: Record<string, number>;
  timestamp: string;
}

export interface VerifyBackupResult {
  id: string;
  fileName: string;
  verified: boolean;
  status: "VERIFIED" | "FAILED";
  sha256?: string;
  error?: string;
  tableCounts?: Record<string, number>;
}

export interface RestoreBackupResult {
  success: boolean;
  backupId: string;
  fileName: string;
  status: string;
  tableCounts: Record<string, number>;
  restoredAt: string;
}

export const api = new ApiClient();


