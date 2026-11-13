import { ApiError } from "@/lib/errors"

/**
 * Server failure code → i18n key.
 *
 * The server returns an English `error` string plus a stable `code` for every
 * failure the admin console can branch on. Rendering that string directly would
 * put English into the Arabic UI, and status codes are too coarse (several
 * distinct 400s). So: map the code, fall back to a page-specific message.
 */
const USER_ERROR_KEYS: Record<string, string> = {
  USERNAME_EXISTS: "users.messages.usernameTaken",
  USER_IN_USE: "users.messages.deleteReferenced",
  SYSTEM_ACCOUNT_PROTECTED: "users.messages.systemAccountProtected",
  CANNOT_DELETE_SELF: "users.messages.selfDeleteBlocked",
  CANNOT_CHANGE_OWN_ROLE: "users.messages.selfRoleBlocked",
  CANNOT_DEACTIVATE_SELF: "users.messages.selfDeactivateBlocked",
  ADMIN_ONLY_FIELD: "users.messages.adminOnlyField",
}

const ROLE_ERROR_KEYS: Record<string, string> = {
  ROLE_NAME_EXISTS: "roles.messages.roleNameTaken",
  ROLE_IN_USE: "roles.messages.roleInUse",
  ROLE_NAME_IMMUTABLE: "roles.messages.roleNameImmutable",
  SYSTEM_ROLE_PROTECTED: "roles.messages.systemRoleProtected",
}

function toKeyFrom(
  map: Record<string, string>,
  error: unknown,
  fallback: string
): string {
  if (error instanceof ApiError && error.code) {
    return map[error.code] ?? fallback
  }
  return fallback
}

export function userErrorKey(error: unknown, fallback: string): string {
  return toKeyFrom(USER_ERROR_KEYS, error, fallback)
}

export function roleErrorKey(error: unknown, fallback: string): string {
  return toKeyFrom(ROLE_ERROR_KEYS, error, fallback)
}

/** The server code, if any — used by forms that want a field-level error. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined
}
