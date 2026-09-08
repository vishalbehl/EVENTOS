import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_VENUE_SERVER_URL || "http://127.0.0.1:8001";
const SRR_STATION_ID = process.env.NEXT_PUBLIC_SRR_STATION_ID || "";
const SRR_ENROLLMENT_TOKEN = process.env.NEXT_PUBLIC_SRR_DEVICE_KEY || "";

class ApiClient {
  private client: AxiosInstance;
  private srrAccessToken: string | null = null;
  private srrTokenPromise: Promise<string | null> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 60000,
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
        ...(SRR_ENROLLMENT_TOKEN && !SRR_STATION_ID ? { "X-Device-Key": SRR_ENROLLMENT_TOKEN } : {}),
      },
    });

    this.client.interceptors.request.use(async (config) => {
      if (typeof window === "undefined" || !SRR_STATION_ID || !SRR_ENROLLMENT_TOKEN || config.url?.includes("/api/v1/auth/srr/token")) {
        return config;
      }
      if (!this.srrAccessToken) {
        if (!this.srrTokenPromise) {
          this.srrTokenPromise = axios.post(`${BASE_URL}/api/v1/auth/srr/token`, {
            station_id: SRR_STATION_ID,
            enrollment_token: SRR_ENROLLMENT_TOKEN,
          }, { headers: { "Content-Type": "application/json" }, timeout: 15000 })
            .then((response) => {
              this.srrAccessToken = response.data.access_token || null;
              return this.srrAccessToken;
            })
            .finally(() => { this.srrTokenPromise = null; });
        }
        await this.srrTokenPromise;
      }
      if (this.srrAccessToken) config.headers.set("X-Device-Key", this.srrAccessToken);
      return config;
    });


    this.client.interceptors.response.use(
      (response) => response.data,
      async (error) => {
        if (error.response?.status === 401 && this.srrAccessToken && SRR_STATION_ID && SRR_ENROLLMENT_TOKEN && !error.config?._srrRetried) {
          this.srrAccessToken = null;
          const retryConfig = { ...error.config, _srrRetried: true };
          return this.client.request(retryConfig);
        }
        const message =
          error.response?.data?.detail ||
          error.response?.data?.message ||
          error.message ||
          "Network request failed";
        const wrapped = new Error(message) as Error & { status?: number };
        wrapped.status = error.response?.status;
        return Promise.reject(wrapped);
      }
    );
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.get(url, config);
    return res as T;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.post(url, data, config);
    return res as T;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.patch(url, data, config);
    return res as T;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.delete(url, config);
    return res as T;
  }
}

export const apiClient = new ApiClient();
