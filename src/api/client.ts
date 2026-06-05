// Single-Source axios-Instance:
//  - baseURL aus VITE_API_BASE_URL
//  - Request-Interceptor: X-Request-Id (auto-uuid), X-Trace-Id (propagation), Auth-Bearer
//  - Response-Interceptor: 401 → auth-failure-Event, typed ApiError-Mapping

import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse } from "axios"
import { newRequestId, getTraceId, persistTraceId } from "@/lib/trace"

export interface ApiErrorBody {
  code: string
  message: string
  request_id?: string
  details?: unknown
}

export class ApiError extends Error {
  status: number
  code: string
  requestId?: string
  details?: unknown

  constructor(body: ApiErrorBody, status: number) {
    super(body.message)
    this.name = "ApiError"
    this.status = status
    this.code = body.code
    this.requestId = body.request_id
    this.details = body.details
  }
}

const AUTH_STORAGE_KEY = "roadmap-auth-token"

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return
  try {
    if (token) window.localStorage.setItem(AUTH_STORAGE_KEY, token)
    else window.localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // localStorage nicht verfügbar
  }
}

export const AUTH_FAILURE_EVENT = "roadmap:auth-failure"

function dispatchAuthFailure() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(AUTH_FAILURE_EVENT))
}

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "/api"

export const axiosInstance = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 30_000,
})

axiosInstance.interceptors.request.use((config) => {
  config.headers.set("X-Request-Id", newRequestId())
  const traceId = getTraceId()
  if (traceId) {
    config.headers.set("X-Trace-Id", traceId)
  }
  const token = getAuthToken()
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`)
  }
  return config
})

axiosInstance.interceptors.response.use(
  (response) => {
    const traceId = response.headers["x-trace-id"]
    if (typeof traceId === "string" && traceId.length > 0) {
      persistTraceId(traceId)
    }
    return response
  },
  (error: AxiosError<ApiErrorBody>) => {
    if (error.response?.status === 401) {
      setAuthToken(null)
      dispatchAuthFailure()
    }

    if (error.response?.data && typeof error.response.data === "object") {
      const body = error.response.data
      if (body.code && body.message) {
        return Promise.reject(new ApiError(body, error.response.status))
      }
    }

    return Promise.reject(
      new ApiError(
        {
          code: error.code === "ECONNABORTED" ? "TIMEOUT" : "NETWORK_ERROR",
          message: error.message ?? "Unbekannter Netzwerkfehler",
        },
        error.response?.status ?? 0,
      ),
    )
  },
)

export const axiosClient = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance.request<unknown, AxiosResponse<T>>(config).then((res) => res.data)
}

export default axiosClient
