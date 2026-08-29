import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_VENUE_SERVER_URL || "http://127.0.0.1:8001";

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 15000,
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.client.interceptors.request.use((config) => {
      if (typeof window !== "undefined") {
        const deviceKey = localStorage.getItem("eventos_srr_device_key");
        if (deviceKey) {
          config.headers["X-Device-Key"] = deviceKey;
        }
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response.data,
      (error) => {
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
