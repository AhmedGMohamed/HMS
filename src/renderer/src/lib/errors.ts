/**
 * Lightweight error class for API failures.
 *
 * Components up the tree (DataTable rows, dialog loaders, forms)
 * catch `ApiError` and branch on `statusCode`:
 *   - 401 → auth cleared by api wrapper, no consumer action required.
 *   - 403 → show Sonner `warning` toast ("Insufficient permission").
 *   - 404 → render <EmptyState> with the resource-specific message.
 *   - 5xx → fail back to Sonner `error` toast with retry CTA.
 */
export class ApiError extends Error {
  readonly statusCode: number
  readonly endpoint: string

  constructor(statusCode: number, message: string, endpoint: string) {
    super(message)
    this.name = "ApiError"
    this.statusCode = statusCode
    this.endpoint = endpoint
  }
}
