import axios, { AxiosError, AxiosRequestConfig } from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL 
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1` 
  : "http://127.0.0.1:8001/api/v1";

export const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use((config) => {
  if (typeof window !== "undefined" && !config.url?.endsWith("/auth/step-up")) {
    const token = window.sessionStorage.getItem("venue_step_up_token")
    if (token) config.headers.set("X-Step-Up-Token", token)
  }
  return config
});

// Response Interceptor: Error normalization
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ detail?: string; message?: string }>) => {
    const original = error.config;
    if (error.response?.status === 428 && original && !(original as AxiosRequestConfig & { _stepUpRetried?: boolean })._stepUpRetried && typeof window !== "undefined") {
      const password = window.prompt("Administrator password required for this protected action")
      if (password) {
        try {
          const stepUp = await axiosInstance.post<{ step_up_token: string }>("/auth/step-up", { password })
          window.sessionStorage.setItem("venue_step_up_token", stepUp.data.step_up_token)
          const retryConfig = original as AxiosRequestConfig & { _stepUpRetried?: boolean }
          retryConfig._stepUpRetried = true
          retryConfig.headers = { ...(retryConfig.headers || {}), "X-Step-Up-Token": stepUp.data.step_up_token }
          return axiosInstance.request(retryConfig)
        } catch {
          // Fall through to the normal error message so the action remains explicit.
        }
      }
    }
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("venue-auth-expired"));
      }
    }
    const message = error.response?.data?.detail || error.response?.data?.message || error.message || "Unknown error";
    return Promise.reject(new Error(message));
  }
);

export const apiClient = {
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const res = await axiosInstance.get<T>(url, config);
    return res.data;
  },
  post: async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    const res = await axiosInstance.post<T>(url, data, config);
    return res.data;
  },
  put: async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    const res = await axiosInstance.put<T>(url, data, config);
    return res.data;
  },
  patch: async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    const res = await axiosInstance.patch<T>(url, data, config);
    return res.data;
  },
  delete: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const res = await axiosInstance.delete<T>(url, config);
    return res.data;
  },
};

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const apiGet = apiClient.get;
export const apiPost = apiClient.post;
export const apiPatch = apiClient.patch;
export const apiDelete = apiClient.delete;
