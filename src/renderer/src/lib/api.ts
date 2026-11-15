import { useAuthStore } from "@/store/authStore"
import { ApiError, NetworkError } from "./errors"
import { toCamel, toSnake } from "./caseKeys"

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
  const { params, json, headers, method = "GET", body: rawBody } = init
  const url = buildUrl(path, params)

  /* Outgoing request bodies must be snake-cased so Express controllers
     reading from `req.body.payment_type` / `req.body.diagnosis` find
     the field they expect. The renderer only speaks camelCase.
     Without this, every POST/PUT/PATCH from the wizard (and the
     patient/admission/bill mutations that follow) gets a 400 from
     the server with "X is required" — invisible to the form. */
  let body: BodyInit | undefined
  if (json !== undefined) {
    body = JSON.stringify(toSnake(json))
  } else if (rawBody !== undefined) {
    body = rawBody as BodyInit
  }

  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(headers as Record<string, string> | undefined),
    },
    method,
    body,
    ...(init as Omit<typeof init, "params" | "json" | "headers" | "method">),
  }).catch((cause: unknown) => {
    /* `fetch` rejects only when no HTTP response is produced (offline,
       DNS, connection reset). Normalise it into the same error taxonomy
       consumers already branch on, with `statusCode === 0`. */
    throw new NetworkError(url, cause)
  })

  if (res.status === 401) {
    useAuthStore.getState().logout()
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login"
    }
    throw new ApiError(401, "Unauthorized", url)
  }

  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as {
      error?: string
      code?: string
    } | null
    const message = errBody?.error || res.statusText || `HTTP ${res.status}`
    throw new ApiError(res.status, message, url, errBody?.code)
  }

  if (res.status === 204) return undefined as T
  return toCamel((await res.json()) as unknown) as T
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
