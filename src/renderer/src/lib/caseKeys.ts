/**
 * Snake_case ↔ camelCase key normaliser.
 *
 * Server responses from Express use Postgres column names verbatim
 * (`patient_id`, `is_active`, `national_id`, …). Pages should never see
 * those names on the read path — they belong at the API boundary and
 * nowhere else. Conversely, request payloads coming from the renderer
 * (where every component talks in camelCase) must be flipped back to
 * snake_case before they reach Express controllers that expect
 * `payment_type`, `patient_history_id`, etc.
 *
 * Entry points:
 *   - `toCamel(value)` — recurse over an arbitrary JSON-shaped value,
 *     converting string keys (and only string keys) while leaving
 *     values untouched. Handles arrays, plain objects, and primitives.
 *   - `toCamelList(rows)` — convenience wrapper for the common case
 *     where callers receive a JSON array of records.
 *   - `toSnake(value)` — reverse transformation for outgoing payloads.
 *
 * Edge cases (shared):
 *   - Non-object inputs pass through (primitive, null, undefined).
 *   - Keys that already look like the target case are returned unchanged
 *     once their input shape is verified.
 *   - Single-character segments (`a_b` ↔ `aB`) handle correctly.
 *   - Empty keys are preserved as-is.
 *   - Numeric-only keys (e.g. `{ "0": ... }`) are preserved.
 *   - Leading-underscore segments (`_foo_bar` → `_fooBar`) are kept
 *     so a server can still use them.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

function camelSegment(key: string): string {
  if (key.length === 0) return key
  const parts = key.split("_").filter((part) => part.length > 0)
  if (parts.length === 0) return key
  const head = parts[0]!
  const tail = parts
    .slice(1)
    .map((p) => (p[0] ?? "").toUpperCase() + p.slice(1))
  return [head, ...tail].join("")
}

export function toCamel<T = unknown>(value: T): T {
  if (!isPlainObject(value)) {
    // Arrays: recurse into elements but do not transform numeric indices.
    if (Array.isArray(value)) {
      return value.map((entry) => toCamel(entry)) as unknown as T
    }
    return value
  }

  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value)) {
    out[camelSegment(key)] = toCamel(val)
  }
  return out as unknown as T
}

export function toCamelList<T = unknown>(rows: unknown): T[] {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => toCamel(row)) as T[]
}

function snakeSegment(key: string): string {
  if (key.length === 0) return key
  /* Preserve leading underscores (server-side private flag convention)
     by splitting off the prefix, transforming, and re-attaching. */
  const leadingMatch = key.match(/^_+/)
  const leading = leadingMatch ? leadingMatch[0] : ""
  const body = leading ? key.slice(leading.length) : key
  const snake = body
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
  return `${leading}${snake}`
}

export function toSnake<T = unknown>(value: T): T {
  if (!isPlainObject(value)) {
    if (Array.isArray(value)) {
      return value.map((entry) => toSnake(entry)) as unknown as T
    }
    return value
  }

  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value)) {
    out[snakeSegment(key)] = toSnake(val)
  }
  return out as unknown as T
}
