// services/api-client.ts (Updated: 2026-05-05)

import axios, { AxiosError, AxiosInstance, AxiosResponse, AxiosRequestConfig } from "axios"
import { getErrorMessage } from "./utils"

export interface ApiError {
  message: string
  status?: number
  code?: string
  details?: any
}

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000") + "/api/v1"

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 60000,
      headers: {
        "Content-Type": "application/json",
      },
    })

    this.initializeRequestInterceptor()
    this.initializeResponseInterceptor()
  }

  private initializeRequestInterceptor() {
    this.client.interceptors.request.use(
      (config) => {
        // Add auth token if available from Zustand storage
        if (typeof window !== "undefined") {
          try {
            const storage = localStorage.getItem("obsidian-auth-storage")
            if (storage) {
              const parsed = JSON.parse(storage)
              const token = parsed.state?.accessToken
              if (token) {
                config.headers.Authorization = `Bearer ${token}`
              }
            }
          } catch (e) {
            console.error("Failed to parse auth storage", e)
          }
        }

        // Automatically inject Idempotency-Key for mutating requests if not present
        const method = (config.method || "").toUpperCase()
        if (["POST", "PUT", "PATCH"].includes(method)) {
          if (!config.headers["Idempotency-Key"] && !config.headers["idempotency-key"]) {
            const randomKey = typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `idem-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
            config.headers["Idempotency-Key"] = randomKey
          }
        }

        return config
      },
      (error) => Promise.reject(error)
    )
  }

  private initializeResponseInterceptor() {
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: AxiosError) => {
        const apiError: ApiError = {
          message: "Something went wrong",
        }

        if (error.response) {
          const responseBody = error.response.data as any
          const detail = responseBody?.detail
          apiError.status = error.response.status
          apiError.message = getErrorMessage(
            detail ??
              responseBody?.message ??
              error.message,
            "Something went wrong"
          )
          apiError.code = responseBody?.code ?? (detail && typeof detail === "object" ? detail.code : undefined)
          apiError.details = responseBody

          if (error.response.status === 401 && typeof window !== "undefined") {
            try {
              const storage = localStorage.getItem("obsidian-auth-storage")
              if (storage) {
                const parsed = JSON.parse(storage)
                if (parsed.state?.isAuthenticated || parsed.state?.accessToken) {
                  localStorage.removeItem("obsidian-auth-storage")
                  if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/signup")) {
                    window.location.href = "/login?expired=1"
                  }
                }
              }
            } catch (e) {
              console.error("Failed to handle 401 session expiry", e)
            }
          }
        } else if (error.request) {
          apiError.message = "No response from server"
        } else {
          apiError.message = error.message
        }

        return Promise.reject(apiError)
      }
    )
  }

  // ================= GENERIC METHODS =================

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config)
    return response.data
  }

  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config)
    return response.data
  }

  public async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config)
    return response.data
  }

  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config)
    return response.data
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config)
    return response.data
  }
}

export const apiClient = new ApiClient()

// Helper functions for backward compatibility with existing hooks
export function apiGet<T>(url: string, config?: AxiosRequestConfig) { return apiClient.get<T>(url, config) }
export function apiPost<T>(url: string, data?: any, config?: AxiosRequestConfig) { return apiClient.post<T>(url, data, config) }
export function apiPatch<T>(url: string, data?: any, config?: AxiosRequestConfig) { return apiClient.patch<T>(url, data, config) }
export function apiPut<T>(url: string, data?: any, config?: AxiosRequestConfig) { return apiClient.put<T>(url, data, config) }
export function apiDelete<T>(url: string, config?: AxiosRequestConfig) { return apiClient.delete<T>(url, config) }
