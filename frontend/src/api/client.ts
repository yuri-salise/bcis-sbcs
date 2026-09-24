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
}

export const api = new ApiClient();
