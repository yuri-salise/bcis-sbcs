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

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:3001/api/v1";
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers = new Headers(options.headers);

    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
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
    // Call server root /ready
    const rootUrl = this.baseUrl.replace(/\/api\/v1\/?$/, "");
    const response = await fetch(`${rootUrl}/ready`);
    return response.json() as Promise<ReadyResponse>;
  }
}

export const api = new ApiClient();
