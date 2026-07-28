import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

import { useAuthStore } from "@/store/use-auth-store";

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string | Record<string, unknown> | unknown[];
  instance?: string;
  code?: string;
  errors?: Record<string, string[] | string>;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly problem?: ProblemDetails;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly retryable: boolean;
  readonly retryAfter?: number;

  constructor(options: {
    message: string;
    status?: number;
    code?: string;
    problem?: ProblemDetails;
    requestId?: string;
    correlationId?: string;
    retryable?: boolean;
    retryAfter?: number;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code || "API_ERROR";
    this.problem = options.problem;
    this.requestId = options.requestId;
    this.correlationId = options.correlationId;
    this.retryable = options.retryable ?? false;
    this.retryAfter = options.retryAfter;
  }
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
}

interface RefreshResponse {
  access_token: string;
  token_type: string;
  user: import("@/store/use-auth-store").User;
}

export interface DownloadedFile {
  blob: Blob;
  filename?: string;
  requestId?: string;
  correlationId?: string;
}

export function parseDownloadFilename(disposition?: string) {
  if (!disposition) return undefined;
  const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainFilename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return encodedFilename ? decodeURIComponent(encodedFilename) : plainFilename;
}

const API_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/v1`;
const DEFAULT_TIMEOUT_MS = 30_000;

function newRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function headerValue(headers: unknown, key: string): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const value = (headers as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function toApiError(error: AxiosError<ProblemDetails>): ApiError {
  const problem = error.response?.data;
  const status = error.response?.status;
  const requestHeaders = error.config?.headers;
  const responseHeaders = error.response?.headers;

  let message = "The request could not be completed.";
  if (typeof problem?.detail === "string") {
    message = problem.detail;
  } else if (Array.isArray(problem?.detail)) {
    message = problem.detail
      .map((item: any) => (typeof item === "string" ? item : item?.msg || item?.message || JSON.stringify(item)))
      .join(", ");
  } else if (problem?.detail && typeof problem.detail === "object") {
    message = JSON.stringify(problem.detail);
  } else if (problem?.title) {
    message = String(problem.title);
  } else if (error.message) {
    message = error.message;
  }

  return new ApiError({
    message,
    status,
    code: problem?.code || headerValue(responseHeaders, "x-error-code") || (status ? `HTTP_${status}` : error.code || "NETWORK_ERROR"),
    problem,
    requestId:
      headerValue(responseHeaders, "x-request-id") ||
      headerValue(requestHeaders, "X-Request-ID") ||
      headerValue(requestHeaders, "x-request-id"),
    correlationId:
      headerValue(responseHeaders, "x-correlation-id") ||
      headerValue(requestHeaders, "X-Correlation-ID") ||
      headerValue(requestHeaders, "x-correlation-id"),
    retryable: !status || status === 408 || status === 429 || status >= 500,
    retryAfter: Number(headerValue(responseHeaders, "retry-after")) || undefined,
  });
}

class ApiClient {
  private readonly client: AxiosInstance;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: DEFAULT_TIMEOUT_MS,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      withCredentials: true,
    });

    this.initializeRequestInterceptor();
    this.initializeResponseInterceptor();
  }

  private initializeRequestInterceptor() {
    this.client.interceptors.request.use((config) => {
      const { accessToken, updateActivity } = useAuthStore.getState();
      if (accessToken && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }

      const requestId = String(config.headers["X-Request-ID"] || newRequestId());
      config.headers["X-Request-ID"] = requestId;
      config.headers["X-Correlation-ID"] = String(config.headers["X-Correlation-ID"] || requestId);
      updateActivity();
      return config;
    });
  }

  private initializeResponseInterceptor() {
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError<ProblemDetails>) => {
        const request = error.config as RetriableRequestConfig | undefined;
        const isRefreshRequest = request?.url?.includes("/auth/command-center/refresh");

        if (error.response?.status === 401 && request && !request._authRetry && !isRefreshRequest) {
          request._authRetry = true;
          try {
            const accessToken = await this.refreshAccessToken();
            request.headers.Authorization = `Bearer ${accessToken}`;
            return await this.client.request(request);
          } catch {
            useAuthStore.getState().logout();
            if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:session-expired"));
          }
        }

        return Promise.reject(toApiError(error));
      },
    );
  }

  private refreshAccessToken(): Promise<string> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = axios
      .post<RefreshResponse>(`${API_BASE_URL}/auth/command-center/refresh`, undefined, {
        timeout: DEFAULT_TIMEOUT_MS,
        withCredentials: true,
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": newRequestId(),
        },
      })
      .then(({ data }) => {
        const rememberMe = useAuthStore.getState().rememberMe;
        useAuthStore.getState().setAuth(data.user, data.access_token, undefined, rememberMe);
        return data.access_token;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return (await this.client.get<T>(url, config)).data;
  }

  public async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return (await this.client.post<T>(url, data, config)).data;
  }

  public async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return (await this.client.patch<T>(url, data, config)).data;
  }

  public async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return (await this.client.put<T>(url, data, config)).data;
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return (await this.client.delete<T>(url, config)).data;
  }

  public async download(url: string, config?: AxiosRequestConfig): Promise<DownloadedFile> {
    const response = await this.client.get<Blob>(url, { ...config, responseType: "blob" });
    return {
      blob: response.data,
      filename: parseDownloadFilename(headerValue(response.headers, "content-disposition")),
      requestId: headerValue(response.headers, "x-request-id"),
      correlationId: headerValue(response.headers, "x-correlation-id"),
    };
  }

  public async uploadPresigned(url: string, body: Blob, headers: Record<string, string> = {}): Promise<void> {
    try {
      await axios.put(url, body, { headers, timeout: 120_000 });
    } catch (error) {
      if (axios.isAxiosError<ProblemDetails>(error)) throw toApiError(error);
      throw error;
    }
  }
}

export const apiClient = new ApiClient();

export function apiGet<T>(url: string, config?: AxiosRequestConfig) { return apiClient.get<T>(url, config); }
export function apiPost<T>(url: string, data?: unknown, config?: AxiosRequestConfig) { return apiClient.post<T>(url, data, config); }
export function apiPatch<T>(url: string, data?: unknown, config?: AxiosRequestConfig) { return apiClient.patch<T>(url, data, config); }
export function apiPut<T>(url: string, data?: unknown, config?: AxiosRequestConfig) { return apiClient.put<T>(url, data, config); }
export function apiDelete<T>(url: string, config?: AxiosRequestConfig) { return apiClient.delete<T>(url, config); }
export function apiDownload(url: string, config?: AxiosRequestConfig) { return apiClient.download(url, config); }

export function saveDownloadedFile(file: DownloadedFile, fallbackFilename: string) {
  const blobUrl = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = file.filename || fallbackFilename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}
