/**
 * Shared pagination helpers for Phase 6 list endpoints.
 *
 * The renderer (lib/api.ts + useListData<T>) expects endpoints that
 * return a `PaginatedResponse<T>` envelope:
 *   { data: T[]; total: number; page: number; pageSize: number }
 *
 * This module parses `?page=&pageSize=` from `req.query`, normalizes
 * the values (defaults + bounds), and wraps a callback so each
 * controller's index method can stay declarative:
 *
 *   async getAll(req, res) {
 *     const { offset, limit, page, pageSize } = parsePagination(req)
 *     const { rows, total } = await SomeModel.list({ offset, limit, q })
 *     res.json(buildPage(rows, total, page, pageSize))
 *   }
 *
 * Limits:
 *   - defaultPageSize: 25 (per plan §Phase 6.0 — meets the per-page budget)
 *   - maxPageSize: 100  (hard cap; protects the database from a runaway ?pageSize=10000)
 *   - maxPage: 10000    (no one paginates that deep; sanity bound)
 */

export interface PaginationParams {
  page: number
  pageSize: number
  offset: number
  limit: number
}

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
export const MAX_PAGE = 10000

function asString(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    const head = value[0]
    return typeof head === "string" ? head : undefined
  }
  return undefined
}

function asInt(value: unknown): number | undefined {
  const raw = asString(value)
  if (raw == null) return undefined
  if (raw.trim() === "") return undefined
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min
  if (n > max) return max
  return n
}

/**
 * Parse `req.query` into normalised pagination values.
 *
 * `?page=` defaults to 1; `?pageSize=` defaults to DEFAULT_PAGE_SIZE
 * (25) and is capped at MAX_PAGE_SIZE (100). Both are bounded below
 * at 1.
 */
export function parsePagination(
  req: { query?: Record<string, unknown> | undefined },
  options: { defaultPageSize?: number; maxPageSize?: number } = {}
): PaginationParams {
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE
  const maxPageSize = options.maxPageSize ?? MAX_PAGE_SIZE

  const rawPage = asInt(req.query?.page) ?? 1
  const rawSize = asInt(req.query?.pageSize) ?? defaultPageSize

  const page = clamp(rawPage, 1, MAX_PAGE)
  const pageSize = clamp(rawSize, 1, maxPageSize)

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  }
}

/**
 * Build the `PaginatedResponse<T>` envelope the renderer expects.
 */
export interface PaginatedEnvelope<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export function buildPage<T>(
  rows: T[],
  total: number,
  pagination: PaginationParams
): PaginatedEnvelope<T> {
  return {
    data: rows,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  }
}
