/**
 * Lightweight error class for API failures.
 *
 * Components up the tree (DataTable rows, dialog loaders, forms)
 * catch `ApiError` and branch on `statusCode`:
 *   - 401 → auth cleared by api wrapper, no consumer action required.
 *   - 403 → show Sonner `warning` toast ("Insufficient permission").
 *   - 404 → render <EmptyState> with the resource-specific message.
 *   - 5xx → fail back to Sonner `error` toast with retry CTA.
 *
 * `code` carries the server's machine-readable failure code (e.g.
 * `USER_IN_USE`, `ROLE_NAME_IMMUTABLE`) when the endpoint supplies one. Status
 * codes are too coarse for the admin console — several distinct failures share
 * 400 — and `message` is English, so a bilingual UI must branch on `code`.
 */
export class ApiError extends Error {
  readonly statusCode: number
  readonly endpoint: string
  readonly code?: string

  constructor(
    statusCode: number,
    message: string,
    endpoint: string,
    code?: string
  ) {
    super(message)
    this.name = "ApiError"
    this.statusCode = statusCode
    this.endpoint = endpoint
    this.code = code
  }
}

/**
 * Transport failure — the request never produced an HTTP response
 * (offline, DNS failure, connection reset, server down).
 *
 * Extends `ApiError` so existing `instanceof ApiError` branches keep
 * handling it, with two discriminators:
 *   - `statusCode === 0` (no HTTP status exists; never 401/403/404/5xx)
 *   - `code === "NETWORK_ERROR"`
 * Branch on `isNetworkError(error)` when the UI needs a localized
 * "check your connection" message instead of the raw `message`.
 */
export class NetworkError extends ApiError {
  /** The underlying `fetch` rejection, kept for debugging. */
  readonly cause?: unknown

  constructor(endpoint: string, cause?: unknown) {
    super(0, "Network request failed", endpoint, "NETWORK_ERROR")
    this.name = "NetworkError"
    this.cause = cause
  }
}

/** Narrows an unknown caught value to a transport failure. */
export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError
}
