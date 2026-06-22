import { useAuthStore } from "@/store/authStore"
import { ApiError } from "./errors"

const BASE = "/api"

type QueryParams = Record<string, string | number | boolean | undefined | null>

function buildUrl(path: string, params?: QueryParams): string {
  if (!params) return `${BASE}${path}`
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${BASE}${path}?${qs}` : `${BASE}${path}`
}

async function request<T>(
  path: string,
  init: RequestInit & { params?: QueryParams; json?: unknown } = {}
): Promise<T> {
  const { params, json, headers, ...rest } = init
  const url = buildUrl(path, params)

  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(headers as Record<string, string> | undefined),
    },
    body: json !== undefined ? JSON.stringify(json) : (rest as RequestInit).body,
    ...rest,
  })

  if (res.status === 401) {
    useAuthStore.getState().logout()
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login"
    }
    throw new ApiError(401, "Unauthorized", url)
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    const message = body?.error || res.statusText || `HTTP ${res.status}`
    throw new ApiError(res.status, message, url)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string, params?: QueryParams) =>
    request<T>(path, { method: "GET", params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", json: body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", json: body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", json: body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
}
