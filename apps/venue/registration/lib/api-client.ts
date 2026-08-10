// services/api-client.ts (Updated: 2026-05-05)

import axios, { AxiosError, AxiosInstance, AxiosResponse, AxiosRequestConfig } from "axios"

export interface ApiError {
  message: string
  status?: number
  details?: any
  authExpired?: boolean
}

const DEFAULT_REGISTRATION_SERVER_URL = "http://127.0.0.1:8001"
const DEFAULT_NODE_AGENT_URL = "http://127.0.0.1:8011"
const CONFIGURED_API_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_REGISTRATION_SERVER_URL

export function resolveApiBaseUrl() {
  if (typeof window !== "undefined") {
    const desktopApi = (window as any).venueDesktop
    if (desktopApi?.isDesktop) {
      return `${DEFAULT_REGISTRATION_SERVER_URL}/api/v1`
    }
  }
  return `${CONFIGURED_API_URL.replace(/\/$/, "")}/api/v1`
}

const API_BASE_URL = resolveApiBaseUrl()
let authExpiredEventSent = false

function hasNodeConfiguration() {
  if (typeof window === "undefined") return false
  try {
    return Boolean(JSON.parse(localStorage.getItem("venue-node-configuration") || "null")?.enrollment_token)
  } catch {
    return false
  }
}

function canUseLocalNodeFallback(url?: string) {
  if (!url || typeof window === "undefined") return false
  const desktopApi = (window as any).venueDesktop
  if (!desktopApi?.isDesktop || !hasNodeConfiguration()) return false
  const path = url.startsWith("http") ? new URL(url).pathname.replace(/^\/api\/v1/, "") : url
  if (path.includes("/change-gate") || path.includes("/override-scan")) return false
  return (
    path.startsWith("/venue/scanning/") ||
    path.startsWith("/venue/registration/participants") ||
    path.startsWith("/venue/registration/summary")
  )
}

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
        config.baseURL = (config as AxiosRequestConfig & { __useLocalNode?: boolean }).__useLocalNode
          ? `${DEFAULT_NODE_AGENT_URL}/api/v1`
          : resolveApiBaseUrl()
        // Add auth token if available from Zustand storage
        if (typeof window !== "undefined") {
          try {
            const storage = localStorage.getItem("obsidian-auth-storage")
            if (storage && storage !== "undefined" && storage !== "null" && storage.trim() !== "") {
              const parsed = JSON.parse(storage)
              const token = parsed.state?.accessToken
              if (token) {
                config.headers.Authorization = `Bearer ${token}`
              }
            }
            const nodeConfig = localStorage.getItem("venue-node-configuration")
            if (nodeConfig) {
              const parsedNode = JSON.parse(nodeConfig)
              if (parsedNode?.enrollment_token) config.headers["X-Venue-Node-Token"] = parsedNode.enrollment_token
            }
          } catch (e) {
            console.error("Failed to parse auth storage", e)
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
        const originalConfig = error.config as (AxiosRequestConfig & { __retriedLocalNode?: boolean }) | undefined
        if (!error.response && originalConfig && !originalConfig.__retriedLocalNode && canUseLocalNodeFallback(String(originalConfig.url || ""))) {
          originalConfig.__retriedLocalNode = true
          ;(originalConfig as AxiosRequestConfig & { __useLocalNode?: boolean }).__useLocalNode = true
          originalConfig.baseURL = `${DEFAULT_NODE_AGENT_URL}/api/v1`
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("eventos-local-node-fallback", {
              detail: { url: originalConfig.url, nodeUrl: DEFAULT_NODE_AGENT_URL },
            }))
          }
          return this.client.request(originalConfig)
        }

        const apiError: ApiError = {
          message: "Something went wrong",
        }

        if (error.response) {
          apiError.status = error.response.status
          apiError.message =
            (error.response.data as any)?.detail ||
            (error.response.data as any)?.message ||
            error.message

          apiError.details = error.response.data
          if (error.response.status === 401 && typeof window !== "undefined") {
            apiError.authExpired = true
            try {
              localStorage.removeItem("obsidian-auth-storage")
              if (!authExpiredEventSent) {
                authExpiredEventSent = true
                window.dispatchEvent(new CustomEvent("eventos-auth-expired", {
                  detail: { message: apiError.message },
                }))
                window.setTimeout(() => {
                  authExpiredEventSent = false
                }, 5000)
              }
            } catch {
              // Ignore storage/event failures; the request should still reject.
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

  public async download(url: string): Promise<AxiosResponse<Blob>> {
    return this.client.get<Blob>(url, { responseType: "blob" });
  }
}

export const apiClient = new ApiClient()

// Helper functions for backward compatibility with existing hooks
export function apiGet<T>(url: string, config?: AxiosRequestConfig) { return apiClient.get<T>(url, config) }
export function apiPost<T>(url: string, data?: any, config?: AxiosRequestConfig) { return apiClient.post<T>(url, data, config) }
export function apiPatch<T>(url: string, data?: any, config?: AxiosRequestConfig) { return apiClient.patch<T>(url, data, config) }
export function apiPut<T>(url: string, data?: any, config?: AxiosRequestConfig) { return apiClient.put<T>(url, data, config) }
export function apiDelete<T>(url: string, config?: AxiosRequestConfig) { return apiClient.delete<T>(url, config) }
